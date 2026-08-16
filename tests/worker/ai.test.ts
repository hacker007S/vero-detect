import { describe, expect, it } from 'vitest';
import { buildRequestBody, parseDeepCheckResponse } from '../../src/worker/ai';
import type { Listing } from '../../src/types';

const listing: Listing = {
  site: 'aliexpress', url: 'https://x', title: 'Cool watch',
  description: 'looks great',
  images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg', 'https://img/4.jpg'],
  missing: [],
};

describe('buildRequestBody', () => {
  const body = buildRequestBody(listing) as {
    model: string;
    messages: { content: { type: string; text?: string; source?: { type: string; url: string } }[] }[];
  };
  it('uses the pinned model and caps images at 3', () => {
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    const imgs = body.messages[0].content.filter((c) => c.type === 'image');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].source).toEqual({ type: 'url', url: 'https://img/1.jpg' });
  });
  it('includes the title in the prompt text', () => {
    const text = body.messages[0].content.find((c) => c.type === 'text')!.text!;
    expect(text).toContain('Cool watch');
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
