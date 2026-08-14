import type { PageMode } from './reader/pager';

export type FootnoteMode = 'appendix' | 'inline';
export type Theme = 'light' | 'dark';

export interface ReaderSettings {
  fontSize: number;
  pageMode: PageMode;
  footnoteMode: FootnoteMode;
  theme: Theme;
  wordsPerMinute: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  pageMode: 'auto',
  footnoteMode: 'appendix',
  theme: 'light',
  wordsPerMinute: 220,
};
