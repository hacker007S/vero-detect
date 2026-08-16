import { bundledPack } from '../rules/bundled/index';
import { mergeRules, type LocalOverrides } from '../rules/merge';
import { parseVeroPage } from '../rules/veroScraper';
import type { RulesPack, VeroBrand } from '../types';
import { deepCheck } from './ai';
import {
  historyToCsv, pushHistory,
  type HistoryEntry, type Settings, type WorkerRequest,
} from './messages';

const VERO_URL = 'https://www.ebay.co.uk/sellercentre/protection/verified-rights-owner-profiles';

async function store<T>(key: string): Promise<T | undefined> {
  const o = await chrome.storage.local.get(key);
  return o[key] as T | undefined;
}

async function currentPack(): Promise<RulesPack> {
  const official = await store<{ brands: VeroBrand[]; fetchedAt: number }>('officialVero');
  const curated = await store<unknown>('curatedPack');
  const local = await store<LocalOverrides>('localOverrides');
  return mergeRules(bundledPack(), official, curated, local);
}

async function refreshOfficial(): Promise<void> {
  try {
    const res = await fetch(VERO_URL, { credentials: 'omit' });
    if (!res.ok) return;
    const brands = parseVeroPage(await res.text());
    if (brands.length > 500) {
      await chrome.storage.local.set({ officialVero: { brands, fetchedAt: Date.now() } });
    }
  } catch {
    // keep cached list; the panel footer shows its age
  }
}

async function refreshCurated(): Promise<void> {
  const settings = (await store<Settings>('settings')) ?? {};
  if (!settings.curatedUrl) return;
  try {
    const res = await fetch(settings.curatedUrl, { cache: 'no-cache' });
    if (!res.ok) return;
    const pack = await res.json();
    if (pack && typeof pack.version === 'string' && Array.isArray(pack.classes)) {
      await chrome.storage.local.set({ curatedPack: pack });
    }
  } catch {
    // bundled fallback stands
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-official', { periodInMinutes: 10080, delayInMinutes: 1 });
  chrome.alarms.create('refresh-curated', { periodInMinutes: 1440, delayInMinutes: 2 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refresh-official') void refreshOfficial();
  if (a.name === 'refresh-curated') void refreshCurated();
});

chrome.runtime.onMessage.addListener((msg: WorkerRequest, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'get-rules':
        sendResponse({ pack: await currentPack() });
        break;
      case 'log-check': {
        const history = (await store<HistoryEntry[]>('history')) ?? [];
        await chrome.storage.local.set({ history: pushHistory(history, msg.entry) });
        sendResponse({ ok: true });
        break;
      }
      case 'deep-check': {
        const settings = (await store<Settings>('settings')) ?? {};
        const provider = settings.provider ?? 'anthropic';
        // legacy v1.0.x stored a single anthropic key in settings.apiKey
        const key = settings.keys?.[provider] ?? (provider === 'anthropic' ? settings.apiKey : undefined);
        if (!key) {
          sendResponse({ error: 'no-key' });
          break;
        }
        try {
          sendResponse({ result: await deepCheck(msg.listing, provider, key) });
        } catch (e) {
          sendResponse({ error: String(e) });
        }
        break;
      }
      case 'refresh-rules':
        await refreshOfficial();
        await refreshCurated();
        sendResponse({ ok: true });
        break;
      case 'get-status': {
        const official = await store<{ brands: VeroBrand[]; fetchedAt: number }>('officialVero');
        const curated = await store<{ version?: string }>('curatedPack');
        const pack = await currentPack();
        sendResponse({
          officialCount:
            official?.brands.length ??
            pack.veroBrands.filter((b) => b.source === 'official').length,
          officialFetchedAt: official?.fetchedAt ?? 0,
          curatedVersion: pack.version,
          usingRemoteCurated: Boolean(curated),
        });
        break;
      }
      case 'get-history': {
        const history = (await store<HistoryEntry[]>('history')) ?? [];
        sendResponse({ history, csv: historyToCsv(history) });
        break;
      }
      case 'clear-history':
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        break;
    }
  })();
  return true; // async response
});
