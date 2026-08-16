const SUFFIXES = new Set([
  'inc', 'ltd', 'llc', 'gmbh', 'co', 'company', 'corp', 'corporation', 'spa',
  'plc', 'limited', 'group', 'holdings', 'international', 'intl', 'sa', 'ag',
  'bv', 'srl', 'kg', 'uk', 'usa', 'brands', 'industries', 'enterprises',
  'technology', 'technologies', 'systems', 'products', 'america', 'europe',
  'global', 'worldwide', 'licensing', 'trademark', 'trademarks',
]);
const GENERIC = new Set([
  'the', 'a', 'an', 'it', 'one', 'all', 'pro', 'plus', 'home', 'life', 'best',
  'new', 'you', 'my', 'top', 'first', 'and', 'of', 'for',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export function containsPhrase(textTokens: string[], phrase: string): boolean {
  const p = phrase.split(' ');
  if (p.length === 0 || p[0] === '') return false;
  outer: for (let i = 0; i <= textTokens.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) {
      if (textTokens[i + j] !== p[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function brandMatchTerm(name: string): string {
  const words = tokens(name).filter((w) => !GENERIC.has(w));
  while (
    words.length > 1 &&
    (SUFFIXES.has(words[words.length - 1]) || words[words.length - 1].length === 1)
  ) {
    words.pop();
  }
  if (words.length === 1 && (SUFFIXES.has(words[0]) || GENERIC.has(words[0]))) return '';
  const term = words.join(' ');
  if (term.length < 2) return '';
  if (term.length < 3 && !/\d/.test(term)) return '';
  return term;
}
