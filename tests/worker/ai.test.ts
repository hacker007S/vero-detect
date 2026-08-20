import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAnthropicBody, buildGeminiBody, buildOpenAIBody, deepCheck,
  extractResponseText, parseDeepCheckResponse, pickGeminiModel, pickGeminiModels,
  splitKeys, MODELS,
} from '../../src/worker/ai';
import type { Listing } from '../../src/types';

const listing: Listing = {
  site: 'aliexpress', url: 'https://x', title: 'Cool watch',
  description: 'looks great',
  images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg', 'https://img/4.jpg'],
  missing: [],
};

describe('buildAnthropicBody', () => {
  const body = buildAnthropicBody(listing) as {
    model: string;
    messages: { content: { type: string; text?: string; source?: { type: string; url: string } }[] }[];
  };
  it('uses the pinned model and caps images at 3', () => {
    expect(body.model).toBe(MODELS.anthropic);
    const imgs = body.messages[0].content.filter((c) => c.type === 'image');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].source).toEqual({ type: 'url', url: 'https://img/1.jpg' });
  });
  it('includes the title in the prompt text', () => {
    const text = body.messages[0].content.find((c) => c.type === 'text')!.text!;
    expect(text).toContain('Cool watch');
  });
});

describe('buildOpenAIBody', () => {
  it('uses image_url parts, capped at 3', () => {
    const body = buildOpenAIBody(listing) as {
      model: string;
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    };
    expect(body.model).toBe(MODELS.openai);
    const imgs = body.messages[0].content.filter((c) => c.type === 'image_url');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].image_url).toEqual({ url: 'https://img/1.jpg' });
  });
});

describe('buildGeminiBody', () => {
  it('uses inline base64 image parts', () => {
    const body = buildGeminiBody(listing, [{ mimeType: 'image/jpeg', data: 'QUJD' }]) as {
      contents: { parts: Record<string, unknown>[] }[];
    };
    const parts = body.contents[0].parts;
    expect(parts[0]).toHaveProperty('text');
    expect(parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  });
});

describe('extractResponseText', () => {
  it('reads each provider response shape', () => {
    expect(extractResponseText('anthropic', { content: [{ type: 'text', text: 'A' }] })).toBe('A');
    expect(extractResponseText('openai', { choices: [{ message: { content: 'B' } }] })).toBe('B');
    expect(
      extractResponseText('gemini', { candidates: [{ content: { parts: [{ text: 'C' }] } }] }),
    ).toBe('C');
  });
});

describe('pickGeminiModel', () => {
  const gc = ['generateContent'];
  it('prefers newest plain flash over flash-lite and older versions', () => {
    expect(
      pickGeminiModel([
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc },
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gc },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: gc },
        { name: 'models/gemini-3.1-pro', supportedGenerationMethods: gc },
      ]),
    ).toBe('gemini-3.5-flash');
  });
  it('skips image/preview/embedding variants and non-generateContent models', () => {
    expect(
      pickGeminiModel([
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: gc },
        { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: gc },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: gc },
      ]),
    ).toBe('gemini-2.5-flash-lite');
  });
  it('returns null when nothing usable exists', () => {
    expect(pickGeminiModel([{ name: 'models/gemini-3.1-pro', supportedGenerationMethods: gc }])).toBeNull();
  });
  it('ranks the full fallback chain: newest flash first, flash-lite variants last', () => {
    expect(
      pickGeminiModels([
        { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: gc },
        { name: 'models/gemini-3.7-flash', supportedGenerationMethods: gc },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc },
      ]),
    ).toEqual(['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });
});

describe('splitKeys', () => {
  it('splits on commas, semicolons, whitespace and newlines', () => {
    expect(splitKeys('AIzaOne, AIzaTwo;AIzaThree\nAIzaFour')).toEqual([
      'AIzaOne', 'AIzaTwo', 'AIzaThree', 'AIzaFour',
    ]);
    expect(splitKeys('  AIzaSolo  ')).toEqual(['AIzaSolo']);
    expect(splitKeys('')).toEqual([]);
  });
});

describe('deepCheck gemini fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OK_JSON = {
    candidates: [{
      content: {
        parts: [{
          text: '{"brand":null,"logoLikely":false,"concerns":[],"recommendation":"clear","reasoning":"ok"}',
        }],
      },
    }],
  };

  function stubChrome(store: Record<string, unknown>) {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => ({ ...store }),
          set: async (v: Record<string, unknown>) => { Object.assign(store, v); },
        },
      },
    });
    return store;
  }

  it('falls back to the next model when the cached model returns 503', async () => {
    const store = stubChrome({ geminiModel: 'gemini-3.7-flash' });
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://img/')) return { ok: false } as Response;
      if (url.includes('/v1beta/models?')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            models: [
              { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        } as Response;
      }
      const model = url.match(/models\/([^:]+):generateContent/)![1];
      calls.push(model);
      if (model === 'gemini-3.7-flash') return { ok: false, status: 503 } as Response;
      return { ok: true, status: 200, json: async () => OK_JSON } as Response;
    });

    const r = await deepCheck(listing, 'gemini', 'AIzaKey');
    expect(r.recommendation).toBe('clear');
    expect(calls).toEqual(['gemini-3.7-flash', 'gemini-2.5-flash']);
    expect(store.geminiModel).toBe('gemini-2.5-flash');
  });

  it('reports overload plainly when every model returns 503', async () => {
    stubChrome({});
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://img/')) return { ok: false } as Response;
      if (url.includes('/v1beta/models?')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });

    await expect(deepCheck(listing, 'gemini', 'AIzaKey')).rejects.toThrow(/overloaded/i);
  });

  it('explains a rejected key (401) and points at AI Studio', async () => {
    stubChrome({});
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://img/')) return { ok: false } as Response;
      return { ok: false, status: 401 } as Response;
    });

    await expect(deepCheck(listing, 'gemini', 'AIzaBadKey')).rejects.toThrow(
      /rejected.*aistudio\.google\.com/is,
    );
  });

  it('rotates to the next key when one key is rejected', async () => {
    const store = stubChrome({});
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://img/')) return { ok: false } as Response;
      if (url.includes('key=AIzaBad')) return { ok: false, status: 401 } as Response;
      if (url.includes('/v1beta/models?')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => OK_JSON } as Response;
    });

    const r = await deepCheck(listing, 'gemini', 'AIzaBad, AIzaGood');
    expect(r.recommendation).toBe('clear');
    expect(store.geminiModel).toBe('gemini-2.5-flash');
  });
});

describe('parseDeepCheckResponse', () => {
  it('extracts JSON even when wrapped in prose', () => {
    const r = parseDeepCheckResponse(
      'Sure: {"logoLikely":true,"concerns":["Rolex crown logo visible"],"recommendation":"danger","reasoning":"logo"}',
    );
    expect(r.recommendation).toBe('danger');
    expect(r.logoLikely).toBe(true);
  });
  it('falls back to caution on unparseable output', () => {
    const r = parseDeepCheckResponse('cannot analyze');
    expect(r.recommendation).toBe('caution');
    expect(r.reasoning).toMatch(/could not parse/i);
  });
});
