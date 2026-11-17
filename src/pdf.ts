import { PDFParse } from "pdf-parse";

export async function extractPages(buf: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.pages
      .sort((a, b) => a.num - b.num)
      .map((p) => p.text.replace(/\s+/g, " ").trim());
  } finally {
    await parser.destroy();
  }
}