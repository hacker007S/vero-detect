import type { Adapter } from './index';
import { parsePriceGBP, parseSingleLengthCm, parseWeightG, specValue, textOf } from './shared';

export const ebayAdapter: Adapter = {
  site: 'ebay',
  matches: (url) => /https:\/\/www\.ebay\.(co\.uk|com)\/itm\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title =
      textOf(doc, ['h1.x-item-title__mainTitle span', 'h1.x-item-title__mainTitle', '#itemTitle']) ?? '';
    if (!title) missing.push('title');

    const priceText = textOf(doc, ['.x-price-primary span', '#prcIsum']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    const spec = (labels: string[]) => specValue(doc, labels, 'dl.ux-labels-values', 'dt', 'dd');
    const brand = spec(['brand']);
    if (!brand) missing.push('brand');
    const material = spec(['material']);

    const len = spec(['item length', 'length']);
    const wid = spec(['item width', 'width']);
    const hei = spec(['item height', 'height', 'item depth', 'depth']);
    const l = len ? parseSingleLengthCm(len) : undefined;
    const w = wid ? parseSingleLengthCm(wid) : undefined;
    const h = hei ? parseSingleLengthCm(hei) : undefined;
    const dimensionsCm = l !== undefined || w !== undefined || h !== undefined ? { l, w, h } : undefined;
    if (!dimensionsCm) missing.push('dimensions');

    const weightText = spec(['item weight', 'weight']);
    const weightG = weightText ? parseWeightG(weightText) : undefined;
    if (weightG === undefined) missing.push('weight');

    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const images = [
      ...(og ? [og] : []),
      ...Array.from(doc.querySelectorAll<HTMLImageElement>('.ux-image-carousel-item img'))
        .map((i) => i.src)
        .filter(Boolean),
    ].slice(0, 5);
    if (images.length === 0) missing.push('images');

    const description = doc.querySelector('.d-item-description')?.textContent?.trim() || undefined;
    if (!description) missing.push('description');

    return {
      site: 'ebay', url, title,
      brand: brand && brand.toLowerCase() !== 'unbranded' ? brand : undefined,
      description, priceGBP, images, dimensionsCm, weightG, material, missing,
    };
  },
};
