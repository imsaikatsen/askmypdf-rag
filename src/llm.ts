import { GoogleGenAI } from "@google/genai";
import type { Hit } from "./store.js";

const ai = new GoogleGenAI({});
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const SYSTEM = `You answer questions about a PDF document using ONLY the numbered context passages provided.
- After each claim, cite the passage number like [1] or [2].
- If the context does not contain the answer, say you could not find it in the document. Do not guess.
- Reply in the same language as the question.`;

export async function answer(question: string, hits: Hit[]): Promise<string> {
  const context = hits
    .map((h, i) => `[${i + 1}] (page ${h.page})\n${h.text}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Context:\n${context}\n\nQuestion: ${question}`,
    config: { systemInstruction: SYSTEM },
  });

  return response.text ?? "";
}