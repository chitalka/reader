import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyQuoteHighlights,
  locateSelection,
  rangeForLocators,
  rangeForQuote,
  restoreSelection,
} from './quotes';
import type { QuoteRecord } from './state';

describe('quote locators and highlights', () => {
  beforeEach(() => {
    vi.stubGlobal('CSS', { escape: (value: string) => value.replaceAll('"', '\\"') });
    document.body.innerHTML = `
      <article id="root">
        <p data-reader-anchor="1">Первый абзац для цитаты.</p>
        <p data-reader-anchor="2">Второй абзац продолжает выбранный текст.</p>
      </article>`;
  });

  it('locates and restores a selection spanning multiple paragraphs', () => {
    const root = document.querySelector<HTMLElement>('#root')!;
    const firstText = root.querySelector<HTMLElement>('[data-reader-anchor="1"]')!.firstChild!;
    const secondText = root.querySelector<HTMLElement>('[data-reader-anchor="2"]')!.firstChild!;
    const range = document.createRange();
    range.setStart(firstText, 7);
    range.setEnd(secondText, 13);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const located = locateSelection(root, 'book-hash', selection);

    expect(located).toMatchObject({
      start: { anchor: '1', offset: 7 },
      end: { anchor: '2', offset: 13 },
    });
    expect(located?.exact).toContain('абзац для цитаты');
    expect(rangeForLocators(root, located!.start, located!.end)?.toString()).toBe(located?.exact);
  });

  it('reapplies persistent highlights without duplicating wrapper elements', () => {
    const root = document.querySelector<HTMLElement>('#root')!;
    const quote: QuoteRecord = {
      id: 'quote-1',
      kind: 'quote',
      bookFingerprint: 'book-hash',
      start: { anchor: '1', offset: 7 },
      end: { anchor: '2', offset: 13 },
      exact: 'абзац для цитаты.Второй абзац',
      prefix: 'Первый ',
      suffix: ' продолжает',
      progress: 10,
      note: '',
      color: 'green',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 1, deviceId: 'device' },
    };

    applyQuoteHighlights(root, [quote]);
    const firstCount = root.querySelectorAll('[data-reader-quote="quote-1"]').length;
    expect(firstCount).toBeGreaterThan(1);
    expect(root.querySelector('[data-quote-color="green"]')).not.toBeNull();

    applyQuoteHighlights(root, [quote]);
    expect(root.querySelectorAll('[data-reader-quote="quote-1"]')).toHaveLength(firstCount);
    restoreSelection(root, quote);
    expect(window.getSelection()?.toString()).toContain('абзац для цитаты');
  });

  it('recovers a quote from its exact text when saved offsets have drifted', () => {
    const root = document.querySelector<HTMLElement>('#root')!;
    const quote: QuoteRecord = {
      id: 'quote-drifted',
      kind: 'quote',
      bookFingerprint: 'book-hash',
      start: { anchor: '1', offset: 0 },
      end: { anchor: '1', offset: 5 },
      exact: 'абзац для цитаты',
      prefix: 'Первый ',
      suffix: '.',
      progress: 10,
      note: '',
      color: 'purple',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 1, deviceId: 'device' },
    };

    expect(rangeForQuote(root, quote)?.toString()).toBe('абзац для цитаты');
  });

  it('does not restore a stale range when the exact quote no longer exists', () => {
    const root = document.querySelector<HTMLElement>('#root')!;
    const quote: QuoteRecord = {
      id: 'quote-missing',
      kind: 'quote',
      bookFingerprint: 'book-hash',
      start: { anchor: '1', offset: 0 },
      end: { anchor: '1', offset: 5 },
      exact: 'текст, которого больше нет',
      prefix: '',
      suffix: '',
      progress: 10,
      note: '',
      color: 'purple',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 1, deviceId: 'device' },
    };

    expect(rangeForQuote(root, quote)).toBeUndefined();
  });
});
