import { describe, expect, it } from 'vitest';
import { bundledPack } from '../../src/rules/bundled/index';

describe('bundledPack', () => {
  const pack = bundledPack();
  it('contains the official seed plus curated additions', () => {
    expect(pack.veroBrands.length).toBeGreaterThan(1100);
    const names = pack.veroBrands.map((b) => b.name.toLowerCase());
    expect(names).toContain('dyson technology limited'); // official
    expect(names).toContain('apple');                    // curated addition
    expect(names).toContain('lego');
  });
  it('marks Sage/Breville confirmedSafe', () => {
    const sage = pack.veroBrands.find((b) => b.name.toLowerCase() === 'sage');
    expect(sage?.confirmedSafe).toBe(true);
  });
  it('has aliases, top brands, classes and size rules', () => {
    expect(pack.aliases['iphone']).toBe('Apple');
    expect(pack.topBrands.length).toBeGreaterThan(30);
    expect(pack.classes.some((c) => c.id === 'knives')).toBe(true);
    expect(pack.size.largeLetter).toEqual({ l: 35.3, w: 25, h: 2.5, weightG: 750 });
  });
  it('does not duplicate brands present in both seed and curated list', () => {
    const rayban = pack.veroBrands.filter((b) => b.name.toLowerCase().startsWith('ray-ban'));
    expect(rayban.length).toBe(1);
    expect(rayban[0].source).toBe('official');
    const nintendo = pack.veroBrands.filter((b) => b.name.toLowerCase().includes('nintendo'));
    expect(nintendo.length).toBe(1);
  });
});
