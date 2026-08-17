export type Site = 'aliexpress' | 'ebay' | 'amazon';
export type Level = 'clear' | 'caution' | 'danger' | 'unknown';
export type CategoryId =
  | 'vero' | 'prohibited' | 'branded' | 'size' | 'sensitive' | 'fragile' | 'dropship';

export interface Listing {
  site: Site;
  url: string;
  title: string;
  brand?: string;
  description?: string;
  priceGBP?: number;
  images: string[];
  dimensionsCm?: { l?: number; w?: number; h?: number };
  weightG?: number;
  material?: string;
  /** AliExpress "Choice" listing — ships in AliExpress-branded packaging */
  choice?: boolean;
  missing: string[];
}

export interface RuleHit {
  ruleId: string;
  level: 'caution' | 'danger';
  label: string;
  detail: string;
  action?: string;
  link?: string;
}

export interface CategoryResult {
  category: CategoryId;
  level: Level;
  hits: RuleHit[];
  note?: string;
}

export interface Verdict {
  overall: Level;
  categories: CategoryResult[];
  rulesVersion: string;
  rulesFetchedAt: number;
  checkedAt: number;
}

export interface VeroBrand {
  name: string;
  profile?: string;
  source: 'official' | 'curated' | 'local';
  confirmedSafe?: boolean;
}

export interface KeywordClass {
  id: string;
  category: 'prohibited' | 'sensitive' | 'fragile' | 'dropship';
  level: 'caution' | 'danger';
  label: string;
  keywords: string[];
  patterns?: string[];
  policyUrl?: string;
  action: string;
}

export interface SizeRules {
  largeLetter: { l: number; w: number; h: number; weightG: number };
  simpleDeliveryPriceGBP: number;
  hugeSideCm: number;
  hugeWeightG: number;
}

export interface RulesPack {
  version: string;
  fetchedAt: number;
  veroBrands: VeroBrand[];
  /** famous brands eligible for fuzzy (misspelling) matching — obscure brands match exactly only */
  fuzzyBrands: string[];
  aliases: Record<string, string>;
  topBrands: string[];
  classes: KeywordClass[];
  size: SizeRules;
}

export const LEVEL_RANK: Record<Level, number> = { danger: 3, caution: 2, unknown: 1, clear: 0 };
export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), 'clear');
}
