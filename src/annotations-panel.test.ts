import { describe, expect, it, vi } from 'vitest';
import { AnnotationPanelController, QuoteMenuController } from './annotations-panel';
import { applyQuoteHighlights, type LocatedSelection } from './reader/quotes';
import type { BookmarkRecord, QuoteRecord } from './reader/state';

describe('AnnotationPanelController', () => {
  it('opens from the header button and creates a bookmark editor', () => {
    document.body.innerHTML = `
      <button id="button"></button><div id="backdrop"></div>
      <section id="panel" hidden><button id="close"></button>
        <button id="bt"></button><button id="qt"></button>
        <div id="bv"><button id="add"></button><div id="bl"></div></div>
        <div id="qv"><div id="ql"></div></div>
        <form id="editor" hidden><h3 id="title"></h3><div id="colors"></div>
          <textarea id="note"></textarea><button id="delete"></button><button id="cancel"></button>
        </form>
      </section>`;
    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const controller = new AnnotationPanelController({
      button: byId('button'),
      panel: byId('panel'),
      backdrop: byId('backdrop'),
      closeButton: byId('close'),
      bookmarksTab: byId('bt'),
      quotesTab: byId('qt'),
      bookmarksView: byId('bv'),
      quotesView: byId('qv'),
      addBookmarkButton: byId('add'),
      bookmarksList: byId('bl'),
      quotesList: byId('ql'),
      editor: byId('editor'),
      editorTitle: byId('title'),
      editorColors: byId('colors'),
      editorNote: byId('note'),
      editorDelete: byId('delete'),
      editorCancel: byId('cancel'),
    }, {
      createBookmark: () => undefined,
      navigateBookmark: () => undefined,
      navigateQuote: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      openChange: () => undefined,
    });
    const bookmark: BookmarkRecord = {
      id: 'bookmark-1',
      kind: 'bookmark',
      bookFingerprint: 'book',
      anchor: 'anchor-1',
      chapter: 'Chapter one',
      progress: 10,
      note: '',
      color: 'purple',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 1, deviceId: 'device' },
    };
    const quote: QuoteRecord = {
      id: 'quote-1',
      kind: 'quote',
      bookFingerprint: 'book',
      start: { anchor: 'anchor-1', offset: 0 },
      end: { anchor: 'anchor-1', offset: 5 },
      exact: 'Quote',
      prefix: '',
      suffix: '',
      progress: 12,
      note: '',
      color: 'purple',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 2, deviceId: 'device' },
    };
    controller.setRecords([bookmark], [quote], true);

    expect(byId('bl').querySelector<HTMLButtonElement>('.annotation-card-main')?.title)
      .toBe('Chapter one');
    expect(byId('bl').querySelector<HTMLButtonElement>('.annotation-card-edit')?.title)
      .toBe('Edit');
    expect(byId('ql').querySelector<HTMLButtonElement>('.annotation-card-main')?.hasAttribute('title'))
      .toBe(false);
    expect(byId('ql').querySelector<HTMLButtonElement>('.annotation-card-edit')?.hasAttribute('title'))
      .toBe(false);

    byId<HTMLButtonElement>('button').click();
    expect(byId('panel').hidden).toBe(false);
    expect(controller.opened).toBe(true);

    byId<HTMLButtonElement>('add').click();
    expect(byId('editor').hidden).toBe(false);
    expect(byId('colors').querySelectorAll('[data-color]')).toHaveLength(6);
  });
});

describe('QuoteMenuController', () => {
  it('colors the live selection and closes after a successful save', async () => {
    document.body.innerHTML = `
      <article id="selection-root"><p data-reader-anchor="1">Это цитата внутри текста</p></article>
      <form id="menu" hidden>
        <h2 id="title"></h2>
        <button id="close" type="button"></button>
        <div id="colors"></div>
        <textarea id="note"></textarea>
        <button id="save" type="submit"></button>
        <button id="delete" type="button"></button>
      </form>`;
    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const selectionRoot = byId('selection-root');
    const onSave = vi.fn(async (
      selected: LocatedSelection,
      note: string,
      color: QuoteRecord['color'],
    ) => {
      const quote: QuoteRecord = {
        id: selected.id,
        kind: 'quote',
        bookFingerprint: 'book',
        start: selected.start,
        end: selected.end,
        exact: selected.exact,
        prefix: selected.prefix,
        suffix: selected.suffix,
        progress: 10,
        note,
        color,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        revision: { counter: 1, deviceId: 'device' },
      };
      applyQuoteHighlights(selectionRoot, [quote]);
    });
    const controller = new QuoteMenuController({
      form: byId<HTMLFormElement>('menu'),
      selectionRoot,
      title: byId('title'),
      closeButton: byId<HTMLButtonElement>('close'),
      colors: byId('colors'),
      note: byId<HTMLTextAreaElement>('note'),
      saveButton: byId<HTMLButtonElement>('save'),
      deleteButton: byId<HTMLButtonElement>('delete'),
    }, onSave, () => undefined);
    const rect = {
      left: 20, right: 80, top: 20, bottom: 40, width: 60, height: 20,
      x: 20, y: 20, toJSON: () => ({}),
    } as DOMRect;
    const range = document.createRange();
    const text = selectionRoot.querySelector('[data-reader-anchor="1"]')?.firstChild;
    if (!text) throw new Error('Expected quote text');
    range.setStart(text, 4);
    range.setEnd(text, 10);
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => [rect] as unknown as DOMRectList,
    });
    Object.defineProperty(range, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    const selection = {
      start: { anchor: '1', offset: 4 },
      end: { anchor: '1', offset: 10 },
      exact: 'цитата',
      prefix: '',
      suffix: '',
      id: 'quote-1',
      range,
    } satisfies LocatedSelection;

    document.getSelection()?.addRange(range);
    controller.open(selection);
    expect(byId('selection-root').dataset.quoteSelectionColor).toBe('purple');
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')?.textContent).toBe('цитата');
    byId<HTMLTextAreaElement>('note').focus();
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')?.textContent).toBe('цитата');
    byId<HTMLButtonElement>('colors').querySelector<HTMLButtonElement>('[data-color="green"]')?.click();
    expect(byId('selection-root').dataset.quoteSelectionColor).toBe('green');
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')?.getAttribute('data-quote-color'))
      .toBe('green');

    byId<HTMLFormElement>('menu').dispatchEvent(new SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(selection, '', 'green');
    expect(controller.opened).toBe(false);
    expect(document.getSelection()?.isCollapsed).toBe(true);
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')).toBeNull();
    expect(selectionRoot.querySelector('[data-reader-quote="quote-1"]')?.textContent).toBe('цитата');

    const savedRange = document.createRange();
    const savedText = selectionRoot.querySelector('[data-reader-anchor="1"]')?.firstChild;
    if (!savedText) throw new Error('Expected quote text after save');
    savedRange.setStart(savedText, 0);
    savedRange.setEnd(savedText, Math.min(3, savedText.textContent?.length ?? 0));
    Object.defineProperty(savedRange, 'getClientRects', {
      configurable: true,
      value: () => [rect] as unknown as DOMRectList,
    });
    Object.defineProperty(savedRange, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    document.getSelection()?.addRange(savedRange);
    controller.open({ ...selection, range: savedRange, exact: savedRange.toString() });
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')).not.toBeNull();
    byId<HTMLButtonElement>('close').click();
    expect(selectionRoot.querySelector('[data-reader-quote-preview]')).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(document.getSelection()?.isCollapsed).toBe(true);
  });
});
