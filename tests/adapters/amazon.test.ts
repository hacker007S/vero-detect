// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { amazonAdapter } from '../../src/adapters/amazon';

describe('amazonAdapter', () => {
  const doc = new DOMParser().parseFromString(
    readFileSync('tests/fixtures/amazon-item.html', 'utf8'), 'text/html');
  const url = 'https://www.amazon.co.uk/dp/B08XYZ1234';

  it('matches only product pages', () => {
    expect(amazonAdapter.matches(url)).toBe(true);
    expect(amazonAdapter.matches('https://www.amazon.co.uk/s?k=lego')).toBe(false);
  });
  it('extracts title, brand from byline, price, dims+weight from one cell', () => {
    const l = amazonAdapter.extract(doc, url);
    expect(l.title).toBe('LEGO Technic Monster Jam Truck 42119');
    expect(l.brand).toBe('LEGO');
    expect(l.priceGBP).toBe(17.99);
    expect(l.dimensionsCm?.l).toBeCloseTo(26.2);
    expect(l.weightG).toBe(320);
    expect(l.material).toBe('Plastic');
  });
});
