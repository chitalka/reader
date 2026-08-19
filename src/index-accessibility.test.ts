import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

const markup = new DOMParser().parseFromString(
  html,
  'text/html',
);

describe('reader shell accessibility', () => {
  it('keeps deployment navigation and primary controls self-describing', () => {
    expect(markup.querySelector<HTMLAnchorElement>('.brand')?.getAttribute('href')).toBe('./');
    expect(markup.querySelector<HTMLAnchorElement>('.brand')?.getAttribute('aria-label'))
      .toBe('Chitalka — home');
    expect(markup.querySelector<HTMLImageElement>('.brand-mascot')?.getAttribute('src'))
      .toBe('./icons/icon-192.png');
    expect(markup.querySelector('.brand-mark')).toBeNull();
    expect(markup.querySelector<HTMLInputElement>('#book-file')?.getAttribute('aria-label'))
      .toBe('Open book');
    expect(markup.querySelector<HTMLButtonElement>('#google-connect')?.getAttribute('aria-label'))
      .toBe('Connect Google Drive');
    expect(markup.querySelector<HTMLButtonElement>('#yandex-connect')?.getAttribute('aria-label'))
      .toBe('Connect Yandex Disk');
    const languageSelect = markup.querySelector<HTMLSelectElement>('#language-select');
    expect(languageSelect?.getAttribute('aria-labelledby')).toBe('language-select-label');
    expect(Array.from(languageSelect?.options ?? []).map((option) => option.value))
      .toEqual(['en', 'ru']);
    expect(markup.querySelector('.language-select')?.closest('#settings-panel')).not.toBeNull();
    expect(markup.querySelector('.open-button .upload-icon')).not.toBeNull();
    expect(markup.querySelector('.open-button-label')).toBeNull();
    expect(markup.querySelector('.open-button-icon')).toBeNull();
  });

  it('provides hover hints for controls except quote actions', () => {
    const untitledControls = Array.from(markup.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => !button.closest('#quote-menu'))
      .filter((button) => !button.title)
      .map((button) => button.id || button.className);

    expect(untitledControls).toEqual([]);
    expect(markup.querySelector('.language-select')?.getAttribute('title'))
      .toBe('Interface language');
    expect(markup.querySelector('.open-button')?.getAttribute('title')).toBe('Open book');
    expect(Array.from(markup.querySelectorAll('#quote-menu button'))
      .every((button) => !button.hasAttribute('title'))).toBe(true);
  });

  it('offers light, automatic, and dark themes in that order', () => {
    const themes = Array.from(markup.querySelectorAll<HTMLInputElement>('input[name="theme"]'));
    expect(themes.map((input) => input.value)).toEqual(['light', 'auto', 'dark']);
  });

  it('publishes the author, license, year, and public release version in settings', () => {
    const projectInfo = markup.querySelector<HTMLElement>('.settings-project-info');
    const author = projectInfo?.querySelector<HTMLAnchorElement>('a[href="https://t.me/olegmokhov"]');
    const license = projectInfo?.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/chitalka/reader/blob/master/LICENSE"]',
    );

    expect(projectInfo?.closest('#settings-panel')).not.toBeNull();
    expect(projectInfo?.querySelector('time')?.textContent).toBe('2026');
    expect(author?.textContent).toBe('Oleg Mokhov');
    expect(author?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(license?.textContent).toBe('MIT License');
    expect(projectInfo?.textContent?.replace(/\s+/gu, ' ').trim())
      .toBe('© 2026 · Oleg Mokhov · MIT License · v.2.01');
  });

  it('covers the unfinished reader with an accessible initial splash', () => {
    const splash = markup.querySelector<HTMLElement>('#app-splash');
    const app = markup.querySelector<HTMLElement>('#app');

    expect(splash?.getAttribute('role')).toBe('status');
    expect(splash?.textContent).toContain('Opening book');
    expect(app?.hasAttribute('inert')).toBe(true);
    expect(app?.getAttribute('aria-hidden')).toBe('true');
    const splashPosition = splash?.compareDocumentPosition(app!) ?? 0;
    expect(splashPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(splash?.querySelector<HTMLImageElement>('.app-splash__mascot')?.getAttribute('src'))
      .toBe('./icons/icon-192.png');
    expect(splash?.querySelector('.app-splash__content')).not.toBeNull();
    expect(splash?.querySelector('.app-splash__label')?.tagName).toBe('P');
    expect(splash?.querySelector('.app-splash__brand')).toBeNull();
    expect(splash?.querySelector('.app-splash__dots')).toBeNull();
  });

  it('exposes installable application metadata', () => {
    expect(markup.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href'))
      .toBe('./manifest.webmanifest');
    expect(markup.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.getAttribute('href'))
      .toBe('./icons/icon-192.png');
    expect(markup.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"]')?.getAttribute('href'))
      .toBe('./icons/icon-192.png');
  });
});
