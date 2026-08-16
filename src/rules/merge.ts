import type { RulesPack, VeroBrand } from '../types';

export interface LocalOverrides { addBrands?: string[]; ignoreBrands?: string[]; }

interface CuratedShape {
  version: string; veroAdditions: string[]; confirmedSafe: string[];
  aliases: Record<string, string>; topBrands: string[];
  classes: RulesPack['classes']; size: RulesPack['size'];
}

export function mergeRules(
  bundled: RulesPack,
  official?: { brands: VeroBrand[]; fetchedAt: number },
  curated?: unknown,
  local?: LocalOverrides,
): RulesPack {
  const c = (curated ?? null) as CuratedShape | null;
  const officialBrands = official?.brands ?? bundled.veroBrands.filter((b) => b.source === 'official');
  const officialLower = officialBrands.map((b) => b.name.toLowerCase());

  const additions = c
    ? c.veroAdditions
    : bundled.veroBrands.filter((b) => b.source === 'curated' && !b.confirmedSafe).map((b) => b.name);
  const safe = c
    ? c.confirmedSafe
    : bundled.veroBrands.filter((b) => b.confirmedSafe).map((b) => b.name);

  const brands: VeroBrand[] = [...officialBrands];
  for (const name of additions) {
    const lower = name.toLowerCase();
    const dupe = officialLower.some(
      (o) => o === lower || o.startsWith(lower + ' ') || o.startsWith(lower + ','),
    );
    if (!dupe) brands.push({ name, source: 'curated' });
  }
  for (const name of safe) brands.push({ name, source: 'curated', confirmedSafe: true });
  for (const name of local?.addBrands ?? []) {
    if (!brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      brands.push({ name, source: 'local' });
    }
  }
  for (const name of local?.ignoreBrands ?? []) {
    const lower = name.toLowerCase();
    for (const b of brands) if (b.name.toLowerCase() === lower) b.confirmedSafe = true;
  }

  return {
    version: c?.version ?? bundled.version,
    fetchedAt: official?.fetchedAt ?? bundled.fetchedAt,
    veroBrands: brands,
    aliases: c?.aliases ?? bundled.aliases,
    topBrands: c?.topBrands ?? bundled.topBrands,
    classes: c?.classes ?? bundled.classes,
    size: c?.size ?? bundled.size,
  };
}
