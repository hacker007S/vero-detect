import type { CategoryResult, Listing, RuleHit, RulesPack } from '../types';
import { brandMatchTerm, containsPhrase, normalize, tokens } from './normalize';
import { isCompatUsage } from './vero';

export function checkBranded(
  listing: Listing,
  pack: RulesPack,
  veroFlaggedNames: Set<string>,
): CategoryResult {
  const raw = [listing.title, listing.brand ?? '', (listing.description ?? '').slice(0, 1000)].join(' ');
  const toks = tokens(raw);
  const norm = normalize(raw);
  const hits: RuleHit[] = [];

  for (const brand of pack.topBrands) {
    if (veroFlaggedNames.has(brand)) continue;
    const term = brandMatchTerm(brand);
    if (!term || !containsPhrase(toks, term)) continue;
    if (isCompatUsage(norm, term)) continue; // compatible accessory — the good pattern
    hits.push({
      ruleId: `branded:${term}`,
      level: 'caution',
      label: brand,
      detail: `Branded item (${brand}). Off-VeRO brands can still file IP complaints, and genuine branded stock is rarely sourceable from AliExpress (genuine-branded-only failure mode).`,
      action: 'Prefer an unbranded or model-coded alternative, or switch to "compatible with" accessory wording.',
    });
  }

  return { category: 'branded', level: hits.length ? 'caution' : 'clear', hits };
}
