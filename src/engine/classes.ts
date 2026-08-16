import type { CategoryResult, Listing, RuleHit, RulesPack } from '../types';
import { worst } from '../types';
import { containsPhrase, normalize, tokens } from './normalize';

export function checkClasses(
  listing: Listing,
  pack: RulesPack,
  category: 'prohibited' | 'sensitive' | 'fragile',
): CategoryResult {
  const raw = [
    listing.title,
    (listing.description ?? '').slice(0, 2000),
    listing.material ?? '',
  ].join(' ');
  const toks = tokens(raw);
  const hits: RuleHit[] = [];

  for (const cls of pack.classes.filter((c) => c.category === category)) {
    const kwHit = cls.keywords.find((kw) => containsPhrase(toks, normalize(kw)));
    const reHit = cls.patterns?.find((p) => new RegExp(p, 'i').test(raw));
    if (!kwHit && !reHit) continue;
    hits.push({
      ruleId: `class:${cls.id}`,
      level: cls.level,
      label: cls.label,
      detail: `Matched ${kwHit ? `"${kwHit}"` : `pattern /${reHit}/`}.`,
      action: cls.action,
      link: cls.policyUrl,
    });
  }

  return { category, level: hits.length ? worst(hits.map((h) => h.level)) : 'clear', hits };
}
