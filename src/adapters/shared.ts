const UNIT = '(cm|mm|in|inch|inches|")';
const NUM = '(\\d+(?:\\.\\d+)?)';
const SEP = `\\s*${UNIT}?\\s*[x×*]\\s*`;
const DIM3_RE = new RegExp(`${NUM}${SEP}${NUM}${SEP}${NUM}\\s*${UNIT}`, 'i');
const DIM2_RE = new RegExp(`${NUM}${SEP}${NUM}\\s*${UNIT}`, 'i');

function unitFactor(unit: string): number {
  const u = unit.toLowerCase();
  return u === 'mm' ? 0.1 : u.startsWith('in') || u === '"' ? 2.54 : 1;
}

export function parseDimensionsCm(text: string): { l?: number; w?: number; h?: number } | undefined {
  const m3 = text.match(DIM3_RE);
  if (m3) {
    // trailing unit governs; a unit is required somewhere so "3 x 5" alone never matches
    const f = unitFactor(m3[6] ?? m3[4] ?? m3[2] ?? 'cm');
    return { l: +m3[1] * f, w: +m3[3] * f, h: +m3[5] * f };
  }
  const m2 = text.match(DIM2_RE);
  if (m2) {
    const f = unitFactor(m2[4] ?? m2[2] ?? 'cm');
    return { l: +m2[1] * f, w: +m2[3] * f };
  }
  return undefined;
}

export function parseSingleLengthCm(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(cm|mm|in|inch|inches|")/i);
  if (!m) return undefined;
  const unit = m[2].toLowerCase();
  const f = unit === 'mm' ? 0.1 : unit.startsWith('in') || unit === '"' ? 2.54 : 1;
  return +m[1] * f;
}

export function parseWeightG(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|grams?|lbs?|pounds?|oz)\b/i);
  if (!m) return undefined;
  const v = +m[1];
  const u = m[2].toLowerCase();
  if (u === 'kg') return v * 1000;
  if (u.startsWith('lb') || u.startsWith('pound')) return Math.round(v * 453.6);
  if (u === 'oz') return Math.round(v * 28.35);
  return v;
}

export function parsePriceGBP(text: string): number | undefined {
  const m = text.match(/(?:£|GBP\s*)(\d+(?:[.,]\d{2})?)/);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

export function textOf(doc: Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return undefined;
}

export function specValue(
  doc: Document,
  labels: string[],
  rowSelector: string,
  dtSel: string,
  ddSel: string,
): string | undefined {
  const want = labels.map((l) => l.toLowerCase());
  for (const row of Array.from(doc.querySelectorAll(rowSelector))) {
    const key = row.querySelector(dtSel)?.textContent?.trim().toLowerCase() ?? '';
    if (want.includes(key)) {
      const val = row.querySelector(ddSel)?.textContent?.trim();
      if (val) return val;
    }
  }
  return undefined;
}
