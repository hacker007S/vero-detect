import { describe, expect, it } from 'vitest';
import { checkVero } from '../../src/engine/vero';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'aliexpress', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('checkVero', () => {
  it('flags a direct VeRO brand as danger', () => {
    const r = checkVero(listing('Dyson V8 Vacuum Filter Replacement'), pack);
    expect(r.level).toBe('danger');
    expect(r.hits[0].label).toMatch(/dyson/i);
  });
  it('flags curated additions (Apple via alias magsafe)', () => {
    const r = checkVero(listing('Magsafe Wireless Charger 15W'), pack);
    expect(r.level).toBe('danger');
    expect(r.hits[0].detail).toMatch(/Apple/);
  });
  it('gives caution for compatible-wording usage', () => {
    const r = checkVero(listing('Filter for Dyson V8 Animal cordless vacuum'), pack);
    expect(r.level).toBe('caution');
    expect(r.hits[0].action).toMatch(/compatible with/i);
  });
  it('never flags confirmedSafe brands as danger', () => {
    const r = checkVero(listing('Water Filter for Sage Barista Express'), pack);
    expect(r.hits.every((h) => h.level !== 'danger')).toBe(true);
  });
  it('catches fuzzy misspellings', () => {
    const r = checkVero(listing('Dysson cordless vacuum spare part'), pack);
    expect(r.level).toBe('danger');
  });
  it('is clear for unbranded items', () => {
    const r = checkVero(listing('Strimmer Spool Line 1.65mm 15m Refill'), pack);
    expect(r.level).toBe('clear');
    expect(r.hits).toEqual([]);
  });
});
