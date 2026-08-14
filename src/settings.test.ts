import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizePageButtonsMode } from './settings';

describe('reader settings', () => {
  it('uses automatic page buttons by default', () => {
    expect(DEFAULT_SETTINGS.pageButtons).toBe('auto');
  });

  it.each(['auto', 'show', 'hide'] as const)('accepts the %s page button mode', (mode) => {
    expect(normalizePageButtonsMode(mode)).toBe(mode);
  });

  it('falls back to automatic page buttons for missing or invalid values', () => {
    expect(normalizePageButtonsMode(undefined)).toBe('auto');
    expect(normalizePageButtonsMode('sometimes')).toBe('auto');
  });
});
