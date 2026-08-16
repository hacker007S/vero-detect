import type { Listing } from '../types';

export interface DeepCheckResult {
  brand?: string; logoLikely: boolean; concerns: string[];
  recommendation: 'clear' | 'caution' | 'danger'; reasoning: string;
}

const PROMPT = (l: Listing) => `You are a dropshipping compliance checker for eBay UK.
Analyze this product listing and its images.
Title: ${l.title}
Brand field: ${l.brand ?? 'none'}
Description: ${(l.description ?? '').slice(0, 800)}

Check: (1) is a brand implied even without being named (trade dress, model names, lookalike design)?
(2) is any brand logo or trademark visible in the images? (3) does the item fall in a restricted
class (blade, weapon, medical, safety-critical, adult, battery)?
Reply with ONLY a JSON object: {"brand": string|null, "logoLikely": boolean,
"concerns": string[], "recommendation": "clear"|"caution"|"danger", "reasoning": string}`;

export function buildRequestBody(l: Listing): object {
  return {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT(l) },
        ...l.images.slice(0, 3).map((url) => ({ type: 'image', source: { type: 'url', url } })),
      ],
    }],
  };
}

export function parseDeepCheckResponse(text: string): DeepCheckResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      return {
        brand: j.brand ?? undefined,
        logoLikely: Boolean(j.logoLikely),
        concerns: Array.isArray(j.concerns) ? j.concerns.map(String) : [],
        recommendation: ['clear', 'caution', 'danger'].includes(j.recommendation)
          ? j.recommendation
          : 'caution',
        reasoning: String(j.reasoning ?? ''),
      };
    } catch {
      // fall through to the caution default
    }
  }
  return {
    logoLikely: false,
    concerns: [],
    recommendation: 'caution',
    reasoning: 'Could not parse AI response — treat as caution and check manually.',
  };
}

export async function deepCheck(listing: Listing, apiKey: string): Promise<DeepCheckResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(buildRequestBody(listing)),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('');
  return parseDeepCheckResponse(text);
}
