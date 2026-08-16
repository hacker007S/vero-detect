// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderPanel } from '../../src/panel/panel';
import type { Verdict } from '../../src/types';

const verdict: Verdict = {
  overall: 'danger',
  categories: [
    { category: 'vero', level: 'danger', hits: [{ ruleId: 'vero:dyson', level: 'danger', label: 'Dyson Technology Limited', detail: 'VeRO participant', action: 'Do not list', link: 'https://x/dyson.pdf' }] },
    { category: 'prohibited', level: 'clear', hits: [] },
    { category: 'branded', level: 'clear', hits: [] },
    { category: 'size', level: 'unknown', hits: [], note: 'Size unknown — check manually.' },
    { category: 'sensitive', level: 'clear', hits: [] },
    { category: 'fragile', level: 'clear', hits: [] },
  ],
  rulesVersion: '2026-08-16.1', rulesFetchedAt: 0, checkedAt: Date.now(),
};

describe('renderPanel', () => {
  it('renders badge with overall verdict into a shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'rules 2026-08-16.1', partial: true });
    const sr = host.shadowRoot!;
    expect(sr.querySelector('.badge')!.textContent).toMatch(/DO NOT LIST/i);
    expect(sr.querySelectorAll('.cat-row')).toHaveLength(6);
    expect(sr.querySelector('.cat-row[data-cat="vero"] .status-dot')!.classList.contains('lv-danger')).toBe(true);
    expect(sr.querySelector('.cat-row[data-cat="prohibited"] .status-dot')!.classList.contains('lv-clear')).toBe(true);
    expect(sr.querySelector('.cat-row[data-cat="size"] .status-dot')!.classList.contains('lv-unknown')).toBe(true);
    expect(sr.textContent).toMatch(/Partial check/);
    expect(sr.textContent).toMatch(/not a guarantee/i);
  });
  it('expands a category row to show hit details and policy link', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    const sr = host.shadowRoot!;
    (sr.querySelector('.cat-row[data-cat="vero"]') as HTMLElement).click();
    expect(sr.querySelector('.cat-row[data-cat="vero"]')!.classList.contains('expanded')).toBe(true);
    expect(sr.querySelector('.cat-row[data-cat="vero"] .hits')!.textContent).toMatch(/Do not list/);
    expect(sr.querySelector('.cat-row[data-cat="vero"] a')!.getAttribute('href')).toBe('https://x/dyson.pdf');
  });
  it('re-render replaces content, not duplicates', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    expect(host.shadowRoot!.querySelectorAll('.badge')).toHaveLength(1);
  });
  it('escapes malicious listing text (renders as text, not markup)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const evil: Verdict = {
      ...verdict,
      categories: verdict.categories.map((c) =>
        c.category === 'vero'
          ? { ...c, hits: [{ ...c.hits[0], detail: '<img src=x onerror=alert(1)>' }] }
          : c,
      ),
    };
    renderPanel(host, evil, { rulesAgeLabel: 'x', partial: false });
    expect(host.shadowRoot!.querySelector('.hit img')).toBeNull();
    expect(host.shadowRoot!.querySelector('.hit .detail')!.textContent).toContain('<img');
  });
});
