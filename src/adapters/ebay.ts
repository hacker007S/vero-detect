import type { Adapter } from './index';
import { parsePriceGBP, parseDimensionsCm, parseSingleLengthCm, parseWeightG, textOf } from './shared';

/**
 * eBay item specifics: modern pages render dt.ux-labels-values__labels /
 * dd.ux-labels-values__values inside plain div columns (no <dl> wrapper);
 * older pages used dl.ux-labels-values > dt/dd. Read both.
 */
function spec(doc: Document, labels: string[]): string | undefined {
  const want = labels.map((l) => l.toLowerCase());
  const dts = doc.querySelectorAll<HTMLElement>(
    '.ux-labels-values__labels, dl.ux-labels-values dt',
  );
  for (const dt of Array.from(dts)) {
    const key = (dt.textContent ?? '').trim().toLowerCase().replace(/:$/, '');
    if (!want.includes(key)) continue;
    const dd =
      (dt.nextElementSibling?.matches?.('.ux-labels-values__values, dd')
        ? dt.nextElementSibling
        : null) ?? dt.parentElement?.querySelector('.ux-labels-values__values, dd');
    const val = dd?.textContent?.trim();
    if (val) return val;
  }
  return undefined;
}

export const ebayAdapter: Adapter = {
  site: 'ebay',
  matches: (url) => /https:\/\/www\.ebay\.(co\.uk|com)\/itm\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title =
      textOf(doc, ['h1.x-item-title__mainTitle span', 'h1.x-item-title__mainTitle', '#itemTitle', 'h1']) ?? '';
    if (!title) missing.push('title');

    const priceText = textOf(doc, ['.x-price-primary span', '#prcIsum']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    const brand = spec(doc, ['brand']);
    if (!brand) missing.push('brand');
    const material = spec(doc, ['material']);

    // per-axis fields first, then combined "20 x 15 x 12 cm" style fields
    const len = spec(doc, ['item length', 'length']);
    const wid = spec(doc, ['item width', 'width']);
    const hei = spec(doc, ['item height', 'height', 'item depth', 'depth']);
    const l = len ? parseSingleLengthCm(len) : undefined;
    const w = wid ? parseSingleLengthCm(wid) : undefined;
    const h = hei ? parseSingleLengthCm(hei) : undefined;
    let dimensionsCm: { l?: number; w?: number; h?: number } | undefined =
      l !== undefined || w !== undefined || h !== undefined ? { l, w, h } : undefined;
    if (!dimensionsCm) {
      const combined = spec(doc, [
        'item dimensions', 'package dimensions', 'dimensions', 'size',
        'package size', 'item size', 'product dimensions',
      ]);
      const fromCombined =
        (combined ? parseDimensionsCm(combined) : undefined) ?? parseDimensionsCm(title);
      if (fromCombined) dimensionsCm = fromCombined;
    }
    if (!dimensionsCm) missing.push('dimensions');

    const weightText = spec(doc, ['item weight', 'weight', 'package weight']);
    const weightG = weightText ? parseWeightG(weightText) : parseWeightG(title);
    if (weightG === undefined) missing.push('weight');

    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const images = [
      ...(og ? [og] : []),
      ...Array.from(doc.querySelectorAll<HTMLImageElement>('.ux-image-carousel-item img'))
        .map((i) => i.src)
        .filter(Boolean),
    ].slice(0, 5);
    if (images.length === 0) missing.push('images');

    // description lives in a cross-origin iframe on modern pages — usually unreadable
    const description = doc.querySelector('.d-item-description')?.textContent?.trim() || undefined;
    if (!description) missing.push('description');

    return {
      site: 'ebay', url, title,
      brand: brand && brand.toLowerCase() !== 'unbranded' ? brand : undefined,
      description, priceGBP, images, dimensionsCm, weightG, material, missing,
    };
  },
};
