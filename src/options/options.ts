import type { LocalOverrides } from '../rules/merge';
import type { HistoryEntry, RulesStatus, Settings } from '../worker/messages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg = 'Saved ✓'): void {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function loadStores(): Promise<{ settings: Settings; overrides: LocalOverrides }> {
  const o = await chrome.storage.local.get(['settings', 'localOverrides']);
  return {
    settings: (o.settings as Settings) ?? {},
    overrides: (o.localOverrides as LocalOverrides) ?? {},
  };
}
async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const { settings } = await loadStores();
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  toast();
}
function linesToArray(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function refreshStatus(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({ type: 'get-status' })) as RulesStatus;
  $('official-count').textContent = String(status.officialCount);
  $('official-age').textContent = status.officialFetchedAt
    ? `${Math.max(0, Math.round((Date.now() - status.officialFetchedAt) / 86400000))}d`
    : 'bundled';
  $('curated-version').textContent = status.curatedVersion;
  const pill = $('curated-remote');
  pill.textContent = status.usingRemoteCurated ? 'REMOTE' : 'BUILT-IN';
  pill.className = `pill ${status.usingRemoteCurated ? 'on' : 'off'}`;

  const { history } = (await chrome.runtime.sendMessage({ type: 'get-history' })) as {
    history: HistoryEntry[];
  };
  $('history-count').textContent = String(history.length);
}

async function init(): Promise<void> {
  const { settings, overrides } = await loadStores();
  // migrate legacy v1.0.x single anthropic key
  const keys = { ...settings.keys };
  if (settings.apiKey && !keys.anthropic) keys.anthropic = settings.apiKey;
  $<HTMLSelectElement>('provider').value = settings.provider ?? 'gemini';
  $<HTMLInputElement>('key-gemini').value = keys.gemini ?? '';
  $<HTMLInputElement>('key-anthropic').value = keys.anthropic ?? '';
  $<HTMLInputElement>('key-openai').value = keys.openai ?? '';
  $<HTMLInputElement>('curated-url').value = settings.curatedUrl ?? '';
  $<HTMLTextAreaElement>('add-brands').value = (overrides.addBrands ?? []).join('\n');
  $<HTMLTextAreaElement>('ignore-brands').value = (overrides.ignoreBrands ?? []).join('\n');
  await refreshStatus();

  const saveKeys = async (): Promise<void> => {
    await saveSettings({
      provider: $<HTMLSelectElement>('provider').value as Settings['provider'],
      keys: {
        gemini: $<HTMLInputElement>('key-gemini').value.trim() || undefined,
        anthropic: $<HTMLInputElement>('key-anthropic').value.trim() || undefined,
        openai: $<HTMLInputElement>('key-openai').value.trim() || undefined,
      },
      apiKey: undefined, // clear the legacy field once migrated
    });
  };
  $('provider').addEventListener('change', () => void saveKeys());
  $('key-gemini').addEventListener('change', () => void saveKeys());
  $('key-anthropic').addEventListener('change', () => void saveKeys());
  $('key-openai').addEventListener('change', () => void saveKeys());
  $<HTMLInputElement>('curated-url').addEventListener('change', (e) =>
    void saveSettings({ curatedUrl: (e.target as HTMLInputElement).value.trim() || undefined }),
  );
  $('save-overrides').addEventListener('click', async () => {
    const next: LocalOverrides = {
      addBrands: linesToArray($<HTMLTextAreaElement>('add-brands').value),
      ignoreBrands: linesToArray($<HTMLTextAreaElement>('ignore-brands').value),
    };
    await chrome.storage.local.set({ localOverrides: next });
    toast();
  });
  $('refresh').addEventListener('click', async () => {
    $('refresh').textContent = '↻ Refreshing…';
    await chrome.runtime.sendMessage({ type: 'refresh-rules' });
    await refreshStatus();
    $('refresh').textContent = '↻ Refresh now';
    toast('Rules refreshed ✓');
  });
  $('export').addEventListener('click', async () => {
    const { csv } = (await chrome.runtime.sendMessage({ type: 'get-history' })) as { csv: string };
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: 'vero-detect-history.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
  });
  $('clear').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'clear-history' });
    await refreshStatus();
    toast('History cleared');
  });
}

void init();
