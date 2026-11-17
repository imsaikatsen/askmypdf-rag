import fs from "node:fs";
import { extractPages } from "./pdf.js";

const buf = fs.readFileSync("samples/sample.pdf");
const pages = await extractPages(buf);

console.log(`Total pages: ${pages.length}`);
pages.forEach((text, i) => {
  console.log(`\n--- Page ${i + 1} (${text.length} chars) ---`);
  console.log(text.slice(0, 200));
});