import type { CategoryResult, Listing, RuleHit, RulesPack, VeroBrand } from '../types';
import { worst } from '../types';
import { brandMatchTerm, containsPhrase, normalize, tokens } from './normalize';
import { fuzzyIncludes, isCommonWord } from './fuzzy';

const COMPAT = [
  'compatible with', 'for', 'fits', 'to fit', 'fit for', 'replacement for',
  'designed for', 'suits', 'suitable for', 'works with',
];

export function isCompatUsage(normText: string, term: string): boolean {
  let idx = normText.indexOf(term);
  if (idx === -1) return false;
  while (idx !== -1) {
    const boundedStart = idx === 0 || normText[idx - 1] === ' ';
    const before = normText.slice(Math.max(0, idx - 30), idx).trim();
    if (boundedStart && !COMPAT.some((c) => before.endsWith(c))) return false;
    idx = normText.indexOf(term, idx + term.length);
  }
  return true;
}

const SAFE_WORDING =
  'Use "compatible with" / "for" / "fits" + brand, your own photos, no manufacturer logo, and never imply the item is genuine.';

// brand match terms are derived once per pack, not once per page check
const termCache = new WeakMap<RulesPack, { brand: VeroBrand; term: string }[]>();
function brandTerms(pack: RulesPack): { brand: VeroBrand; term: string }[] {
  let cached = termCache.get(pack);
  if (!cached) {
    const famous = new Set(pack.fuzzyBrands.map((n) => brandMatchTerm(n)).filter(Boolean));
    cached = pack.veroBrands
      .map((brand) => {
        let term = brandMatchTerm(brand.name);
        // an obscure brand whose name reduces to a plain English word
        // ("Authentic Brands Group" → "authentic") must match a two-word
        // phrase, or every listing saying "authentic" gets flagged
        if (term && !term.includes(' ') && isCommonWord(term) && !famous.has(term)) {
          const words = tokens(brand.name).filter((w) => w.length > 1);
          if (words.length >= 2) term = words.slice(0, 2).join(' ');
        }
        return { brand, term };
      })
      .filter((e) => e.term !== '');
    termCache.set(pack, cached);
  }
  return cached;
}

function searchText(listing: Listing): { toks: string[]; norm: string } {
  const raw = [listing.title, listing.brand ?? '', (listing.description ?? '').slice(0, 1000)].join(' ');
  const norm = normalize(raw);
  return { toks: norm ? norm.split(' ') : [], norm };
}

export function checkVero(listing: Listing, pack: RulesPack): CategoryResult {
  const { toks, norm } = searchText(listing);
  const hits: RuleHit[] = [];
  const seen = new Set<string>();

  const addHit = (brand: VeroBrand, term: string, fuzzy: boolean) => {
    if (seen.has(brand.name) || brand.confirmedSafe) return;
    seen.add(brand.name);
    const compat = !fuzzy && isCompatUsage(norm, term);
    hits.push({
      ruleId: `vero:${term}`,
      level: compat ? 'caution' : 'danger',
      label: brand.name,
      detail: compat
        ? `"${brand.name}" appears only in compatible-accessory wording. Listable with the safe-wording rules.`
        : `${brand.name} is a VeRO ${brand.source === 'official' ? 'participant' : 'enforcer (curated list — not on eBay’s public page)'}${fuzzy ? ' (near-miss spelling detected)' : ''}. Listing risks takedown and account strikes.`,
      action: compat
        ? SAFE_WORDING
        : 'Do not list this item, or remove every trace of the brand (name, model marketing names, logos in images).',
      link: brand.profile,
    });
  };

  // fuzzy (misspelling) matching only applies to famous brands — counterfeiters
  // misspell "Dyson", nobody misspells "Spicer Pro, LLC"; obscure brands were
  // false-matching common product words (slicer → Spicer)
  const fuzzyTerms = new Set(
    pack.fuzzyBrands.map((n) => brandMatchTerm(n)).filter((t) => t !== ''),
  );
  for (const { brand, term } of brandTerms(pack)) {
    if (containsPhrase(toks, term)) addHit(brand, term, false);
    else if (fuzzyTerms.has(term) && fuzzyIncludes(toks, term)) addHit(brand, term, true);
  }

  const brandByName = new Map(pack.veroBrands.map((b) => [b.name.toLowerCase(), b] as const));
  for (const [alias, canonical] of Object.entries(pack.aliases)) {
    const aliasNorm = normalize(alias);
    if (!containsPhrase(toks, aliasNorm)) continue;
    const brand =
      brandByName.get(canonical.toLowerCase()) ??
      ({ name: canonical, source: 'curated' } as VeroBrand);
    if (seen.has(brand.name) || brand.confirmedSafe) continue;
    seen.add(brand.name);
    const compat = isCompatUsage(norm, aliasNorm);
    hits.push({
      ruleId: `vero-alias:${alias}`,
      level: compat ? 'caution' : 'danger',
      label: `${alias} → ${canonical}`,
      detail: compat
        ? `"${alias}" (implies ${canonical}) appears only in compatible wording.`
        : `"${alias}" implies ${canonical}, a VeRO enforcer. Trademarked product names count as brand use.`,
      action: compat ? SAFE_WORDING : `Remove "${alias}" from title/description, or do not list.`,
    });
  }

  return {
    category: 'vero',
    level: hits.length ? worst(hits.map((h) => h.level)) : 'clear',
    hits,
  };
}
