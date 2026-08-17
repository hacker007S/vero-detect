import { describe, expect, it } from 'vitest';
import { checkSize } from '../../src/engine/size';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const size = bundledPack().size;
const base: Listing = { site: 'amazon', url: 'https://x', title: 't', images: [], missing: [] };

describe('checkSize', () => {
  it('clear + note when it fits large letter', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 30, w: 20, h: 2 }, weightG: 300 }, size);
    expect(r.level).toBe('clear');
    expect(r.note).toMatch(/large letter/i);
  });
  it('caution when over large letter, with Simple Delivery warning above £20', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 40, w: 30, h: 10 }, weightG: 900, priceGBP: 24.99 }, size);
    expect(r.level).toBe('caution');
    expect(r.hits.map((h) => h.detail).join(' ')).toMatch(/£2\.94/);
  });
  it('danger for huge items', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 120, w: 40, h: 40 } }, size);
    expect(r.level).toBe('danger');
  });
  it('unknown when no dimensions or weight', () => {
    const r = checkSize(base, size);
    expect(r.level).toBe('unknown');
    expect(r.note).toMatch(/check manually/i);
  });
  it('sorted-fit: 25 x 35 x 2 still fits large letter', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 25, w: 35, h: 2 }, weightG: 100 }, size);
    expect(r.level).toBe('clear');
  });
  it('two known sides that fit → unknown with informative note, not caution', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 20, w: 15 } }, size);
    expect(r.level).toBe('unknown');
    expect(r.note).toMatch(/20 cm × 15 cm/);
  });
  it('two known sides that breach the limit → caution', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 50, w: 15 } }, size);
    expect(r.level).toBe('caution');
  });
  it('weight only, within limit → unknown with note', () => {
    const r = checkSize({ ...base, weightG: 300 }, size);
    expect(r.level).toBe('unknown');
    expect(r.note).toMatch(/300 g/);
  });
});
