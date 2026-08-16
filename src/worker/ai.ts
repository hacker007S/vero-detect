import type { Listing } from '../types';

export type Provider = 'anthropic' | 'openai' | 'gemini';

export interface DeepCheckResult {
  brand?: string; logoLikely: boolean; concerns: string[];
  recommendation: 'clear' | 'caution' | 'danger'; reasoning: string;
}

export const MODELS: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

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

const IMAGE_CAP = 3;

export function buildAnthropicBody(l: Listing): object {
  return {
    model: MODELS.anthropic,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT(l) },
        ...l.images.slice(0, IMAGE_CAP).map((url) => ({ type: 'image', source: { type: 'url', url } })),
      ],
    }],
  };
}

export function buildOpenAIBody(l: Listing): object {
  return {
    model: MODELS.openai,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT(l) },
        ...l.images.slice(0, IMAGE_CAP).map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
    }],
  };
}

export function buildGeminiBody(l: Listing, imagesBase64: { mimeType: string; data: string }[]): object {
  return {
    contents: [{
      parts: [
        { text: PROMPT(l) },
        ...imagesBase64.slice(0, IMAGE_CAP).map((img) => ({
          inline_data: { mime_type: img.mimeType, data: img.data },
        })),
      ],
    }],
    generationConfig: { maxOutputTokens: 500 },
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

export function extractResponseText(provider: Provider, data: unknown): string {
  const d = data as Record<string, any>;
  if (provider === 'anthropic') {
    return ((d.content ?? []) as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
  }
  if (provider === 'openai') {
    return String(d.choices?.[0]?.message?.content ?? '');
  }
  return ((d.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
    .map((p) => p.text ?? '')
    .join('');
}

async function fetchImageBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    return { mimeType: blob.type || 'image/jpeg', data: btoa(bin) };
  } catch {
    return null;
  }
}

export async function deepCheck(
  listing: Listing,
  provider: Provider,
  apiKey: string,
): Promise<DeepCheckResult> {
  let url: string;
  let headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: object;

  if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = {
      ...headers,
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    body = buildAnthropicBody(listing);
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { ...headers, authorization: `Bearer ${apiKey}` };
    body = buildOpenAIBody(listing);
  } else {
    // Gemini needs images inline as base64 — fetch them first, skip any that fail
    const images = (
      await Promise.all(listing.images.slice(0, 3).map(fetchImageBase64))
    ).filter((i): i is { mimeType: string; data: string } => i !== null);
    url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${encodeURIComponent(apiKey)}`;
    body = buildGeminiBody(listing, images);
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${provider} API ${res.status}`);
  const data = await res.json();
  return parseDeepCheckResponse(extractResponseText(provider, data));
}
