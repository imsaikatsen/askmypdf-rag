import { pipeline } from "@huggingface/transformers";

let extractor: any;

async function getExtractor() {
  extractor ??= await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "q8",
  });
  return extractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const ex = await getExtractor();
  const out: number[][] = [];
  for (const t of texts) {
    const r = await ex(t, { pooling: "mean", normalize: true });
    out.push(Array.from(r.data as Float32Array));
  }
  return out;
}