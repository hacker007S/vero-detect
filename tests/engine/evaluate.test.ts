import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/engine/evaluate';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'aliexpress', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('evaluate — known answers', () => {
  it('Dyson filter → danger via vero', () => {
    const v = evaluate(listing('Dyson V8 replacement filter'), pack);
    expect(v.overall).toBe('danger');
    expect(v.categories.find((c) => c.category === 'vero')?.level).toBe('danger');
  });
  it('kitchen knife → danger via prohibited', () => {
    const v = evaluate(listing('Stainless kitchen knife set'), pack);
    expect(v.categories.find((c) => c.category === 'prohibited')?.level).toBe('danger');
  });
  it('glass teapot → caution via fragile', () => {
    const v = evaluate(
      listing('Glass teapot with infuser', { dimensionsCm: { l: 20, w: 15, h: 2 }, weightG: 300 }),
      pack,
    );
    expect(v.overall).toBe('caution');
    expect(v.categories.find((c) => c.category === 'fragile')?.level).toBe('caution');
  });
  it('unbranded strimmer spool, letter-size → overall clear', () => {
    const v = evaluate(
      listing('Strimmer Spool Line 1.65mm Refill', { dimensionsCm: { l: 10, w: 10, h: 2 }, weightG: 50 }),
      pack,
    );
    expect(v.overall).toBe('clear');
  });
  it('missing dimensions can never be overall clear', () => {
    const v = evaluate(listing('Strimmer Spool Line Refill'), pack);
    expect(v.overall).toBe('unknown');
  });
  it('categories come in fixed order and verdict carries rules metadata', () => {
    const v = evaluate(listing('anything'), pack);
    expect(v.categories.map((c) => c.category)).toEqual([
      'vero', 'prohibited', 'branded', 'size', 'sensitive', 'fragile', 'dropship',
    ]);
    expect(v.rulesVersion).toBe(pack.version);
    expect(v.checkedAt).toBeGreaterThan(0);
  });
  it('dropship: AliExpress item over £3.40 fails the cost gate', () => {
    const v = evaluate(listing('Cable organiser box', { priceGBP: 5.99, dimensionsCm: { l: 10, w: 8, h: 2 }, weightG: 90 }), pack);
    const d = v.categories.find((c) => c.category === 'dropship')!;
    expect(d.level).toBe('caution');
    expect(d.hits[0].ruleId).toBe('dropship:cost-gate');
  });
  it('dropship: cheap AliExpress item passes with a note; eBay items skip the gate', () => {
    const v = evaluate(listing('Cable organiser box', { priceGBP: 2.1 }), pack);
    const d = v.categories.find((c) => c.category === 'dropship')!;
    expect(d.level).toBe('clear');
    expect(d.note).toMatch(/passes/);
    const e = evaluate({ ...listing('Cable organiser'), site: 'ebay', priceGBP: 9.99 }, pack);
    expect(e.categories.find((c) => c.category === 'dropship')!.hits).toEqual([]);
  });
  it('dropship: Choice packaging and apparel flags', () => {
    const v = evaluate(listing('Running trainers breathable', { priceGBP: 3.0, choice: true }), pack);
    const d = v.categories.find((c) => c.category === 'dropship')!;
    const ids = d.hits.map((h) => h.ruleId);
    expect(ids).toContain('dropship:choice-packaging');
    expect(ids).toContain('class:high-return-apparel');
  });
});
