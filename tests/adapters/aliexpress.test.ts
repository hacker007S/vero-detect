// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aliexpressAdapter } from '../../src/adapters/aliexpress';

describe('aliexpressAdapter', () => {
  const doc = new DOMParser().parseFromString(
    readFileSync('tests/fixtures/aliexpress-item.html', 'utf8'), 'text/html');
  const url = 'https://www.aliexpress.com/item/1005001234567.html';

  it('matches item pages', () => {
    expect(aliexpressAdapter.matches(url)).toBe(true);
    expect(aliexpressAdapter.matches('https://www.aliexpress.com/w/wholesale-knife.html')).toBe(false);
  });
  it('extracts title, price, brand, material, dims from description', () => {
    const l = aliexpressAdapter.extract(doc, url);
    expect(l.title).toMatch(/Folding Pocket Knife/);
    expect(l.priceGBP).toBe(3.42);
    expect(l.brand).toBe('NOENNULL');
    expect(l.material).toBe('Stainless Steel');
    expect(l.dimensionsCm).toEqual({ l: 16, w: 3, h: 2 });
    expect(l.weightG).toBe(120);
  });
});
