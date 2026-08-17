import englishWords from '../rules/bundled/english-words.json';

export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// A token that is a genuine English word is never a "typo" of a brand name —
// this is what stops "Spring" flagging Sprint and "design" flagging mDesign.
// Real typos ("dysson") are not dictionary words, so detection is unaffected.
const DICTIONARY = new Set<string>(englishWords as string[]);

export function isCommonWord(w: string): boolean {
  return DICTIONARY.has(w);
}

export function fuzzyIncludes(textTokens: string[], term: string): boolean {
  if (term.includes(' ') || term.length < 5) return false;
  const max = term.length >= 8 ? 2 : 1;
  return textTokens.some(
    (t) =>
      t.length >= 5 &&
      t[0] === term[0] && // typos rarely change the first letter
      !DICTIONARY.has(t) &&
      Math.abs(t.length - term.length) <= max &&
      t !== term &&
      editDistance(t, term) <= max,
  );
}
