import { describe, expect, it } from 'vitest';
import { editDistance, fuzzyIncludes } from '../../src/engine/fuzzy';
import { tokens } from '../../src/engine/normalize';

describe('editDistance', () => {
  it('counts substitution, insertion, transposition', () => {
    expect(editDistance('dyson', 'dysson')).toBe(1);
    expect(editDistance('nike', 'nkie')).toBe(1);
    expect(editDistance('dyson', 'dyson')).toBe(0);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });
});

describe('fuzzyIncludes', () => {
  it('catches near-miss brand spellings', () => {
    expect(fuzzyIncludes(tokens('new dysson vacuum filter'), 'dyson')).toBe(true);
  });
  it('never fuzzy-matches short or multi-word terms', () => {
    expect(fuzzyIncludes(tokens('nkie trainers'), 'nike')).toBe(false);
    expect(fuzzyIncludes(tokens('louis vuittonn bag'), 'louis vuitton')).toBe(false);
  });
  it('does not fire on unrelated words', () => {
    expect(fuzzyIncludes(tokens('kitchen season spoon'), 'dyson')).toBe(false);
  });
  it('never treats genuine English words as brand typos', () => {
    expect(fuzzyIncludes(tokens('spring loaded steel clips'), 'sprint')).toBe(false); // Sprint Corp
    expect(fuzzyIncludes(tokens('modern design lamp'), 'mdesign')).toBe(false);
    expect(fuzzyIncludes(tokens('print your photos'), 'sprint')).toBe(false);
  });
});
