import type { PageMode } from './reader/pager';

export type FootnoteMode = 'appendix' | 'inline';
export const PAGE_BUTTON_MODES = ['auto', 'show', 'hide'] as const;
export type PageButtonsMode = typeof PAGE_BUTTON_MODES[number];
export type Theme = 'light' | 'dark';

export interface ReaderSettings {
  fontSize: number;
  pageMode: PageMode;
  pageButtons: PageButtonsMode;
  footnoteMode: FootnoteMode;
  theme: Theme;
  wordsPerMinute: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  pageMode: 'auto',
  pageButtons: 'auto',
  footnoteMode: 'appendix',
  theme: 'light',
  wordsPerMinute: 220,
};

export function normalizePageButtonsMode(value: unknown): PageButtonsMode {
  return PAGE_BUTTON_MODES.includes(value as PageButtonsMode) ? value as PageButtonsMode : 'auto';
}
