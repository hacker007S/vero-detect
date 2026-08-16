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

// Frequent product-listing words that must never fuzzy-match a brand name
// (e.g. "design" is 1 edit from the brand "mDesign").
const COMMON = new Set([
  'design', 'designs', 'glass', 'steel', 'water', 'power', 'clean', 'cover',
  'covers', 'light', 'lights', 'white', 'black', 'green', 'small', 'large',
  'style', 'smart', 'fresh', 'house', 'home', 'kitchen', 'garden', 'travel',
  'sport', 'sports', 'classic', 'premium', 'quality', 'filter', 'filters',
  'holder', 'stand', 'strong', 'super', 'ultra', 'micro', 'plus', 'model',
  'brand', 'pack', 'packs', 'piece', 'pieces', 'family', 'medion', 'series',
]);

export function fuzzyIncludes(textTokens: string[], term: string): boolean {
  if (term.includes(' ') || term.length < 5) return false;
  const max = term.length >= 8 ? 2 : 1;
  return textTokens.some(
    (t) =>
      t.length >= 5 &&
      t[0] === term[0] && // typos rarely change the first letter; kills common-word collisions
      !COMMON.has(t) &&
      Math.abs(t.length - term.length) <= max &&
      t !== term &&
      editDistance(t, term) <= max,
  );
}
