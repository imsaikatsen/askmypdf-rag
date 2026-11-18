import fs from "node:fs";
import { extractPages } from "./pdf.js";
import { chunkPages } from "./chunk.js";
import { embed } from "./embed.js";
import { addChunks, hasFile, search } from "./store.js";

const FILE = "sample.pdf";

// --- Indexing: ---
if (hasFile(FILE)) {
  console.log("Already indexed, skipping embedding.\n");
} else {
  const pages = await extractPages(fs.readFileSync(`samples/${FILE}`));
  const chunks = chunkPages(pages, 300, 50); // ছোট PDF, তাই ছোট chunk
  const vectors = await embed(chunks.map((c) => c.text));
  addChunks(chunks.map((c, i) => ({ ...c, file: FILE, vector: vectors[i] })));
  console.log(`Indexed ${chunks.length} chunks.\n`);
}

// --- Retrieval: ---
const questions = [
  "Which universities accept GRE score 290-300?",
  "how to bake a chocolate cake",
];

for (const q of questions) {
  const [qVec] = await embed([q]);
  const hits = search(qVec, 3);

  console.log(`❓ ${q}`);
  hits.forEach((h) => {
    console.log(`  score ${h.score.toFixed(3)} | page ${h.page} | ${h.text.slice(0, 80)}...`);
  });
  console.log();
}