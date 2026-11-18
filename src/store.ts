import fs from "node:fs";
import path from "node:path";
import type { Chunk } from "./chunk.js";
import { cosine } from "./math.js";

export interface StoredChunk extends Chunk {
  file: string;
  vector: number[];
}
export interface Hit extends StoredChunk {
  score: number;
}

const FILE = path.join("data", "store.json");

function load(): StoredChunk[] {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];
}

function save(items: StoredChunk[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(items));
}

export function hasFile(file: string): boolean {
  return load().some((c) => c.file === file);
}

export function addChunks(items: StoredChunk[]) {
  save([...load(), ...items]);
}

export function search(queryVec: number[], k = 3): Hit[] {
  return load()
    .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}