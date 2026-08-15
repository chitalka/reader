import { describe, expect, it } from 'vitest';
import { inlineFootnoteText } from './footnotes';

describe('inlineFootnoteText', () => {
  it('normalizes the reference number and adds a trailing period', () => {
    expect(inlineFootnoteText('[1]', '1 Текст сноски.')).toBe('1. Текст сноски.');
    expect(inlineFootnoteText('2', 'Текст другой сноски.')).toBe('2. Текст другой сноски.');
  });

  it('does not duplicate an existing reference number', () => {
    expect(inlineFootnoteText('[12]', '12. Текст сноски.')).toBe('12. Текст сноски.');
  });

  it('preserves note text when a reference label is unavailable', () => {
    expect(inlineFootnoteText('', 'Текст сноски.')).toBe('Текст сноски.');
  });
});
