/** Split text into sentences, keeping the closing punctuation. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？!?；;\n]+(?:[。！？!?；;]+[”’"')）\]]*|\n|$)|[^.]+?(?:\.(?=\s|$)|$)/g) ?? [];
  const out: string[] = [];
  for (const raw of parts) {
    // Further split English sentences on ". " when the chunk is long.
    for (const piece of raw.split(/(?<=[.](?:["')\]]*))\s+(?=[A-Z0-9“"(])/)) {
      const trimmed = piece.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

export type SentencePair = { before: string; after: string };

/** Pair up only the sentences that changed between two versions of a paragraph. */
export function changedSentencePairs(before: string, after: string): SentencePair[] {
  if (before === after) return [];
  const a = splitSentences(before);
  const b = splitSentences(after);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: SentencePair[] = [];
  let i = 0;
  let j = 0;
  let gapA: string[] = [];
  let gapB: string[] = [];
  const flush = () => {
    if (gapA.length || gapB.length) pairs.push({ before: gapA.join(" "), after: gapB.join(" ") });
    gapA = [];
    gapB = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      gapB.push(b[j]);
      j += 1;
    } else {
      gapA.push(a[i]);
      i += 1;
    }
  }
  flush();
  return pairs;
}
