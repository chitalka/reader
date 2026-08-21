import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderPager, type PagerSnapshot } from './pager';

describe('ReaderPager', () => {
  let viewport: HTMLElement;
  let content: HTMLElement;
  let motionCompanion: HTMLElement;
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
    motionCompanion = document.createElement('div');
    viewport.append(content);
    document.body.append(viewport, motionCompanion);
    snapshots = [];

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });
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

    pager = new ReaderPager(
      viewport,
      content,
      (snapshot) => snapshots.push(snapshot),
      motionCompanion,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    pager.destroy();
    Reflect.deleteProperty(document, 'startViewTransition');
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
    expect(content.style.getPropertyValue('--page-content-height')).toBe('600px');

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

  it('previews and commits an absolute page without changing the active page first', async () => {
    await pager.setBook(document.createDocumentFragment());
    const changesBeforePreview = snapshots.length;

    const target = pager.skimTarget(4);

    expect(target).toMatchObject({
      currentPage: 3,
      lastPage: 4,
      totalPages: 5,
      chunkIndex: 0,
      chunkPage: 3,
    });
    expect(pager.getSnapshot().currentPage).toBe(1);
    expect(snapshots).toHaveLength(changesBeforePreview);

    expect(pager.commitSkim(target!)).toBe(true);
    expect(pager.getSnapshot().currentPage).toBe(3);
  });

  it('renders a skim preview into a separate host without replacing the book', async () => {
    const source = document.createDocumentFragment();
    const paragraph = anchor('preview-anchor', 0, 80);
    paragraph.textContent = 'Preview text';
    source.append(paragraph);
    await pager.setBook(source);
    const target = pager.skimTarget(1)!;
    const activeBook = content.querySelector('.book');
    const changesBeforePreview = snapshots.length;
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 250 });
    document.body.append(host);

    pager.renderSkimPreview(target, host);

    expect(host.querySelector('.skim-preview-content')).not.toBeNull();
    expect(host.textContent).toContain('Preview text');
    expect(content.querySelector('.book')).toBe(activeBook);
    expect(pager.getSnapshot().currentPage).toBe(1);
    expect(snapshots).toHaveLength(changesBeforePreview);
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

  it('moves the full-screen page numbers with the same page-turn motion', async () => {
    const contentAnimate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }) as unknown as Animation);
    const companionAnimate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }) as unknown as Animation);
    Object.defineProperty(content, 'animate', { configurable: true, value: contentAnimate });
    Object.defineProperty(motionCompanion, 'animate', {
      configurable: true,
      value: companionAnimate,
    });
    await pager.setBook(document.createDocumentFragment());

    pager.next();

    expect(motionCompanion.style.getPropertyValue('--reader-page-turn-distance')).toBe('1132px');
    expect(companionAnimate).toHaveBeenCalledTimes(1);
    expect(companionAnimate.mock.calls[0]).toEqual(contentAnimate.mock.calls[0]);
  });

  it('does not animate the page numbers when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const contentAnimate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }) as unknown as Animation);
    const companionAnimate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }) as unknown as Animation);
    Object.defineProperty(content, 'animate', { configurable: true, value: contentAnimate });
    Object.defineProperty(motionCompanion, 'animate', {
      configurable: true,
      value: companionAnimate,
    });
    await pager.setBook(document.createDocumentFragment());

    pager.next();

    expect(contentAnimate).not.toHaveBeenCalled();
    expect(companionAnimate).not.toHaveBeenCalled();
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

  it('finds the nearest table-of-contents anchor before the reading position', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(
      anchor('part', 0, 40),
      anchor('chapter-1', 0, 80),
      anchor('reading-place', 2, 80),
      anchor('chapter-2', 3, 80),
    );
    await pager.setBook(fragment, { anchor: 'reading-place' });

    expect(pager.closestPrecedingAnchor(
      ['part', 'chapter-1', 'chapter-2'],
      pager.getSnapshot().anchor,
    )).toBe('chapter-1');
  });

  it('keeps a selected table-of-contents target until the next page turn', async () => {
    const fragment = document.createDocumentFragment();
    fragment.append(
      anchor('previous-chapter', 2, 80),
      anchor('selected-chapter', 3, 80),
    );
    await pager.setBook(fragment);

    expect(pager.goToAnchor('selected-chapter', true)).toBe(true);

    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 3,
      anchor: 'selected-chapter',
      anchorVisible: true,
    });
  });

  it('navigates to the page containing an exact text offset inside a long anchor', async () => {
    const longParagraph = anchor('long-paragraph', 0, 80);
    longParagraph.textContent = 'Текст длинного абзаца';
    const targetLeft = 4 * 566 + 20;
    const targetRect = {
      left: targetLeft,
      right: targetLeft + 12,
      top: 80,
      bottom: 100,
      width: 12,
      height: 20,
      x: targetLeft,
      y: 80,
      toJSON: () => ({}),
    } as DOMRect;
    const createRange = document.createRange.bind(document);
    const rangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      Object.defineProperty(range, 'getClientRects', {
        configurable: true,
        value: () => [targetRect] as unknown as DOMRectList,
      });
      Object.defineProperty(range, 'getBoundingClientRect', {
        configurable: true,
        value: () => targetRect,
      });
      return range;
    });
    const fragment = document.createDocumentFragment();
    fragment.append(longParagraph);
    await pager.setBook(fragment);

    expect(pager.goToTextOffset('long-paragraph', 8, true)).toBe(true);
    expect(pager.getSnapshot()).toMatchObject({
      currentPage: 5,
      anchor: 'long-paragraph',
      anchorVisible: false,
    });
    rangeSpy.mockRestore();
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

  it('reuses an exact cached page count when entering an already measured chunk', async () => {
    vi.useFakeTimers();
    const scrollWidth = vi.fn(() => 434);
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: scrollWidth });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));

    await pager.setBook(chunkedBook(first, second));
    await vi.advanceTimersByTimeAsync(40);
    expect(pager.getSnapshot().paginationExact).toBe(true);
    scrollWidth.mockClear();

    pager.next();

    expect(pager.getSnapshot()).toMatchObject({ chunkIndex: 1, anchor: 'second' });
    expect(scrollWidth).not.toHaveBeenCalled();
  });

  it('remeasures the mounted chunk after an image finishes loading', async () => {
    const scrollWidth = vi.fn(() => 434);
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: scrollWidth });
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    const current = chunk(anchor('first', 0, 80), image);

    await pager.setBook(chunkedBook(current));
    scrollWidth.mockClear();
    image.dispatchEvent(new Event('load'));

    expect(scrollWidth).toHaveBeenCalledTimes(1);
  });

  it('ignores ResizeObserver notifications when viewport geometry did not change', async () => {
    pager.destroy();
    let resize: ResizeObserverCallback = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }

      observe = observe;
      disconnect = disconnect;
    });
    const scrollWidth = vi.fn(() => 434);
    Object.defineProperty(content, 'scrollWidth', { configurable: true, get: scrollWidth });
    pager = new ReaderPager(
      viewport,
      content,
      (snapshot) => snapshots.push(snapshot),
      motionCompanion,
    );
    await pager.setBook(chunkedBook(chunk(anchor('first', 0, 80))));
    scrollWidth.mockClear();

    resize([], {} as ResizeObserver);
    expect(scrollWidth).not.toHaveBeenCalled();

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 900 });
    resize([], {} as ResizeObserver);
    expect(scrollWidth).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(viewport);
  });

  it('finishes exact pagination when Safari never runs requestIdleCallback', async () => {
    vi.useFakeTimers();
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('requestIdleCallback', vi.fn(() => 41));
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback);
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));

    await pager.setBook(chunkedBook(first, second));
    expect(pager.getSnapshot().paginationExact).toBe(false);

    await vi.advanceTimersByTimeAsync(400);

    expect(pager.getSnapshot().paginationExact).toBe(true);
    expect(snapshots.at(-1)?.paginationExact).toBe(true);
    expect(cancelIdleCallback).toHaveBeenCalledWith(41);
  });

  it('keeps the current pagination queue when Safari runs a cancelled idle callback late', async () => {
    vi.useFakeTimers();
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));

    await pager.setBook(chunkedBook(first, second));
    pager.setFontSize(20);
    await vi.advanceTimersByTimeAsync(20);
    expect(idleCallbacks).toHaveLength(2);

    idleCallbacks[0]!();
    await vi.advanceTimersByTimeAsync(400);

    expect(pager.getSnapshot().paginationExact).toBe(true);
    expect(snapshots.at(-1)?.paginationExact).toBe(true);
  });

  it('measures several background chunks in each Safari layout pass', async () => {
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const chunks = Array.from({ length: 6 }, (_, index) => (
      chunk(anchor(`chunk-${index}`, 0, 80))
    ));

    await pager.setBook(chunkedBook(...chunks));
    expect(pager.getSnapshot().paginationExact).toBe(false);

    idleCallbacks.shift()!();
    expect(pager.getSnapshot().paginationExact).toBe(false);
    idleCallbacks.shift()!();

    expect(pager.getSnapshot().paginationExact).toBe(true);
  });

  it('keeps rapid chapter turns on the latest requested destination', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    let firstUpdate: (() => void) | undefined;
    let resolveFirstUpdate = (): void => undefined;
    const skipped: Array<ReturnType<typeof vi.fn>> = [];
    let transitionCount = 0;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: ViewTransitionUpdateCallback) => {
        const skipTransition = vi.fn();
        skipped.push(skipTransition);
        transitionCount += 1;
        if (transitionCount === 1) {
          firstUpdate = () => { void update(); };
          const updateCallbackDone = new Promise<void>((resolve) => {
            resolveFirstUpdate = resolve;
          });
          return {
            finished: new Promise<void>(() => undefined),
            ready: Promise.resolve(),
            types: new Set<string>(),
            updateCallbackDone,
            skipTransition,
          } as unknown as ViewTransition;
        }
        void update();
        return {
          finished: new Promise<void>(() => undefined),
          ready: Promise.resolve(),
          types: new Set<string>(),
          updateCallbackDone: Promise.resolve(),
          skipTransition,
        } as unknown as ViewTransition;
      }),
    });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));
    const third = chunk(anchor('third', 0, 80));
    const fourth = chunk(anchor('fourth', 0, 80));
    await pager.setBook(chunkedBook(first, second, third, fourth));

    pager.next();
    pager.next();
    pager.next();

    expect(pager.getSnapshot().chunkIndex).toBe(0);
    expect(firstUpdate).toBeTypeOf('function');

    firstUpdate?.();
    resolveFirstUpdate();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(pager.getSnapshot().chunkIndex).toBe(3);
    expect(fourth.isConnected).toBe(true);
    expect(skipped.some((skip) => skip.mock.calls.length > 0)).toBe(true);

    pager.previous();
    await Promise.resolve();
    expect(pager.getSnapshot().chunkIndex).toBe(2);
    expect(third.isConnected).toBe(true);

    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('uses a lightweight chapter fallback without cloning the mounted chapter', async () => {
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 434 });
    const first = chunk(anchor('first', 0, 80));
    const second = chunk(anchor('second', 0, 80));
    const clone = vi.spyOn(content, 'cloneNode');
    await pager.setBook(chunkedBook(first, second));

    pager.next();

    expect(pager.getSnapshot().chunkIndex).toBe(1);
    expect(second.isConnected).toBe(true);
    expect(clone).not.toHaveBeenCalled();
  });

  it('tracks and settles a touch swipe without changing semantic state mid-drag', async () => {
    await pager.setBook(document.createDocumentFragment());
    const animate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }) as unknown as Animation);
    Object.defineProperty(content, 'animate', { configurable: true, value: animate });

    pager.beginSwipe();
    pager.updateSwipe(-80);

    expect(pager.getSnapshot().currentPage).toBe(1);
    expect(content.style.transform).toBe('translateX(-80px)');
    expect(motionCompanion.style.transform).toBe('translateX(-80px)');
    expect(pager.finishSwipe(1)).toBe(true);
    expect(pager.getSnapshot().currentPage).toBe(3);
    expect(content.style.transform).toBe('');
    expect(motionCompanion.style.transform).toBe('');

    pager.beginSwipe();
    pager.updateSwipe(20);
    pager.cancelSwipe();
    expect(animate).toHaveBeenCalled();
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
