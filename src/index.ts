import "dotenv/config";
import fs from "node:fs";
import { extractPages } from "./pdf.js";
import { chunkPages } from "./chunk.js";
import { embed } from "./embed.js";
import { addChunks, hasFile, search } from "./store.js";
import { answer } from "./llm.js";

const FILE = "sample.pdf";
const MIN_SCORE = 0.3; // এর নিচের chunk অপ্রাসঙ্গিক ধরে বাদ

// --- Indexing: একবারই ---
if (!hasFile(FILE)) {
  const pages = await extractPages(fs.readFileSync(`samples/${FILE}`));
  const chunks = chunkPages(pages, 300, 50);
  const vectors = await embed(chunks.map((c) => c.text));
  addChunks(chunks.map((c, i) => ({ ...c, file: FILE, vector: vectors[i] })));
}

// --- প্রশ্ন-উত্তর ---
async function ask(question: string) {
  console.log(`\n❓ ${question}`);

  const [qVec] = await embed([question]);
  const hits = search(qVec, 3).filter((h) => h.score >= MIN_SCORE);

  if (hits.length === 0) {
    console.log("💬 No relevant information found in this document. (LLM was not called)");
    return;
  }

  const text = await answer(question, hits);
  console.log(`💬 ${text}`);
  console.log("\n📚 Sources:");
  hits.forEach((h, i) =>
    console.log(`  [${i + 1}] page ${h.page} (score ${h.score.toFixed(2)}): ${h.text.slice(0, 70)}...`)
  );
}

await ask("Which universities accept GRE score 290-300?");
await ask("Which university has the best football team?");