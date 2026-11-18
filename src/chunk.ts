export interface Chunk {
  id: string;
  page: number;
  text: string;
}

const MIN_CHARS = 40; 


export function chunkPages(pages: string[], size = 800, overlap = 150): Chunk[] {
  const chunks: Chunk[] = [];

  pages.forEach((text, i) => {
    const page = i + 1;
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + size, text.length);


      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start + size / 2) end = lastSpace;
      }

      const piece = text.slice(start, end).trim();
      if (piece.length >= MIN_CHARS) {
        chunks.push({ id: `p${page}-${start}`, page, text: piece });
      }

      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1); 
    }
  });

  return chunks;
}