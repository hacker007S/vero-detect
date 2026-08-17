import type { CategoryResult, Listing, RuleHit, SizeRules } from '../types';

export function checkSize(listing: Listing, size: SizeRules): CategoryResult {
  const d = listing.dimensionsCm;
  const w = listing.weightG;
  if (!d && w === undefined) {
    return {
      category: 'size', level: 'unknown', hits: [],
      note: 'Size unknown — check manually. Large-letter limit is 35.3 × 25 × 2.5 cm, 750 g.',
    };
  }

  const sides = [d?.l, d?.w, d?.h].filter((x): x is number => x !== undefined).sort((a, b) => b - a);
  const limits = [size.largeLetter.l, size.largeLetter.w, size.largeLetter.h].sort((a, b) => b - a);
  const hits: RuleHit[] = [];

  const huge = sides.some((s) => s > size.hugeSideCm) || (w !== undefined && w > size.hugeWeightG);
  if (huge) {
    hits.push({
      ruleId: 'size:huge', level: 'danger', label: 'Very large / heavy item',
      detail: `Exceeds ${size.hugeSideCm} cm or ${size.hugeWeightG / 1000} kg — courier surcharges and damage risk make this unsuitable for dropshipping.`,
      action: 'Do not dropship. Pick a smaller product.',
    });
    return { category: 'size', level: 'danger', hits };
  }

  const fitsDims = sides.length > 0 && sides.every((s, i) => s <= limits[i]);
  const fitsWeight = w === undefined || w <= size.largeLetter.weightG;
  if (fitsDims && fitsWeight && sides.length === 3) {
    return {
      category: 'size', level: 'clear', hits: [],
      note: 'Fits large letter (≤ 35.3 × 25 × 2.5 cm, ≤ 750 g) — best postage economics.',
    };
  }

  // partial data that raises no flag: known sides fit, but we can't call it clear
  if (fitsDims && fitsWeight && sides.length < 3) {
    const known = sides.map((s) => `${Math.round(s * 10) / 10} cm`).join(' × ');
    return {
      category: 'size', level: 'unknown', hits: [],
      note: `Known: ${known}${w !== undefined ? `, ${w} g` : ''} — remaining dimension(s) unknown, check manually.`,
    };
  }
  if (sides.length === 0 && w !== undefined && fitsWeight) {
    return {
      category: 'size', level: 'unknown', hits: [],
      note: `Weight ${w} g fits large letter — dimensions unknown, check manually.`,
    };
  }

  hits.push({
    ruleId: 'size:parcel', level: 'caution', label: 'Over large-letter size',
    detail:
      listing.priceGBP !== undefined && listing.priceGBP > size.simpleDeliveryPriceGBP
        ? `Parcel rates apply, and above £${size.simpleDeliveryPriceGBP} eBay Simple Delivery adds £2.94–£3.38 to the buyer.`
        : 'Parcel rates apply — factor postage into the 30% cost ratio.',
    action: 'Re-run your cost gate with parcel postage included.',
  });
  return { category: 'size', level: 'caution', hits };
}
