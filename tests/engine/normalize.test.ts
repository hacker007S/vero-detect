import { describe, expect, it } from 'vitest';
import { normalize, tokens, containsPhrase, brandMatchTerm } from '../../src/engine/normalize';

describe('normalize', () => {
  it('lowercases, strips punctuation/accents, collapses spaces', () => {
    expect(normalize('  DYSON — V8™ (Animal+) ')).toBe('dyson v8 animal');
    expect(normalize('Café Nestlé')).toBe('cafe nestle');
  });
});

describe('containsPhrase', () => {
  const t = tokens('genuine louis vuitton wallet brand new');
  it('matches consecutive tokens', () => {
    expect(containsPhrase(t, 'louis vuitton')).toBe(true);
    expect(containsPhrase(t, 'vuitton wallet')).toBe(true);
  });
  it('rejects non-consecutive and absent phrases', () => {
    expect(containsPhrase(t, 'louis wallet')).toBe(false);
    expect(containsPhrase(t, 'gucci')).toBe(false);
  });
});

describe('brandMatchTerm', () => {
  it('strips company suffixes', () => {
    expect(brandMatchTerm('3M Company')).toBe('3m');
    expect(brandMatchTerm('Alessi S.p.A.')).toBe('alessi');
    expect(brandMatchTerm('Zen Design Group Ltd')).toBe('zen design');
  });
  it('returns empty for unmatchably generic terms', () => {
    expect(brandMatchTerm('The One Company')).toBe('');
    expect(brandMatchTerm('It')).toBe('');
  });
});
