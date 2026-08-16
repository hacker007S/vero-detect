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
      'vero', 'prohibited', 'branded', 'size', 'sensitive', 'fragile',
    ]);
    expect(v.rulesVersion).toBe(pack.version);
    expect(v.checkedAt).toBeGreaterThan(0);
  });
});
