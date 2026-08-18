import type { PageMode } from './reader/pager';
import type { Language } from './i18n';

export type FootnoteMode = 'appendix' | 'inline';
export const PAGE_BUTTON_MODES = ['auto', 'show', 'hide'] as const;
export type PageButtonsMode = typeof PAGE_BUTTON_MODES[number];
export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = typeof THEMES[number];
export type EffectiveTheme = Exclude<Theme, 'auto'>;

export interface ReaderSettings {
  language: Language;
  fontSize: number;
  pageMode: PageMode;
  pageButtons: PageButtonsMode;
  footnoteMode: FootnoteMode;
  theme: Theme;
  wordsPerMinute: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  language: 'en',
  fontSize: 18,
  pageMode: 'auto',
  pageButtons: 'auto',
  footnoteMode: 'appendix',
  theme: 'auto',
  wordsPerMinute: 220,
};

export function normalizePageButtonsMode(value: unknown): PageButtonsMode {
  return PAGE_BUTTON_MODES.includes(value as PageButtonsMode) ? value as PageButtonsMode : 'auto';
}

export function normalizeTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? value as Theme : 'auto';
}

export function effectiveTheme(theme: Theme, prefersDark: boolean): EffectiveTheme {
  return theme === 'auto' ? prefersDark ? 'dark' : 'light' : theme;
}
