import { describe, expect, it } from 'vitest';
import { checkClasses } from '../../src/engine/classes';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'ebay', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('checkClasses — prohibited', () => {
  it('flags knives as danger with policy link', () => {
    const r = checkClasses(listing('Damascus Steel Chef Knife 8 inch'), pack, 'prohibited');
    expect(r.level).toBe('danger');
    expect(r.hits[0].link).toContain('id=5047');
  });
  it('flags counterfeit wording', () => {
    const r = checkClasses(listing('Luxury watch AAA quality replica'), pack, 'prohibited');
    expect(r.level).toBe('danger');
  });
  it('flags team blacklist categories', () => {
    const r = checkClasses(listing('Fridge Water Filter Cartridge 3-pack'), pack, 'prohibited');
    expect(r.level).toBe('danger');
    expect(r.hits[0].label).toMatch(/blacklist/i);
  });
  it('clear for a harmless item', () => {
    expect(checkClasses(listing('Silicone Air Fryer Liner 2 pack'), pack, 'prohibited').level).toBe('clear');
  });
});

describe('checkClasses — sensitive', () => {
  it('cautions on uncertified-toy risk', () => {
    const r = checkClasses(listing('Kids Toy Montessori Wooden Puzzle'), pack, 'sensitive');
    expect(r.level).toBe('caution');
  });
  it('cautions on health claims in description', () => {
    const r = checkClasses(
      listing('Herbal patch', { description: 'natural pain relief device for joints' }),
      pack, 'sensitive',
    );
    expect(r.level).toBe('caution');
  });
});

describe('checkClasses — fragile', () => {
  it('cautions on glass via material field', () => {
    const r = checkClasses(listing('Teapot 600ml', { material: 'Borosilicate Glass' }), pack, 'fragile');
    expect(r.level).toBe('caution');
  });
});
