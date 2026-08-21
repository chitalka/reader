import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { formatPageLabel } from './page-label';
import type { PagerSnapshot } from './pager';

function snapshot(overrides: Partial<PagerSnapshot> = {}): PagerSnapshot {
  return {
    currentPage: 58,
    totalPages: 700,
    pagesPerView: 1,
    progress: 8,
    anchorVisible: true,
    paginationExact: false,
    chunkIndex: 10,
    chunkPage: 2,
    ...overrides,
  };
}

describe('reader page label', () => {
  afterEach(() => setLanguage('en'));

  it('updates the known current page while the total is still being counted', () => {
    expect(formatPageLabel(snapshot())).toBe('Page 58');
    expect(formatPageLabel(snapshot({ currentPage: 59 }))).toBe('Page 59');
  });

  it('updates both visible pages in a pending two-page spread', () => {
    expect(formatPageLabel(snapshot({ pagesPerView: 2 }))).toBe('Pages 58–59');
  });

  it('includes the total only after pagination is exact', () => {
    expect(formatPageLabel(snapshot({ paginationExact: true }))).toBe('Page 58 of 700');
    expect(formatPageLabel(snapshot({ paginationExact: true, pagesPerView: 2 })))
      .toBe('Pages 58–59 of 700');
  });

  it('formats pending page labels in Russian', () => {
    setLanguage('ru');
    expect(formatPageLabel(snapshot())).toBe('Страница 58');
    expect(formatPageLabel(snapshot({ pagesPerView: 2 }))).toBe('Страницы 58–59');
  });
});
