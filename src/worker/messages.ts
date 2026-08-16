import type { Level, Listing } from '../types';

export interface HistoryEntry {
  url: string; site: string; title: string; overall: Level;
  firedRuleIds: string[]; at: number;
}
export interface Settings {
  /** legacy field from v1.0.x — migrated to keys.anthropic */
  apiKey?: string;
  curatedUrl?: string;
  provider?: 'anthropic' | 'openai' | 'gemini';
  keys?: { anthropic?: string; openai?: string; gemini?: string };
}
export interface RulesStatus {
  officialCount: number; officialFetchedAt: number;
  curatedVersion: string; usingRemoteCurated: boolean;
}
export type WorkerRequest =
  | { type: 'get-rules' }
  | { type: 'log-check'; entry: HistoryEntry }
  | { type: 'deep-check'; listing: Listing }
  | { type: 'refresh-rules' }
  | { type: 'get-status' }
  | { type: 'get-history' }
  | { type: 'clear-history' };

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function failureMode(entry: HistoryEntry): string {
  if (entry.overall !== 'danger') return '';
  return entry.firedRuleIds.some((r) => r.startsWith('vero') || r.startsWith('class:'))
    ? 'vero'
    : 'other';
}

export function historyToCsv(entries: HistoryEntry[]): string {
  const rows = entries.map((e) =>
    [
      new Date(e.at).toISOString(), e.site, csvCell(e.title), csvCell(e.url),
      e.overall, failureMode(e), csvCell(e.firedRuleIds.join(';')),
    ].join(','),
  );
  return ['timestamp,site,title,url,verdict,failure_mode,rules', ...rows].join('\n') + '\n';
}

export function pushHistory(entries: HistoryEntry[], entry: HistoryEntry, cap = 2000): HistoryEntry[] {
  const out = [...entries, entry];
  return out.length > cap ? out.slice(out.length - cap) : out;
}
