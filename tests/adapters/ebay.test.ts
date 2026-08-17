// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ebayAdapter } from '../../src/adapters/ebay';

describe('ebayAdapter', () => {
  const html = readFileSync('tests/fixtures/ebay-item.html', 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const url = 'https://www.ebay.co.uk/itm/123456789';

  it('matches only item pages', () => {
    expect(ebayAdapter.matches(url)).toBe(true);
    expect(ebayAdapter.matches('https://www.ebay.co.uk/sch/i.html?_nkw=x')).toBe(false);
  });
  it('extracts title, price, material, dimensions, weight, image', () => {
    const l = ebayAdapter.extract(doc, url);
    expect(l.title).toMatch(/Glass Teapot/);
    expect(l.priceGBP).toBe(12.99);
    expect(l.material).toBe('Borosilicate Glass');
    expect(l.dimensionsCm).toEqual({ l: 20, w: 15, h: 12 });
    expect(l.weightG).toBe(350);
    expect(l.images[0]).toContain('ebayimg');
    expect(l.site).toBe('ebay');
    expect(l.brand).toBeUndefined(); // "Unbranded" is not a brand
  });
  it('reads combined "Item Dimensions" spec when per-axis fields are absent', () => {
    const doc2 = new DOMParser().parseFromString(
      `<html><body><h1 class="x-item-title__mainTitle"><span>Storage Box</span></h1>
       <div><dt class="ux-labels-values__labels"><span>Item Dimensions</span></dt>
       <dd class="ux-labels-values__values"><span>40 x 30 x 10 cm</span></dd></div></body></html>`,
      'text/html',
    );
    const l = ebayAdapter.extract(doc2, url);
    expect(l.dimensionsCm).toEqual({ l: 40, w: 30, h: 10 });
  });
  it('records missing fields instead of guessing', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const l = ebayAdapter.extract(empty, url);
    expect(l.title).toBe('');
    expect(l.missing).toContain('title');
    expect(l.missing).toContain('price');
  });
});
