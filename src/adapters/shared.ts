const DIM_RE =
  /(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|inch|inches|")/i;

export function parseDimensionsCm(text: string): { l?: number; w?: number; h?: number } | undefined {
  const m = text.match(DIM_RE);
  if (!m) return undefined;
  const unit = m[4].toLowerCase();
  const f = unit === 'mm' ? 0.1 : unit.startsWith('in') || unit === '"' ? 2.54 : 1;
  return { l: +m[1] * f, w: +m[2] * f, h: +m[3] * f };
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
