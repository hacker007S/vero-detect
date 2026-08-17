import type { Adapter } from './index';
import { parseDimensionsCm, parsePriceGBP, parseWeightG, textOf } from './shared';

function specPair(doc: Document, label: string): string | undefined {
  for (const li of Array.from(
    doc.querySelectorAll('#nav-specification li, [class*="specification--prop"]'),
  )) {
    const spans = li.querySelectorAll('span');
    if (spans.length >= 2 && spans[0].textContent?.toLowerCase().includes(label)) {
      return spans[1].textContent?.trim();
    }
  }
  return undefined;
}

export const aliexpressAdapter: Adapter = {
  site: 'aliexpress',
  matches: (url) => /https:\/\/[^/]*aliexpress\.(com|us)\/item\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title =
      textOf(doc, ['h1[data-pl="product-title"]', 'h1.product-title-text']) ??
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '';
    if (!title) missing.push('title');

    const priceText = textOf(doc, ['[class*="currentPriceText"]', '.product-price-value']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    const brand = specPair(doc, 'brand');
    if (!brand) missing.push('brand');
    const material = specPair(doc, 'material');

    const description =
      textOf(doc, ['#product-description', '[class*="description--wrap"]']) ?? undefined;
    if (!description) missing.push('description');

    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
    const dimSource = [specPair(doc, 'size') ?? '', specPair(doc, 'dimension') ?? '', description ?? '', ogDesc, title].join(' ');
    const dimensionsCm = parseDimensionsCm(dimSource);
    if (!dimensionsCm) missing.push('dimensions');
    const weightG = parseWeightG([specPair(doc, 'weight') ?? '', description ?? '', ogDesc].join(' '));
    if (weightG === undefined) missing.push('weight');

    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const images = og ? [og] : [];
    if (images.length === 0) missing.push('images');

    const cleanBrand = brand && !/^(no|none|oem|no brand)$/i.test(brand) ? brand : undefined;
    return {
      site: 'aliexpress', url, title, brand: cleanBrand, description,
      priceGBP, images, dimensionsCm, weightG, material, missing,
    };
  },
};
