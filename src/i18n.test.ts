import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDocumentTranslations,
  formatCompactTimeLeft,
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
      <span data-i18n="settings.author">Oleg Mokhov</span>
    `;

    setLanguage('ru');
    applyDocumentTranslations();

    expect(getLanguage()).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(document.querySelector('button')?.textContent).toBe('Открыть книгу');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Открыть книгу');
    expect(document.querySelector('button')?.getAttribute('title')).toBe('Открыть книгу');
    expect(document.querySelector('textarea')?.placeholder).toBe('Добавьте пометку, если хотите');
    expect(document.querySelector('span')?.textContent).toBe('Олег Мохов');
    expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href)
      .toContain('manifest.ru.webmanifest');
    expect(document.documentElement.hasAttribute('aria-pressed')).toBe(false);
  });

  it('interpolates dynamic reading progress in both languages', () => {
    expect(t('reader.page', { current: 3, total: 10 })).toBe('Page 3 of 10');
    setLanguage('ru');
    expect(t('reader.page', { current: 3, total: 10 })).toBe('Страница 3 из 10');
  });

  it('formats compact remaining time for mobile in both languages', () => {
    expect(formatCompactTimeLeft(125)).toBe('2 hr 5 min left');
    expect(formatCompactTimeLeft(120)).toBe('2 hr left');
    expect(formatCompactTimeLeft(25)).toBe('25 min left');

    setLanguage('ru');
    expect(formatCompactTimeLeft(125)).toBe('До конца 2 часа 5 минут');
    expect(formatCompactTimeLeft(61)).toBe('До конца 1 час 1 минута');
    expect(formatCompactTimeLeft(120)).toBe('До конца 2 часа');
    expect(formatCompactTimeLeft(25)).toBe('До конца 25 минут');
  });
});
