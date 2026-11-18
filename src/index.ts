import fs from "node:fs";
import { extractPages } from "./pdf.js";
import { chunkPages } from "./chunk.js";

const buf = fs.readFileSync("samples/sample.pdf");
const pages = await extractPages(buf);
const chunks = chunkPages(pages, 300, 50);

console.log(`Pages: ${pages.length}, Chunks: ${chunks.length}\n`);
chunks.forEach((c) => {
  console.log(`[${c.id}] page ${c.page}, ${c.text.length} chars`);
  console.log(`  start: ${c.text.slice(0, 60)}`);
  console.log(`  end : ${c.text.slice(-60)}\n`);
});