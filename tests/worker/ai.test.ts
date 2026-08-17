import { describe, expect, it } from 'vitest';
import {
  buildAnthropicBody, buildGeminiBody, buildOpenAIBody,
  extractResponseText, parseDeepCheckResponse, pickGeminiModel, pickGeminiModels, MODELS,
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
