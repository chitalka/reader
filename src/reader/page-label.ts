import { t } from '../i18n';
import type { PagerSnapshot } from './pager';

export function formatPageLabel(snapshot: PagerSnapshot): string {
  const lastPage = Math.min(
    snapshot.totalPages,
    snapshot.currentPage + snapshot.pagesPerView - 1,
  );

  if (snapshot.paginationExact) {
    return lastPage > snapshot.currentPage
      ? t('reader.pages', {
        first: snapshot.currentPage,
        last: lastPage,
        total: snapshot.totalPages,
      })
      : t('reader.page', { current: snapshot.currentPage, total: snapshot.totalPages });
  }

  return lastPage > snapshot.currentPage
    ? t('reader.currentPages', { first: snapshot.currentPage, last: lastPage })
    : t('reader.currentPage', { current: snapshot.currentPage });
}
