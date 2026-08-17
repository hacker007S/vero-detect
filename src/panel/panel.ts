import type { CategoryId, Level, RuleHit, Verdict } from '../types';
import { BRANDING } from '../branding';
import logoUrl from '../../public/icons/icon128.png';

export interface DeepCheckDisplay {
  recommendation: string;
  reasoning: string;
  concerns: string[];
}
export interface PanelOptions {
  rulesAgeLabel: string;
  partial: boolean;
  onDeepCheck?: () => Promise<DeepCheckDisplay | { error: string }>;
}

const META: Record<CategoryId, { icon: string; name: string }> = {
  vero: { icon: '🛡️', name: 'VeRO brand' },
  prohibited: { icon: '🚫', name: 'Prohibited / restricted' },
  branded: { icon: '🏷️', name: 'Branded item' },
  size: { icon: '📦', name: 'Size & weight' },
  sensitive: { icon: '⚠️', name: 'Sensitive item' },
  fragile: { icon: '🥂', name: 'Fragile' },
};

const LEVEL_META: Record<Level, { word: string; chip: string; color: string; glyph: string }> = {
  clear: { word: 'CLEAR', chip: 'No known flags', color: '#34d399', glyph: '✓' },
  caution: { word: 'CAUTION', chip: 'Conditions', color: '#fbbf24', glyph: '!' },
  danger: { word: 'DO NOT LIST', chip: 'Blocked', color: '#f87171', glyph: '✕' },
  unknown: { word: 'CHECK MANUALLY', chip: 'Unknown', color: '#9ca3af', glyph: '?' },
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.root {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
}

/* ---------- badge ---------- */
.badge {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 16px 10px 13px; border-radius: 999px; cursor: pointer;
  background: rgba(17, 24, 39, 0.92); color: #f9fafb;
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: 0 4px 14px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.22);
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em; user-select: none;
  transition: transform 0.18s cubic-bezier(0.32,0.72,0,1), box-shadow 0.18s ease;
}
.badge:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,0,0,0.36), 0 2px 6px rgba(0,0,0,0.24); }
.badge .dot {
  width: 11px; height: 11px; border-radius: 50%; flex: none;
  background: var(--lv); box-shadow: 0 0 8px var(--lv);
}
.badge.danger .dot { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 4px var(--lv); }
  50% { box-shadow: 0 0 16px var(--lv), 0 0 30px var(--lv); }
}
.badge .brandname { opacity: 0.72; font-weight: 500; }
.badge .word { color: var(--lv); }

/* ---------- card ---------- */
.card {
  width: 362px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain;
  border-radius: 16px; color: #e5e7eb;
  background: rgba(17, 24, 39, 0.93);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.3);
  transform-origin: bottom right;
  animation: enter 0.18s cubic-bezier(0.32,0.72,0,1);
  display: none;
}
.card.open { display: block; }
@keyframes enter { from { opacity: 0; transform: scale(0.92) translateY(8px); } to { opacity: 1; transform: none; } }
.card::-webkit-scrollbar { width: 8px; }
.card::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 4px; }
.card::-webkit-scrollbar-track { background: transparent; }

.hdr { display: flex; align-items: center; gap: 13px; padding: 18px 18px 14px; }
.hdr .ring {
  width: 46px; height: 46px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 21px; font-weight: 800; color: var(--lv);
  background: color-mix(in srgb, var(--lv) 16%, transparent);
  border: 2px solid var(--lv);
  box-shadow: 0 0 18px color-mix(in srgb, var(--lv) 40%, transparent);
}
.hdr .word { font-size: 16.5px; font-weight: 800; letter-spacing: 0.03em; color: var(--lv); }
.hdr .sub { font-size: 12px; color: #9ca3af; margin-top: 3px; }
.hdr .close {
  margin-left: auto; align-self: flex-start; cursor: pointer; border: none;
  background: rgba(255,255,255,0.08); color: #9ca3af; border-radius: 8px;
  width: 26px; height: 26px; font-size: 13px; line-height: 1;
  transition: background 0.15s ease, color 0.15s ease;
}
.hdr .close:hover { background: rgba(255,255,255,0.16); color: #f9fafb; }

.partial {
  margin: 0 18px 10px; padding: 8px 11px; border-radius: 10px;
  background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fcd34d; font-size: 11.5px; line-height: 1.45;
}

/* ---------- category rows ---------- */
.cats { padding: 2px 10px 8px; }
.cat-row {
  border-radius: 12px; margin: 3px 0; overflow: hidden;
  transition: background 0.15s ease;
}
.cat-row.has-hits { cursor: pointer; }
.cat-row.has-hits:hover { background: rgba(255,255,255,0.05); }
.cat-head { display: flex; align-items: center; gap: 10px; padding: 9px 9px; }
.cat-head .status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex: none; margin-left: 4px;
  background: var(--lv); box-shadow: 0 0 7px color-mix(in srgb, var(--lv) 70%, transparent);
}
.cat-head .icon { font-size: 16px; width: 22px; text-align: center; flex: none; }
.cat-head .name { font-size: 13px; font-weight: 600; color: #e5e7eb; }
.cat-head .note { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.chip {
  margin-left: auto; flex: none; font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.04em; padding: 3px 9px; border-radius: 999px;
  color: var(--lv); background: color-mix(in srgb, var(--lv) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--lv) 45%, transparent);
}
.caret { flex: none; color: #6b7280; font-size: 10px; margin-left: 6px; transition: transform 0.18s ease; }
.cat-row.expanded .caret { transform: rotate(90deg); }
.hits { max-height: 0; overflow: hidden; transition: max-height 0.22s cubic-bezier(0.32,0.72,0,1); }
.cat-row.expanded .hits { max-height: 600px; }
.hit {
  margin: 2px 10px 9px 41px; padding: 9px 11px; border-radius: 10px;
  background: rgba(255,255,255,0.045); border-left: 3px solid var(--hl);
  font-size: 12px; line-height: 1.5;
}
.hit .hlabel { font-weight: 700; color: var(--hl); margin-bottom: 2px; }
.hit .detail { color: #d1d5db; }
.hit .action { color: #93c5fd; margin-top: 5px; }
.hit .action b { color: #bfdbfe; }
.hit a { color: #60a5fa; text-decoration: none; font-size: 11.5px; }
.hit a:hover { text-decoration: underline; }

/* ---------- deep check ---------- */
.deep { margin: 4px 18px 10px; }
.deep button {
  width: 100%; border: 1px solid rgba(147, 197, 253, 0.35); cursor: pointer;
  background: rgba(59, 130, 246, 0.14); color: #93c5fd;
  padding: 9px 0; border-radius: 10px; font-size: 12.5px; font-weight: 700;
  transition: background 0.15s ease;
}
.deep button:hover { background: rgba(59, 130, 246, 0.24); }
.deep button:disabled { opacity: 0.55; cursor: wait; }
.deep .spin {
  display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid #93c5fd; border-top-color: transparent;
  animation: spin 0.7s linear infinite; vertical-align: -2px; margin-right: 7px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.deep .result {
  margin-top: 8px; padding: 12px 13px; border-radius: 12px; font-size: 12px;
  background: color-mix(in srgb, var(--rv, #9ca3af) 7%, rgba(255,255,255,0.03));
  border: 1px solid color-mix(in srgb, var(--rv, #9ca3af) 35%, transparent);
  line-height: 1.55; color: #d1d5db;
  animation: resultIn 0.28s cubic-bezier(0.32,0.72,0,1);
}
@keyframes resultIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.deep .rec-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.deep .rec-emoji { font-size: 17px; line-height: 1; }
.deep .rec-tag {
  font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;
  text-transform: uppercase;
}
.deep .rec {
  font-weight: 800; letter-spacing: 0.04em; font-size: 13px; color: var(--rv);
  margin-left: auto; padding: 2px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--rv) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--rv) 45%, transparent);
}
.deep .reason {
  color: #cbd5e1; padding: 7px 10px; border-radius: 8px; margin-bottom: 4px;
  background: rgba(255,255,255,0.04);
  border-left: 3px solid color-mix(in srgb, var(--rv) 70%, transparent);
}
.deep .note {
  display: flex; gap: 8px; align-items: flex-start; margin-top: 6px;
  padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.04);
}
.deep .note .n-emoji { flex: none; font-size: 12px; line-height: 1.5; }
.deep .note .n-text { color: #d1d5db; }

/* ---------- footer ---------- */
.foot {
  padding: 10px 18px 14px; border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 10.5px; color: #6b7280; line-height: 1.6;
}
.foot .age { color: #9ca3af; }
/* ---------- brand card ---------- */
.brand {
  margin-top: 10px; padding: 12px; border-radius: 14px;
  background: linear-gradient(150deg, rgba(52,211,153,0.09), rgba(59,130,246,0.10));
  border: 1px solid rgba(255,255,255,0.11);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
}
.brand .head { display: flex; align-items: center; gap: 10px; }
.brand .mark-img {
  width: 38px; height: 38px; border-radius: 10px; flex: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.45);
}
.brand .wordmark { font-size: 13.5px; font-weight: 800; color: #f1f5f9; line-height: 1.25; }
.brand .wordmark .grad {
  background: linear-gradient(90deg, #34d399, #60a5fa);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.brand .co-chip {
  margin-left: auto; flex: none; font-size: 9px; font-weight: 800;
  letter-spacing: 0.14em; color: #0b1020; padding: 4px 10px; border-radius: 999px;
  background: linear-gradient(90deg, #34d399, #60a5fa);
  box-shadow: 0 2px 8px rgba(52,211,153,0.35);
}
.brand .pitch { font-size: 10.5px; color: #a7b3c5; line-height: 1.55; margin-top: 8px; }
.brand .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
.brand .chip-c {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 700; color: #cbd5e1; text-decoration: none;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  transition: background 0.15s ease, border-color 0.15s ease;
}
a.chip-c:hover { background: rgba(59,130,246,0.18); border-color: rgba(147,197,253,0.45); color: #bfdbfe; }

/* ---------- upcoming products ---------- */
.upcoming {
  margin-top: 8px; padding: 11px 12px; border-radius: 14px;
  background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09);
}
.upcoming .up-title {
  font-size: 9.5px; font-weight: 800; letter-spacing: 0.14em; color: #94a3b8;
  text-transform: uppercase; display: flex; align-items: center; gap: 6px;
}
.upcoming .up-title .shine {
  background: linear-gradient(90deg, #34d399, #60a5fa, #34d399);
  background-size: 200% auto; -webkit-background-clip: text;
  background-clip: text; color: transparent; animation: shimmer 3s linear infinite;
}
@keyframes shimmer { to { background-position: 200% center; } }
.up-item { margin-top: 9px; }
.up-top { display: flex; align-items: baseline; font-size: 11px; font-weight: 700; color: #e2e8f0; }
.up-top .up-pct { margin-left: auto; font-size: 10px; font-weight: 800; color: #93c5fd; }
.up-bar {
  height: 6px; border-radius: 999px; overflow: hidden; margin-top: 4px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);
}
.up-fill {
  height: 100%; border-radius: 999px; width: 0;
  background: linear-gradient(90deg, #34d399, #60a5fa);
  box-shadow: 0 0 8px rgba(52,211,153,0.55);
  transition: width 1s cubic-bezier(0.32,0.72,0,1);
}
.upcoming .stay { font-size: 10px; color: #7c8aa0; margin-top: 9px; text-align: center; font-weight: 600; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHit(hit: RuleHit): HTMLElement {
  const box = el('div', 'hit');
  box.style.setProperty('--hl', LEVEL_META[hit.level].color);
  box.appendChild(el('div', 'hlabel', hit.label));
  box.appendChild(el('div', 'detail', hit.detail));
  if (hit.action) {
    const action = el('div', 'action');
    const b = el('b', undefined, '→ What to do: ');
    action.appendChild(b);
    action.appendChild(document.createTextNode(hit.action));
    box.appendChild(action);
  }
  if (hit.link) {
    const a = el('a', undefined, 'policy / profile ↗');
    a.href = hit.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    box.appendChild(a);
  }
  return box;
}

export function renderPanel(container: HTMLElement, verdict: Verdict, opts: PanelOptions): void {
  const sr = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  sr.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  sr.appendChild(style);

  const overall = LEVEL_META[verdict.overall];
  const root = el('div', 'root');
  root.style.setProperty('--lv', overall.color);

  // ----- card -----
  const card = el('div', 'card');
  card.style.setProperty('--lv', overall.color);

  const hdr = el('div', 'hdr');
  hdr.appendChild(el('div', 'ring', overall.glyph));
  const hdrText = el('div');
  hdrText.appendChild(el('div', 'word', overall.word));
  const dangers = verdict.categories.filter((c) => c.level === 'danger').length;
  const cautions = verdict.categories.filter((c) => c.level === 'caution').length;
  const unknowns = verdict.categories.filter((c) => c.level === 'unknown').length;
  const parts: string[] = [];
  if (dangers) parts.push(`${dangers} blocker${dangers > 1 ? 's' : ''}`);
  if (cautions) parts.push(`${cautions} warning${cautions > 1 ? 's' : ''}`);
  if (unknowns) parts.push(`${unknowns} unchecked`);
  hdrText.appendChild(el('div', 'sub', parts.length ? parts.join(', ') : 'All 6 checks passed'));
  hdr.appendChild(hdrText);
  const close = el('button', 'close', '✕');
  close.addEventListener('click', () => card.classList.remove('open'));
  hdr.appendChild(close);
  card.appendChild(hdr);

  if (opts.partial) {
    card.appendChild(
      el('div', 'partial', "Partial check — some fields couldn't be read from this page. Verify manually."),
    );
  }

  const cats = el('div', 'cats');
  for (const cat of verdict.categories) {
    const meta = META[cat.category];
    const lm = LEVEL_META[cat.level];
    const row = el('div', `cat-row${cat.hits.length ? ' has-hits' : ''}`);
    row.dataset.cat = cat.category;
    row.style.setProperty('--lv', lm.color);

    const head = el('div', 'cat-head');
    head.appendChild(el('span', 'icon', meta.icon));
    const nameWrap = el('div');
    nameWrap.appendChild(el('div', 'name', meta.name));
    if (cat.note) nameWrap.appendChild(el('div', 'note', cat.note));
    head.appendChild(nameWrap);
    head.appendChild(el('span', 'chip', cat.hits.length ? `${lm.chip} · ${cat.hits.length}` : lm.chip));
    head.appendChild(el('span', `status-dot lv-${cat.level}`));
    if (cat.hits.length) head.appendChild(el('span', 'caret', '▶'));
    row.appendChild(head);

    if (cat.hits.length) {
      const hits = el('div', 'hits');
      for (const hit of cat.hits) hits.appendChild(renderHit(hit));
      row.appendChild(hits);
      row.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('a')) return;
        row.classList.toggle('expanded');
      });
    }
    cats.appendChild(row);
  }
  card.appendChild(cats);

  if (opts.onDeepCheck) {
    const deep = el('div', 'deep');
    const btn = el('button', undefined, '🔬 Deep check (AI — images & implied brands)');
    deep.appendChild(btn);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '';
      btn.appendChild(el('span', 'spin'));
      btn.appendChild(document.createTextNode('Analysing images…'));
      deep.querySelector('.result')?.remove();
      const result = el('div', 'result');
      try {
        const res = await opts.onDeepCheck!();
        if ('error' in res) {
          result.textContent =
            res.error === 'no-key'
              ? 'Add an AI key in Options to enable deep checks (optional — Google Gemini has a free tier).'
              : `Deep check failed (${res.error}) — the rules verdict above still stands.`;
        } else {
          const level: Level =
            (res.recommendation as Level) in LEVEL_META ? (res.recommendation as Level) : 'caution';
          const lm = LEVEL_META[level];
          const emoji = { danger: '🚨', caution: '⚠️', clear: '✅', unknown: '🔎' }[level];
          const noteEmoji = { danger: '❌', caution: '🟡', clear: '✔️', unknown: '🔎' }[level];
          result.style.setProperty('--rv', lm.color);

          const row = el('div', 'rec-row');
          row.appendChild(el('span', 'rec-emoji', emoji));
          row.appendChild(el('span', 'rec-tag', 'AI deep check'));
          row.appendChild(el('span', 'rec', lm.word));
          result.appendChild(row);

          if (res.reasoning) result.appendChild(el('div', 'reason', res.reasoning));
          for (const c of res.concerns) {
            const note = el('div', 'note');
            note.appendChild(el('span', 'n-emoji', noteEmoji));
            note.appendChild(el('span', 'n-text', c));
            result.appendChild(note);
          }
        }
      } catch (e) {
        result.textContent = `Deep check failed — the rules verdict above still stands.`;
      }
      deep.appendChild(result);
      btn.disabled = false;
      btn.textContent = '🔬 Deep check (AI — images & implied brands)';
    });
    card.appendChild(deep);
  }

  const foot = el('div', 'foot');
  foot.appendChild(el('div', 'age', opts.rulesAgeLabel));
  foot.appendChild(
    el('div', undefined, 'Checks known rules only — a green result is not a guarantee.'),
  );
  // brand card
  const brand = el('div', 'brand');
  const head = el('div', 'head');
  const mark = document.createElement('img');
  mark.className = 'mark-img';
  mark.src = logoUrl;
  mark.alt = BRANDING.company;
  head.appendChild(mark);
  const wordmark = el('div', 'wordmark');
  wordmark.appendChild(document.createTextNode(BRANDING.product));
  wordmark.appendChild(el('br'));
  wordmark.appendChild(el('span', 'grad', BRANDING.tagline));
  head.appendChild(wordmark);
  head.appendChild(el('span', 'co-chip', BRANDING.company));
  brand.appendChild(head);
  brand.appendChild(el('div', 'pitch', BRANDING.pitch));
  const chips = el('div', 'chips');
  chips.appendChild(el('span', 'chip-c', `👤 ${BRANDING.owner}`));
  const mail = document.createElement('a');
  mail.className = 'chip-c';
  mail.href = `mailto:${BRANDING.email}`;
  mail.textContent = `📩 ${BRANDING.email}`;
  chips.appendChild(mail);
  if (BRANDING.phone) chips.appendChild(el('span', 'chip-c', `📞 ${BRANDING.phone}`));
  brand.appendChild(chips);
  foot.appendChild(brand);

  // upcoming products with progress bars
  const upcoming = el('div', 'upcoming');
  const upTitle = el('div', 'up-title');
  upTitle.appendChild(document.createTextNode('🚀'));
  upTitle.appendChild(el('span', 'shine', 'Upcoming from Pycode'));
  upcoming.appendChild(upTitle);
  const fills: { node: HTMLElement; pct: number }[] = [];
  for (const item of BRANDING.upcoming) {
    const row = el('div', 'up-item');
    const top = el('div', 'up-top');
    top.appendChild(el('span', undefined, `${item.emoji} ${item.name}`));
    top.appendChild(el('span', 'up-pct', `${item.progress}%`));
    row.appendChild(top);
    const bar = el('div', 'up-bar');
    const fill = el('div', 'up-fill');
    bar.appendChild(fill);
    row.appendChild(bar);
    upcoming.appendChild(row);
    fills.push({ node: fill, pct: item.progress });
  }
  upcoming.appendChild(el('div', 'stay', 'Stay tuned — big things are coming ✨'));
  foot.appendChild(upcoming);
  // animate the bars in after paint
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const f of fills) f.node.style.width = `${f.pct}%`;
    }),
  );
  card.appendChild(foot);

  // ----- badge -----
  const badge = el('div', `badge ${verdict.overall}`);
  badge.style.setProperty('--lv', overall.color);
  badge.appendChild(el('span', 'dot'));
  badge.appendChild(el('span', 'brandname', 'VeRO Detect'));
  badge.appendChild(el('span', 'word', overall.word));
  badge.addEventListener('click', () => card.classList.toggle('open'));

  root.appendChild(card);
  root.appendChild(badge);
  sr.appendChild(root);
}
