import { describe, expect, it } from 'vitest';
import { checkBranded } from '../../src/engine/branded';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string): Listing => ({
  site: 'amazon', url: 'https://x', title, images: [], missing: [],
});

describe('checkBranded', () => {
  it('cautions on a non-VeRO brand used directly', () => {
    const r = checkBranded(listing('Ninja Air Fryer Basket Genuine Part'), pack, new Set());
    expect(r.level).toBe('caution');
    expect(r.hits[0].detail).toMatch(/genuine-branded-only|IP complaint/i);
  });
  it('stays clear for compatible wording', () => {
    const r = checkBranded(listing('Liner for Ninja AF400UK Air Fryer'), pack, new Set());
    expect(r.level).toBe('clear');
  });
  it('skips brands already flagged by C1', () => {
    const r = checkBranded(listing('Ninja blender jug'), pack, new Set(['Ninja']));
    expect(r.hits).toEqual([]);
  });
});
