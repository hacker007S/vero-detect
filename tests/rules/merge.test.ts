import { describe, expect, it } from 'vitest';
import { bundledPack } from '../../src/rules/bundled/index';
import { mergeRules } from '../../src/rules/merge';

describe('mergeRules', () => {
  it('fresh official list replaces bundled official brands and sets fetchedAt', () => {
    const merged = mergeRules(bundledPack(), {
      brands: [{ name: 'TestCo', profile: 'https://x/t.pdf', source: 'official' }],
      fetchedAt: 1234,
    });
    expect(merged.veroBrands.filter((b) => b.source === 'official')).toHaveLength(1);
    expect(merged.veroBrands.some((b) => b.name === 'Apple' && b.source === 'curated')).toBe(true);
    expect(merged.fetchedAt).toBe(1234);
  });
  it('local overrides add and ignore brands', () => {
    const merged = mergeRules(bundledPack(), undefined, undefined, {
      addBrands: ['MyRiskyBrand'], ignoreBrands: ['Apple'],
    });
    expect(merged.veroBrands.some((b) => b.name === 'MyRiskyBrand' && b.source === 'local')).toBe(true);
    expect(merged.veroBrands.find((b) => b.name === 'Apple')?.confirmedSafe).toBe(true);
  });
  it('remote curated pack replaces aliases/classes when provided', () => {
    const merged = mergeRules(bundledPack(), undefined, {
      version: '2026-09-01.1', veroAdditions: [], confirmedSafe: [],
      aliases: { zzz: 'ZZZ Co' }, topBrands: [], classes: [],
      size: bundledPack().size,
    });
    expect(merged.version).toBe('2026-09-01.1');
    expect(merged.aliases['zzz']).toBe('ZZZ Co');
    expect(merged.aliases['iphone']).toBeUndefined();
  });
});
