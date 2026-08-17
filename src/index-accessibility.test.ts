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
      .toBe('Читалка — на главную');
    expect(markup.querySelector<HTMLImageElement>('.brand-mascot')?.getAttribute('src'))
      .toBe('./icons/icon-192.png');
    expect(markup.querySelector('.brand-mark')).toBeNull();
    expect(markup.querySelector<HTMLInputElement>('#book-file')?.getAttribute('aria-label'))
      .toBe('Открыть книгу');
    expect(markup.querySelector<HTMLButtonElement>('#google-connect')?.getAttribute('aria-label'))
      .toBe('Подключить Google Drive');
    expect(markup.querySelector<HTMLButtonElement>('#yandex-connect')?.getAttribute('aria-label'))
      .toBe('Подключить Яндекс.Диск');
  });

  it('covers the unfinished reader with an accessible initial splash', () => {
    const splash = markup.querySelector<HTMLElement>('#app-splash');
    const app = markup.querySelector<HTMLElement>('#app');

    expect(splash?.getAttribute('role')).toBe('status');
    expect(splash?.textContent).toContain('Открываем книгу');
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
