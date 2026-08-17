import type { Listing, RulesPack, Verdict } from '../types';
import { worst } from '../types';
import { checkVero } from './vero';
import { checkClasses } from './classes';
import { checkBranded } from './branded';
import { checkSize } from './size';
import { checkDropship } from './dropship';

export function evaluate(listing: Listing, pack: RulesPack): Verdict {
  const vero = checkVero(listing, pack);
  const veroFlagged = new Set(vero.hits.map((h) => h.label.split(' → ').pop() ?? h.label));
  const categories = [
    vero,
    checkClasses(listing, pack, 'prohibited'),
    checkBranded(listing, pack, veroFlagged),
    checkSize(listing, pack.size),
    checkClasses(listing, pack, 'sensitive'),
    checkClasses(listing, pack, 'fragile'),
    checkDropship(listing, pack),
  ];
  return {
    overall: worst(categories.map((c) => c.level)),
    categories,
    rulesVersion: pack.version,
    rulesFetchedAt: pack.fetchedAt,
    checkedAt: Date.now(),
  };
}
