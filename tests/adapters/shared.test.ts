import { describe, expect, it } from 'vitest';
import { parseDimensionsCm, parsePriceGBP, parseWeightG } from '../../src/adapters/shared';

describe('parseDimensionsCm', () => {
  it('parses "L x W x H cm"', () => {
    expect(parseDimensionsCm('35 x 25 x 2.5 cm')).toEqual({ l: 35, w: 25, h: 2.5 });
  });
  it('converts inches', () => {
    const d = parseDimensionsCm('10 x 5 x 2 inches')!;
    expect(d.l).toBeCloseTo(25.4, 1);
  });
  it('returns undefined for prose without dimensions', () => {
    expect(parseDimensionsCm('lovely teapot for the whole family')).toBeUndefined();
  });
  it('parses per-number units and two-dimension strings', () => {
    expect(parseDimensionsCm('35cm x 25cm x 2.5cm')).toEqual({ l: 35, w: 25, h: 2.5 });
    expect(parseDimensionsCm('size: 20 x 15 cm approx')).toEqual({ l: 20, w: 15 });
  });
  it('requires an explicit unit — "3 x 5" alone never matches', () => {
    expect(parseDimensionsCm('pack of 3 x 5 items')).toBeUndefined();
  });
});

describe('parseWeightG', () => {
  it('parses g and kg', () => {
    expect(parseWeightG('350 g')).toBe(350);
    expect(parseWeightG('1.2 kg')).toBe(1200);
  });
});

describe('parsePriceGBP', () => {
  it('parses £ prices', () => {
    expect(parsePriceGBP('£12.99')).toBe(12.99);
    expect(parsePriceGBP('GBP 8.50')).toBe(8.5);
  });
  it('ignores non-GBP', () => {
    expect(parsePriceGBP('US $4.99')).toBeUndefined();
  });
});
