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
(4) separately, note anything visible that makes it a POOR DROPSHIPPING choice — obviously large,
heavy, fragile (glass/ceramic), or fit-dependent — add these to "concerns" prefixed with
"Dropship note:" but do NOT let them change the recommendation, which is about compliance only.
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

export function buildGeminiBody(
  l: Listing,
  imagesBase64: { mimeType: string; data: string }[],
  opts: { disableThinking?: boolean } = { disableThinking: true },
): object {
  return {
    contents: [{
      parts: [
        { text: PROMPT(l) },
        ...imagesBase64.slice(0, IMAGE_CAP).map((img) => ({
          inline_data: { mime_type: img.mimeType, data: img.data },
        })),
      ],
    }],
    generationConfig: {
      // Flash models think by default and thinking eats the token budget,
      // truncating the JSON — force plain JSON output with room to spare.
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
      ...(opts.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
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

export interface GeminiModelInfo {
  name: string; // e.g. "models/gemini-2.5-flash"
  supportedGenerationMethods?: string[];
}

/**
 * Pick the best Gemini model for deep checks from the live ListModels response.
 * Google renames/retires model IDs often, so we never trust a hardcoded one.
 * Preference: supports generateContent, is a "flash" text model (cheap/free tier),
 * not a preview/specialised variant, highest version number; flash beats flash-lite.
 */
export function pickGeminiModels(models: GeminiModelInfo[]): string[] {
  const candidates = models
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((_, i) =>
      (models[i].supportedGenerationMethods ?? ['generateContent']).includes('generateContent'),
    )
    .filter((n) => n.includes('flash'))
    .filter((n) => !/(image|live|audio|tts|embedding|thinking|exp|preview)/.test(n));
  const version = (n: string) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? 0);
  candidates.sort((a, b) => {
    const lite = Number(a.includes('lite')) - Number(b.includes('lite'));
    if (lite !== 0) return lite; // plain flash before flash-lite
    return version(b) - version(a); // newest first
  });
  return candidates;
}

export function pickGeminiModel(models: GeminiModelInfo[]): string | null {
  return pickGeminiModels(models)[0] ?? null;
}

async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
  );
  // 401/403: Google refused the key itself (invalid, deleted, or restricted)
  if (res.status === 401 || res.status === 403) throw new GeminiKeyError(String(res.status));
  if (!res.ok) throw new Error(`gemini ListModels ${res.status}`);
  const data = await res.json();
  const models = pickGeminiModels((data.models ?? []) as GeminiModelInfo[]);
  if (models.length === 0) throw new Error('gemini: no usable flash model on this key');
  return models;
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

/** "key1, key2" → ["key1","key2"] — members can stack multiple free Gemini keys */
export function splitKeys(raw: string): string[] {
  return raw.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
}

class GeminiQuotaError extends Error {}
class GeminiKeyError extends Error {}

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
    // Rotate across every configured free key; within a key, walk the ranked
    // model list (model IDs churn AND free-tier quotas differ per model — the
    // newest models often have none). Cache whichever model answers.
    const geminiOnce = async (key: string): Promise<DeepCheckResult> => {
      const call = (m: string, b: object) =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
          { method: 'POST', headers, body: JSON.stringify(b) },
        );
      const cached = (await chrome.storage.local.get('geminiModel')).geminiModel as string | undefined;
      let candidates = cached ? [cached] : await discoverGeminiModels(key);
      let expanded = !cached;
      let lastStatus = 0;
      for (;;) {
        for (const model of candidates) {
          let res = await call(model, buildGeminiBody(listing, images));
          if (res.status === 400) {
            // some models reject thinkingConfig — retry without it
            res = await call(model, buildGeminiBody(listing, images, { disableThinking: false }));
          }
          if (res.ok) {
            await chrome.storage.local.set({ geminiModel: model });
            return parseDeepCheckResponse(extractResponseText('gemini', await res.json()));
          }
          lastStatus = res.status;
          if (res.status === 401) throw new GeminiKeyError('401');
          // 404/400: model gone or rejects our request shape; 403: this model not
          // available to the key's tier; 429: quota; 500/503: Google-side failure
          // or model overloaded (transient, hits the newest flash models hardest)
          // — all worth trying the next model for.
          if (![400, 403, 404, 429, 500, 503].includes(res.status)) {
            throw new Error(`gemini API ${res.status} (model ${model})`);
          }
        }
        if (expanded) break;
        const all = await discoverGeminiModels(key);
        candidates = all.filter((m) => m !== cached);
        expanded = true;
        if (candidates.length === 0) break;
      }
      throw new GeminiQuotaError(String(lastStatus));
    };

    const keys = splitKeys(apiKey);
    for (let i = 0; i < keys.length; i++) {
      try {
        return await geminiOnce(keys[i]);
      } catch (e) {
        const rotatable = e instanceof GeminiQuotaError || e instanceof GeminiKeyError;
        if (!rotatable || i === keys.length - 1) {
          if (e instanceof GeminiKeyError) {
            throw new Error(
              `Google rejected your Gemini API key (${e.message})${keys.length > 1 ? ' — and every other configured key' : ''} — the key is invalid, was deleted, or is restricted. Create a free key at aistudio.google.com/apikey and paste it into Options.`,
            );
          }
          if (e instanceof GeminiQuotaError) {
            if (e.message === '429') {
              throw new Error(
                `Gemini free quota is used up on ${keys.length > 1 ? 'all your keys' : 'your key'} right now — wait a minute (limits reset per-minute and daily), add another free key in Options, or switch provider.`,
              );
            }
            if (e.message === '503' || e.message === '500') {
              throw new Error(
                'Gemini is temporarily overloaded on every available model (Google-side, not your key) — try again in a minute or switch provider in Options.',
              );
            }
            throw new Error(`gemini API ${e.message}`);
          }
          throw e;
        }
        // quota exhausted or key rejected — rotate to the next key
      }
    }
    throw new Error('no Gemini key configured');
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${provider} API ${res.status}`);
  const data = await res.json();
  return parseDeepCheckResponse(extractResponseText(provider, data));
}
