import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseVeroPage } from '../../src/rules/veroScraper';

describe('parseVeroPage', () => {
  const html = readFileSync('tests/fixtures/vero-page.html', 'utf8');
  const brands = parseVeroPage(html);
  it('extracts at least 1,100 unique brands', () => {
    expect(brands.length).toBeGreaterThan(1100);
  });
  it('decodes HTML entities in names', () => {
    expect(brands.some((b) => b.name.includes('&amp;'))).toBe(false);
    expect(brands.some((b) => b.name.includes('&'))).toBe(true);
  });
  it('every brand has an official source and a profile PDF', () => {
    expect(brands.every((b) => b.source === 'official' && b.profile?.endsWith('.pdf'))).toBe(true);
  });
  it('returns [] for HTML without the list (layout change)', () => {
    expect(parseVeroPage('<html><body>maintenance</body></html>')).toEqual([]);
  });
});
