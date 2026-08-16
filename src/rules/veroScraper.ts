import type { VeroBrand } from '../types';

const LINK_RE =
  /<a[^>]+href="(https:\/\/ir\.ebaystatic\.com\/pictures\/aw\/pics\/pdf\/us\/help\/community\/vpp\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ');
}

export function parseVeroPage(html: string): VeroBrand[] {
  const out: VeroBrand[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(LINK_RE)) {
    const name = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, profile: m[1], source: 'official' });
  }
  return out;
}
