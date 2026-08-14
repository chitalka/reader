import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderPager, type PagerSnapshot } from './pager';

describe('ReaderPager', () => {
  let viewport: HTMLElement;
  let content: HTMLElement;
  let snapshots: PagerSnapshot[];
  let pager: ReaderPager;
  let animateDescriptor: PropertyDescriptor | undefined;

  function anchor(id: string, page: number, top: number): HTMLElement {
    const element = document.createElement('div');
    element.dataset.readerAnchor = id;
    const left = page * 566 + 10;
    const rect = {
      left,
      right: left + 100,
      top,
      bottom: top + 20,
      width: 100,
      height: 20,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
    Object.defineProperty(element, 'getClientRects', {
      configurable: true,
      value: () => [rect] as unknown as DOMRectList,
    });
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    return element;
  }

  function responsiveAnchor(
    id: string,
    pageAt18px: number,
    pageAt20px: number,
    top: number,
  ): HTMLElement {
    const element = document.createElement('div');
    element.dataset.readerAnchor = id;
    const rect = (): DOMRect => {
      const page = Number.parseFloat(content.style.fontSize) >= 20 ? pageAt20px : pageAt18px;
      const left = page * 566 + 10;
      return {
        left,
        right: left + 100,
        top,
        bottom: top + 20,
        width: 100,
        height: 20,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };
    Object.defineProperty(element, 'getClientRects', {
      configurable: true,
      value: () => [rect()] as unknown as DOMRectList,
    });
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: rect,
    });
    return element;
  }

  function chunk(...children: HTMLElement[]): HTMLElement {
    const element = document.createElement('div');
    element.dataset.readerChunk = '';
    element.append(...children);
    return element;
  }

  function chunkedBook(...chunks: HTMLElement[]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const book = document.createElement('div');
    book.className = 'book';
    book.append(...chunks);
    fragment.append(book);
    return fragment;
  }

  beforeEach(() => {
    animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    viewport = document.createElement('div');
    content = document.createElement('article');
    viewport.append(content);
    document.body.append(viewport);
    snapshots = [];

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        right: 1000,
        top: 0,
        bottom: 600,
        width: 1000,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect),
    });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 2698 });
    Object.defineProperty(content, 'offsetWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'scrollTo', {
      configurable: true,
      value: vi.fn(({ left }: ScrollToOptions) => {
        viewport.scrollLeft = left ?? 0;
      }),
    });

    pager = new ReaderPager(viewport, content, (snapshot) => snapshots.push(snapshot));
  });

  afterEach(() => {
    pager.destroy();
    if (animateDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
    } else {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('moves through a five-page book by two-page spreads', async () => {
    await pager.setBook(document.createDocumentFragment());

    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 1,
      totalPages: 5,
      pagesPerView: 2,
    });
    expect(content.style.getPropertyValue('--page-width')).toBe('434px');
    expect(content.style.getPropertyValue('--page-gap')).toBe('132px');

    pager.next();
    expect(pager.getSnapshot().currentPage).toBe(3);
    expect(viewport.scrollLeft).toBe(1132);

    pager.last();
    expect(pager.getSnapshot().currentPage).toBe(5);
    expect(pager.isLast()).toBe(true);

    pager.previous();
    expect(pager.getSnapshot().currentPage).toBe(3);
    expect(snapshots.length).toBeGreaterThan(3);
  });

  it('accumulates rapid page turns without smooth-scroll restarts', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 4962 });
    await pager.setBook(document.createDocumentFragment());

    pager.next();
    pager.next();
    pager.next();
    pager.next();

    expect(pager.getSnapshot().currentPage).toBe(9);
    const scrollCalls = vi.mocked(viewport.scrollTo).mock.calls
      .map(([options]) => options as ScrollToOptions);
    expect(scrollCalls.at(-1)).toMatchObject({ left: 4528, behavior: 'auto' });
    expect(scrollCalls.every((options) => options.behavior !== 'smooth')).toBe(true);
  });

  it('stores the first anchor whose top-left corner is visible in the spread', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(
      anchor('page-1', 0, 200),
      anchor('right-page', 3, 40),
      anchor('left-page-later', 2, 260),
      anchor('left-page-first', 2, 80),
    );
    await pager.setBook(fragment);

    pager.next();

    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 3,
      anchor: 'left-page-first',
    });
  });

  it('restores the anchor before falling back to the saved column', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(anchor('start', 0, 100), anchor('saved', 2, 100));

    await pager.setBook(fragment, { anchor: 'saved', column: 0 });

    expect(pager.getSnapshot().currentPage).toBe(3);
    expect(pager.getSnapshot().anchor).toBe('saved');
  });

  it('uses the saved column when the anchor no longer exists', async () => {
    await pager.setBook(document.createDocumentFragment(), {
      anchor: 'removed',
      column: 4,
    });

    expect(pager.getSnapshot().currentPage).toBe(5);
  });

  it('keeps the same anchor while font size changes the page layout', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(
      responsiveAnchor('saved', 2, 4, 80),
      responsiveAnchor('replacement', 4, 2, 80),
    );
    await pager.setBook(fragment);
    pager.next();
    expect(pager.getSnapshot().anchor).toBe('saved');

    pager.setFontSize(20);

    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 5,
      anchor: 'saved',
    });
  });

  it('does not replace the anchor during relayout or page-mode changes', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(anchor('saved', 2, 80), anchor('other', 3, 40));
    await pager.setBook(fragment);
    pager.next();
    expect(pager.getSnapshot().anchor).toBe('saved');

    pager.relayout();
    pager.setPageMode('one');

    expect(pager.getSnapshot()).toMatchObject({ currentPage: 2, anchor: 'saved' });
  });

  it('keeps the previous anchor when the new spread has no visible anchor', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(anchor('previous', 0, 80));
    await pager.setBook(fragment);

    pager.next();

    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 3,
      anchor: 'previous',
      anchorVisible: false,
    });
  });

  it('ignores anchors whose top-left corner is vertically outside the viewport', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(anchor('outside', 2, -20), anchor('visible-on-right', 3, 80));
    await pager.setBook(fragment);

    pager.next();

    expect(pager.getSnapshot().anchor).toBe('visible-on-right');
  });

  it('mounts only the chunk containing the restored anchor', async () => {
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('restored', 2, 80));

    await pager.setBook(chunkedBook(first, second), { anchor: 'restored' });

    expect(content.querySelectorAll('[data-reader-chunk]')).toHaveLength(1);
    expect(content.querySelector('[data-reader-anchor="restored"]')).toBe(second.firstElementChild);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(pager.getSnapshot()).toMatchObject({ chunkIndex: 1, anchor: 'restored' });
  });

  it('moves between chunks without mounting the whole book', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));
    await pager.setBook(chunkedBook(first, second));

    pager.next();
    expect(content.querySelectorAll('[data-reader-chunk]')).toHaveLength(1);
    expect(second.isConnected).toBe(true);
    expect(pager.getSnapshot()).toMatchObject({ chunkIndex: 1, anchor: 'second' });

    pager.previous();
    expect(first.isConnected).toBe(true);
    expect(second.isConnected).toBe(false);
    expect(pager.getSnapshot()).toMatchObject({ chunkIndex: 0, anchor: 'first' });
  });

  it('queues rapid turns while a chapter transition is running', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const pendingAnimations: Array<{
      animation: Animation;
      finish: () => void;
    }> = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: vi.fn(() => {
        let finish = (): void => undefined;
        const finished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const animation = {
          cancel: vi.fn(),
          finished,
          playbackRate: 1,
        } as unknown as Animation;
        pendingAnimations.push({ animation, finish });
        return animation;
      }),
    });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));
    const third = chunk(anchor('third', 0, 80));
    await pager.setBook(chunkedBook(first, second, third));

    pager.next();
    pager.next();

    expect(pager.getSnapshot().chunkIndex).toBe(1);
    expect(pendingAnimations).toHaveLength(2);
    expect(pendingAnimations.every(({ animation }) => animation.playbackRate === 1.5)).toBe(true);

    pendingAnimations.slice(0, 2).forEach(({ finish }) => finish());
    await Promise.resolve();
    await Promise.resolve();

    expect(pager.getSnapshot().chunkIndex).toBe(2);
    expect(third.isConnected).toBe(true);
    expect(pendingAnimations).toHaveLength(4);
  });

  it('jumps to a footnote in a detached chunk and returns to the text anchor', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const text = chunk(anchor('reading-place', 0, 80));
    const noteAnchor = anchor('note-anchor', 0, 80);
    noteAnchor.id = 'note-1';
    const notes = chunk(noteAnchor);
    notes.dataset.readerNotes = '';
    const fragment = chunkedBook(text, notes);
    fragment.querySelector<HTMLElement>('.book')?.setAttribute('data-footnotes', 'appendix');
    await pager.setBook(fragment);

    expect(pager.goToId('note-1')).toBe(true);
    expect(notes.isConnected).toBe(true);
    expect(pager.getSnapshot()).toMatchObject({ chunkIndex: 1, anchor: 'note-anchor' });

    expect(pager.goToAnchor('reading-place')).toBe(true);
    expect(text.isConnected).toBe(true);
    expect(notes.isConnected).toBe(false);
  });
});
