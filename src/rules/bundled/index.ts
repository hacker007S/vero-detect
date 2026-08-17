import type { RulesPack, VeroBrand } from '../../types';
import seed from '../../../data/vero-brands-seed.json';
import curated from './curated-pack.json';

interface SeedEntry { name: string; profile: string; }

export function bundledPack(): RulesPack {
  const officialNames = (seed as SeedEntry[]).map((b) => b.name.toLowerCase());
  const brands: VeroBrand[] = (seed as SeedEntry[]).map((b) => ({
    name: b.name, profile: b.profile, source: 'official',
  }));
  for (const name of curated.veroAdditions) {
    const lower = name.toLowerCase();
    const dupe = officialNames.some(
      (o) => o === lower || o.startsWith(lower + ' ') || o.startsWith(lower + ','),
    );
    if (!dupe) brands.push({ name, source: 'curated' });
  }
  for (const name of curated.confirmedSafe) {
    brands.push({ name, source: 'curated', confirmedSafe: true });
  }
  return {
    version: curated.version,
    fetchedAt: 0,
    veroBrands: brands,
    fuzzyBrands: curated.fuzzyBrands,
    aliases: curated.aliases as Record<string, string>,
    topBrands: curated.topBrands,
    classes: curated.classes as RulesPack['classes'],
    size: curated.size,
  };
}
