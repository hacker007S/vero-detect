import { describe, expect, it } from 'vitest';
import { historyToCsv, pushHistory, type HistoryEntry } from '../../src/worker/messages';

const e = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  url: 'https://x/item/1', site: 'aliexpress', title: 'Knife, "sharp"',
  overall: 'danger', firedRuleIds: ['class:knives'], at: 1755300000000, ...over,
});

describe('historyToCsv', () => {
  it('emits pipeline-compatible header and escapes quotes/commas', () => {
    const csv = historyToCsv([e()]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('timestamp,site,title,url,verdict,failure_mode,rules');
    expect(row).toContain('"Knife, ""sharp"""');
    expect(row).toContain('vero');
  });
});

describe('pushHistory', () => {
  it('caps at the limit, dropping oldest', () => {
    const list = Array.from({ length: 5 }, (_, i) => e({ at: i }));
    const out = pushHistory(list, e({ at: 99 }), 5);
    expect(out).toHaveLength(5);
    expect(out[out.length - 1].at).toBe(99);
    expect(out[0].at).toBe(1);
  });
});
