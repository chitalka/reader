import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  effectiveTheme,
  normalizeFullscreenStatusMode,
  normalizePageButtonsMode,
  normalizeTheme,
} from './settings';

describe('reader settings', () => {
  it('uses English by default', () => {
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });

  it('uses automatic page buttons by default', () => {
    expect(DEFAULT_SETTINGS.pageButtons).toBe('auto');
  });

  it('shows reading percentage in full-screen mode by default', () => {
    expect(DEFAULT_SETTINGS.fullscreenStatus).toBe('progress');
  });

  it('uses the system color scheme by default', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('auto');
  });

  it.each(['auto', 'show', 'hide'] as const)('accepts the %s page button mode', (mode) => {
    expect(normalizePageButtonsMode(mode)).toBe(mode);
  });

  it('falls back to automatic page buttons for missing or invalid values', () => {
    expect(normalizePageButtonsMode(undefined)).toBe('auto');
    expect(normalizePageButtonsMode('sometimes')).toBe('auto');
  });

  it.each(['page', 'progress', 'none'] as const)('accepts the %s full-screen status', (mode) => {
    expect(normalizeFullscreenStatusMode(mode)).toBe(mode);
  });

  it('falls back to reading percentage for a missing or invalid full-screen status', () => {
    expect(normalizeFullscreenStatusMode(undefined)).toBe('progress');
    expect(normalizeFullscreenStatusMode('time')).toBe('progress');
  });

  it.each(['auto', 'light', 'dark'] as const)('accepts the %s theme', (theme) => {
    expect(normalizeTheme(theme)).toBe(theme);
  });

  it('falls back to the automatic theme for missing or invalid values', () => {
    expect(normalizeTheme(undefined)).toBe('auto');
    expect(normalizeTheme('sepia')).toBe('auto');
  });

  it('resolves the automatic theme from the current system preference', () => {
    expect(effectiveTheme('auto', false)).toBe('light');
    expect(effectiveTheme('auto', true)).toBe('dark');
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme('dark', false)).toBe('dark');
  });
});
