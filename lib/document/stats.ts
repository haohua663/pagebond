export function countText(text: string): { chars: number; words: number } {
  const chars = [...text.replace(/\s/g, "")].length;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g)?.length ?? 0;
  return { chars, words: cjk + words };
}

export function documentChars(blocks: { text: string }[]): number {
  return countText(blocks.map((block) => block.text).join("\n")).chars;
}
