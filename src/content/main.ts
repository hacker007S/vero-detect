import { pickAdapter } from '../adapters/index';
import { evaluate } from '../engine/evaluate';
import { renderPanel, type DeepCheckDisplay } from '../panel/panel';
import type { Listing, RulesPack, Verdict } from '../types';
import type { HistoryEntry, WorkerRequest } from '../worker/messages';

const HOST_ID = 'vero-detect-host';

function send<T>(msg: WorkerRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

function rulesAgeLabel(pack: RulesPack): string {
  const age = pack.fetchedAt
    ? `VeRO list: ${Math.max(0, Math.round((Date.now() - pack.fetchedAt) / 86400000))} days old`
    : 'VeRO list: bundled copy';
  return `${age} · rules ${pack.version}`;
}

async function run(): Promise<void> {
  const adapter = pickAdapter(location.href);
  if (!adapter) return;

  // SPA pages hydrate late — retry extraction briefly until a title appears
  let listing: Listing | undefined;
  for (let i = 0; i < 10; i++) {
    listing = adapter.extract(document, location.href);
    if (listing.title) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!listing || !listing.title) return;
  const finalListing = listing;

  const { pack } = await send<{ pack: RulesPack }>({ type: 'get-rules' });
  const verdict: Verdict = evaluate(finalListing, pack);

  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
  }
  renderPanel(host, verdict, {
    rulesAgeLabel: rulesAgeLabel(pack),
    partial: finalListing.missing.length > 0,
    onDeepCheck: async () => {
      const res = await send<{ result?: DeepCheckDisplay; error?: string }>({
        type: 'deep-check',
        listing: finalListing,
      });
      if (res.result) return res.result;
      return { error: res.error ?? 'unknown' };
    },
  });

  const entry: HistoryEntry = {
    url: finalListing.url,
    site: finalListing.site,
    title: finalListing.title,
    overall: verdict.overall,
    firedRuleIds: verdict.categories.flatMap((c) => c.hits.map((h) => h.ruleId)),
    at: Date.now(),
  };
  void send({ type: 'log-check', entry });
}

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    void run();
  }
}, 1000);
void run();
