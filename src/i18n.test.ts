import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDocumentTranslations,
  getLanguage,
  normalizeLanguage,
  setLanguage,
  t,
} from './i18n';

describe('interface localization', () => {
  afterEach(() => setLanguage('en'));

  it('defaults invalid and missing values to English', () => {
    expect(normalizeLanguage(undefined)).toBe('en');
    expect(normalizeLanguage('de')).toBe('en');
    expect(t('header.openBook')).toBe('Open book');
  });

  it('switches text, attributes, document language, and manifest without reloading', () => {
    document.head.innerHTML = '<link rel="manifest" href="./manifest.webmanifest">';
    document.body.innerHTML = `
      <button
        data-i18n="header.openBook"
        data-i18n-aria-label="header.openBook"
        data-i18n-title="header.openBook"
      >Open book</button>
      <textarea data-i18n-placeholder="annotations.optional"></textarea>
    `;

    setLanguage('ru');
    applyDocumentTranslations();

    expect(getLanguage()).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(document.querySelector('button')?.textContent).toBe('Открыть книгу');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Открыть книгу');
    expect(document.querySelector('button')?.getAttribute('title')).toBe('Открыть книгу');
    expect(document.querySelector('textarea')?.placeholder).toBe('Необязательно');
    expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href)
      .toContain('manifest.ru.webmanifest');
    expect(document.documentElement.hasAttribute('aria-pressed')).toBe(false);
  });

  it('interpolates dynamic reading progress in both languages', () => {
    expect(t('reader.page', { current: 3, total: 10 })).toBe('Page 3 of 10');
    setLanguage('ru');
    expect(t('reader.page', { current: 3, total: 10 })).toBe('Страница 3 из 10');
  });
});
