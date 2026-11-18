import "dotenv/config";
import express from "express";
import type { ErrorRequestHandler } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { extractPages } from "./pdf.js";
import { chunkPages } from "./chunk.js";
import { embed } from "./embed.js";
import { addChunks, type Hit, type StoredChunk } from "./store.js";
import { answer } from "./llm.js";
import { cosine } from "./math.js";

interface Doc { docId: string; file: string; chunks: number; storageKey: string }
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const indexFile = path.join(publicDir, "index.html");
if (!fs.existsSync(indexFile)) throw new Error(`UI entry point not found: ${indexFile}`);
const docsPath = path.join("data", "docs.json");
const chunksPath = path.join("data", "store.json");
const readDocs = (): Doc[] => fs.existsSync(docsPath) ? JSON.parse(fs.readFileSync(docsPath, "utf8")) as Doc[] : [];
const writeDocs = (docs: Doc[]) => { fs.mkdirSync(path.dirname(docsPath), { recursive: true }); fs.writeFileSync(docsPath, JSON.stringify(docs, null, 2)); };

app.use(express.json());
app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(indexFile));

// Upload a PDF, extract its pages, split them into chunks, and store their embeddings.
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Choose a PDF file to upload." }); return; }
    if (file.mimetype !== "application/pdf" || !file.originalname.toLowerCase().endsWith(".pdf")) {
      res.status(400).json({ error: "This file does not look like a PDF. Please choose a .pdf file." }); return;
    }
    const pages = await extractPages(file.buffer);
    const chunks = chunkPages(pages, 800, 150);
    if (chunks.length === 0) { res.status(422).json({ error: "No readable text was found. This PDF may be scanned; try an OCR searchable PDF." }); return; }
    const vectors = await embed(chunks.map((chunk) => chunk.text));
    const docId = randomUUID();
    const safeName = path.basename(file.originalname).replace(/[\r\n]/g, "_");
    const storageKey = `${docId}::${safeName}`;
    addChunks(chunks.map((chunk, i) => ({ ...chunk, file: storageKey, vector: vectors[i] })));
    writeDocs([...readDocs(), { docId, file: safeName, chunks: chunks.length, storageKey }]);
    res.json({ docId, file: safeName, pages: pages.length, chunks: chunks.length });
  } catch (error) {
    console.error("PDF upload failed:", error);
    res.status(500).json({ error: "The PDF could not be processed. Check that it is valid and try again." });
  }
});

// Find the most relevant passages, optionally limiting the search to one document.
app.post("/ask", async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const docId = typeof req.body?.docId === "string" ? req.body.docId : undefined;
    if (!question) { res.status(400).json({ error: "Enter a question first." }); return; }
    const docs = readDocs();
    const selected = docId ? docs.filter((doc) => doc.docId === docId) : docs;
    if (docId && selected.length === 0) { res.status(404).json({ error: "That document is no longer available. Refresh the page and try again." }); return; }
    const query = (await embed([question]))[0];
    const all = fs.existsSync(chunksPath) ? JSON.parse(fs.readFileSync(chunksPath, "utf8")) as StoredChunk[] : [];
    const keys = new Set(selected.map((doc) => doc.storageKey));
    const hits: Hit[] = all.filter((chunk) => keys.has(chunk.file))
      .map((chunk) => ({ ...chunk, score: cosine(query, chunk.vector) }))
      .sort((a, b) => b.score - a.score).slice(0, 4);
    if (!hits.length) { res.status(404).json({ error: "No indexed text is available for this search." }); return; }
    const result = await answer(question, hits);
    res.json({ answer: result, sources: hits.map((hit, i) => ({ n: i + 1, file: docs.find((doc) => doc.storageKey === hit.file)?.file ?? hit.file, page: hit.page, score: hit.score, snippet: hit.text })) });
  } catch (error) {
    console.error("Question failed:", error);
    res.status(500).json({ error: "I couldn't answer that right now. Check your API configuration and try again." });
  }
});

// Return the indexed document list used by the sidebar and search selector.
app.get("/docs", (_req, res) => res.json(readDocs().map(({ storageKey: _storageKey, ...doc }) => doc)));

// Remove a document's passages from the vector store and its metadata entry.
app.delete("/docs/:id", (req, res) => {
  const docs = readDocs();
  const target = docs.find((doc) => doc.docId === req.params.id);
  if (!target) { res.status(404).json({ error: "Document not found." }); return; }
  if (fs.existsSync(chunksPath)) {
    const items = JSON.parse(fs.readFileSync(chunksPath, "utf8")) as StoredChunk[];
    fs.writeFileSync(chunksPath, JSON.stringify(items.filter((chunk) => chunk.file !== target.storageKey)));
  }
  writeDocs(docs.filter((doc) => doc.docId !== target.docId));
  res.json({ ok: true });
});

// Return upload and request parsing failures as concise JSON for the browser UI.
const handleApiError: ErrorRequestHandler = (error, _req, res, _next) => {
  const code = (error as { code?: string }).code;
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "This PDF is larger than the 30 MB upload limit." });
    return;
  }
  console.error("Request failed:", error);
  res.status(400).json({ error: "The request could not be processed. Check the file or request data and try again." });
};
app.use(handleApiError);

const port = Number(process.env.PORT) || 3005;
const server = app.listen(port, () => {
  console.log(`AskMyPDF is running at http://localhost:${port}`);
  console.log(`Serving the UI from ${indexFile}`);
});
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Stop the other server, then run npm run dev again.`);
  else console.error("Could not start AskMyPDF:", error);
  process.exitCode = 1;
});
