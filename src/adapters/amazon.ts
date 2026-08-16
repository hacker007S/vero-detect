import type { Adapter } from './index';
import { parseDimensionsCm, parsePriceGBP, parseWeightG, textOf } from './shared';

export const amazonAdapter: Adapter = {
  site: 'amazon',
  matches: (url) => /https:\/\/www\.amazon\.(co\.uk|com)\/(?:.*\/)?(dp|gp\/product)\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title = textOf(doc, ['#productTitle']) ?? '';
    if (!title) missing.push('title');

    const byline = textOf(doc, ['#bylineInfo']);
    const brand =
      byline?.replace(/^(visit the|brand:)\s*/i, '').replace(/\s*store$/i, '').trim() || undefined;
    if (!brand) missing.push('brand');

    const priceText = textOf(doc, ['.a-price .a-offscreen', '#priceblock_ourprice']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    let dimText: string | undefined;
    let material: string | undefined;
    for (const row of Array.from(
      doc.querySelectorAll('#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li'),
    )) {
      const text = row.textContent ?? '';
      if (/dimensions/i.test(text)) dimText = text;
      if (/^\s*material/i.test(text.trim())) {
        material =
          row.querySelector('td')?.textContent?.trim() ?? text.split(/\n|:/).pop()?.trim();
      }
    }
    const dimensionsCm = dimText ? parseDimensionsCm(dimText) : undefined;
    if (!dimensionsCm) missing.push('dimensions');
    const weightG = dimText ? parseWeightG(dimText) : undefined;
    if (weightG === undefined) missing.push('weight');

    const description = textOf(doc, ['#productDescription', '#feature-bullets']) ?? undefined;
    if (!description) missing.push('description');

    const img = doc.querySelector<HTMLImageElement>('#landingImage')?.src;
    const images = img ? [img] : [];
    if (images.length === 0) missing.push('images');

    return {
      site: 'amazon', url, title, brand, description,
      priceGBP, images, dimensionsCm, weightG, material, missing,
    };
  },
};
