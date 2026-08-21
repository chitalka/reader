import { MOTION_DURATION, MOTION_EASING, prefersReducedMotion } from '../motion';

export type PageMode = 'auto' | 'one' | 'two';

export interface PagerSnapshot {
  currentPage: number;
  totalPages: number;
  pagesPerView: number;
  progress: number;
  anchor?: string;
  anchorVisible: boolean;
  paginationExact: boolean;
  chunkIndex: number;
  chunkPage: number;
}

export interface PageTurnMotion {
  startOffset: number;
  spreadDistance: number;
  duration: number;
  easing: string;
}

export interface SkimTarget {
  currentPage: number;
  lastPage: number;
  totalPages: number;
  pagesPerView: number;
  progress: number;
  chunkIndex: number;
  chunkPage: number;
  bookGeneration: number;
  layoutKey: string;
}

export interface RestorePosition {
  anchor?: string;
  column?: number;
  chunk?: number;
  chunkColumn?: number;
}

interface ReaderChunk {
  element: HTMLElement;
  anchors: HTMLElement[];
  wordCount: number;
  notes: boolean;
}

interface LayoutGeometry {
  columnGap: number;
  columnWidth: number;
  key: string;
  pageContentHeight: number;
  pageExtent: number;
  viewportHeight: number;
  viewportWidth: number;
}

interface IdleCallbacks {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const PAGE_TURN_DURATION = MOTION_DURATION.page;
const PAGE_TURN_EASING = MOTION_EASING.move;
const MEASUREMENT_DELAY_MS = 32;
const IDLE_MEASUREMENT_WATCHDOG_MS = 300;
const MEASUREMENT_BATCH_SIZE = 4;

export class ReaderPager {
  private currentColumn = 0;
  private currentChunkIndex = 0;
  private pageCount = 1;
  private pagesPerView = 1;
  private pageExtent = 1;
  private pageMode: PageMode = 'auto';
  private fontSize = 18;
  private activeAnchor?: string;
  private activeAnchorVisible = false;
  private resizeFrame?: number;
  private readonly resizeObserver?: ResizeObserver;
  private bookRoot?: HTMLElement;
  private chunks: ReaderChunk[] = [];
  private navigationChunks: number[] = [];
  private anchorElements = new Map<string, HTMLElement>();
  private anchorChunks = new Map<string, number>();
  private anchorOrder = new Map<string, number>();
  private idElements = new Map<string, HTMLElement>();
  private idChunks = new Map<string, number>();
  private chunkPageCounts = new Map<number, number>();
  private readonly layoutPageCountCache = new Map<string, Map<number, number>>();
  private layout?: LayoutGeometry;
  private estimatedWordsPerPage = 100;
  private measurementGeneration = 0;
  private measurementIdleHandle?: number;
  private measurementTimeoutHandle?: number;
  private idleMeasurementsReliable = true;
  private bookGeneration = 0;
  private pageAnimation?: Animation;
  private companionAnimation?: Animation;
  private viewTransition?: ViewTransition;
  private viewTransitionGeneration = 0;
  private transitionUpdatePending = false;
  private pendingSteps = 0;
  private swiping = false;
  private swipeBaseOffset = 0;
  private swipeOffset = 0;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly content: HTMLElement,
    private readonly onChange: (snapshot: PagerSnapshot, motion?: PageTurnMotion) => void,
    private readonly motionCompanion?: HTMLElement,
  ) {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
      this.resizeObserver.observe(this.viewport);
    } else {
      window.addEventListener('resize', this.handleWindowResize);
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleWindowResize);
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.bookGeneration += 1;
    this.cancelMeasurements();
    this.cancelNavigationAnimations();
  }

  async setBook(fragment: DocumentFragment, restore?: RestorePosition): Promise<void> {
    const generation = ++this.bookGeneration;
    this.cancelMeasurements();
    this.cancelNavigationAnimations();
    this.layoutPageCountCache.clear();
    this.chunkPageCounts.clear();
    this.anchorElements.clear();
    this.anchorChunks.clear();
    this.anchorOrder.clear();
    this.idElements.clear();
    this.idChunks.clear();
    this.currentColumn = 0;
    this.activeAnchor = restore?.anchor;
    this.activeAnchorVisible = false;

    this.bookRoot = this.extractBook(fragment);
    this.content.style.fontSize = `${this.fontSize}px`;
    this.indexChunks();
    this.rebuildNavigationChunks();

    const targetChunk = this.restoreChunk(restore);
    this.mountChunk(targetChunk);
    this.content.replaceChildren(this.bookRoot);
    this.performLayout({
      anchor: restore?.anchor,
      chunk: targetChunk,
      chunkColumn: restore?.chunkColumn,
      column: restore?.column,
    });

    if (!this.activeAnchor) {
      this.captureVisibleAnchor();
      this.moveToCurrent(false);
    }

    const images = this.chunks.flatMap((chunk) => Array.from(chunk.element.querySelectorAll('img')));
    for (const image of images) {
      if (image.complete) continue;
      const relayoutIfMounted = (): void => {
        if (generation === this.bookGeneration && image.isConnected) this.scheduleLayout();
      };
      image.addEventListener('load', relayoutIfMounted, { once: true });
      image.addEventListener('error', relayoutIfMounted, { once: true });
    }

    void document.fonts?.ready?.then(() => {
      if (generation === this.bookGeneration) this.scheduleLayout();
    });
  }

  setPageMode(mode: PageMode): void {
    if (this.pageMode === mode) return;
    this.cancelNavigationAnimations();
    this.pageMode = mode;
    this.scheduleLayout();
  }

  setFontSize(size: number): void {
    if (this.fontSize === size) return;
    this.cancelNavigationAnimations();
    this.fontSize = size;
    this.content.style.fontSize = `${size}px`;
    this.scheduleLayout();
  }

  relayout(): void {
    this.cancelNavigationAnimations();
    this.scheduleLayout();
  }

  next(): void {
    this.requestStep(1);
  }

  previous(): void {
    this.requestStep(-1);
  }

  beginSwipe(): void {
    if (!this.bookRoot || !this.chunks.length || this.transitionUpdatePending) return;
    this.interruptViewTransition();
    const offset = this.currentAnimatedOffset();
    this.cancelPageAnimation();
    this.swiping = true;
    this.swipeBaseOffset = offset;
    this.swipeOffset = offset;
    this.content.classList.add('is-swiping');
    this.content.style.transform = `translateX(${offset}px)`;
    if (this.motionCompanion) this.motionCompanion.style.transform = `translateX(${offset}px)`;
  }

  updateSwipe(distance: number): void {
    if (!this.swiping) return;
    const atBoundary = (distance > 0 && this.isFirst()) || (distance < 0 && this.isLast());
    this.swipeOffset = this.swipeBaseOffset + distance * (atBoundary ? 0.28 : 1);
    this.content.style.transform = `translateX(${this.swipeOffset}px)`;
    if (this.motionCompanion) {
      this.motionCompanion.style.transform = `translateX(${this.swipeOffset}px)`;
    }
  }

  finishSwipe(direction: -1 | 0 | 1): boolean {
    if (!this.swiping) return false;
    if (direction === 0) {
      this.cancelSwipe();
      return false;
    }
    if (this.step(direction)) return true;
    this.cancelSwipe();
    return false;
  }

  cancelSwipe(): void {
    if (!this.swiping) return;
    const offset = this.swipeOffset;
    this.clearSwipeStyles();
    if (
      Math.abs(offset) < 0.5
      || this.prefersReducedMotion()
      || typeof this.content.animate !== 'function'
    ) return;
    this.animatePageTurn({
      startOffset: offset,
      spreadDistance: Math.max(1, this.pageExtent * this.pagesPerView),
      duration: MOTION_DURATION.exit,
      easing: MOTION_EASING.enter,
    });
  }

  first(): void {
    this.cancelNavigationAnimations();
    const firstChunk = this.navigationChunks[0];
    if (firstChunk === undefined) return;
    this.activeAnchor = undefined;
    this.mountChunk(firstChunk);
    this.performLayout({ chunk: firstChunk, chunkColumn: 0 });
    this.captureVisibleAnchor();
    this.moveToCurrent(false);
  }

  last(): void {
    this.cancelNavigationAnimations();
    const lastChunk = this.navigationChunks.at(-1);
    if (lastChunk === undefined) return;
    this.activeAnchor = undefined;
    this.mountChunk(lastChunk);
    this.performLayout({ chunk: lastChunk, chunkColumn: Number.MAX_SAFE_INTEGER });
    this.captureVisibleAnchor();
    this.moveToCurrent(false);
  }

  isFirst(): boolean {
    return this.navigationChunks[0] === this.currentChunkIndex && this.currentColumn === 0;
  }

  isLast(): boolean {
    return this.navigationChunks.at(-1) === this.currentChunkIndex
      && this.currentColumn >= this.lastSpreadStart();
  }

  goToElement(element: HTMLElement, preserveTarget = false): void {
    const chunkIndex = this.chunkForElement(element);
    if (chunkIndex === undefined || !this.navigationChunks.includes(chunkIndex)) return;
    this.cancelNavigationAnimations();
    this.activeAnchor = element.dataset.readerAnchor;
    if (chunkIndex !== this.currentChunkIndex) this.mountChunk(chunkIndex);
    this.performLayout({ anchor: this.activeAnchor, chunk: chunkIndex });
    if (!preserveTarget) this.captureVisibleAnchor();
    this.moveToCurrent(false);
  }

  goToAnchor(anchor: string, preserveTarget = false): boolean {
    const element = this.anchorElements.get(anchor);
    if (!element) return false;
    this.goToElement(element, preserveTarget);
    return true;
  }

  goToTextOffset(anchor: string, offset: number, preserveTarget = false): boolean {
    const element = this.anchorElements.get(anchor);
    const chunkIndex = this.anchorChunks.get(anchor);
    if (!element || chunkIndex === undefined || !this.navigationChunks.includes(chunkIndex)) return false;
    this.cancelNavigationAnimations();
    this.activeAnchor = anchor;
    if (chunkIndex !== this.currentChunkIndex) this.mountChunk(chunkIndex);
    this.performLayout({ anchor, chunk: chunkIndex });

    const page = this.pageForTextOffset(element, offset);
    if (page !== undefined) {
      this.currentColumn = this.spreadStart(page);
      this.activeAnchor = anchor;
      const anchorRect = element.getClientRects()[0];
      const viewportRect = this.viewport.getBoundingClientRect();
      const anchorPage = this.pageForElement(element);
      this.activeAnchorVisible = Boolean(
        anchorRect
        && anchorPage >= this.currentColumn
        && anchorPage < this.currentColumn + this.pagesPerView
        && anchorRect.top >= viewportRect.top - 0.5
        && anchorRect.top < viewportRect.bottom + 0.5,
      );
      this.moveToCurrent(false);
      if (!preserveTarget) {
        this.captureVisibleAnchor();
        this.moveToCurrent(false);
      }
    }
    return true;
  }

  goToId(id: string): boolean {
    const element = this.idElements.get(id);
    const chunkIndex = this.idChunks.get(id);
    if (!element || chunkIndex === undefined || !this.navigationChunks.includes(chunkIndex)) return false;
    this.cancelNavigationAnimations();
    if (chunkIndex !== this.currentChunkIndex) this.mountChunk(chunkIndex);
    this.activeAnchor = element.dataset.readerAnchor
      ?? element.querySelector<HTMLElement>('[data-reader-anchor]')?.dataset.readerAnchor;
    this.performLayout({ anchor: this.activeAnchor, chunk: chunkIndex });
    this.captureVisibleAnchor();
    this.moveToCurrent(false);
    return true;
  }

  closestPrecedingAnchor(candidates: readonly string[], anchor?: string): string | undefined {
    const currentOrder = anchor ? this.anchorOrder.get(anchor) : undefined;
    if (currentOrder === undefined) return undefined;
    let active: string | undefined;
    let activeOrder = -1;
    for (const candidate of candidates) {
      const order = this.anchorOrder.get(candidate);
      if (order !== undefined && order <= currentOrder && order >= activeOrder) {
        active = candidate;
        activeOrder = order;
      }
    }
    return active;
  }

  getSnapshot(): PagerSnapshot {
    const counts = this.navigationChunks.map((chunkIndex) => this.pageCountForSnapshot(chunkIndex));
    const navigationIndex = Math.max(0, this.navigationChunks.indexOf(this.currentChunkIndex));
    const pagesBefore = counts.slice(0, navigationIndex).reduce((sum, count) => sum + count, 0);
    const totalPages = Math.max(1, counts.reduce((sum, count) => sum + count, 0));
    const currentPage = Math.min(totalPages, pagesBefore + this.currentColumn + 1);
    const lastVisiblePage = Math.min(totalPages, currentPage + this.pagesPerView - 1);

    return {
      currentPage,
      totalPages,
      pagesPerView: this.pagesPerView,
      progress: totalPages <= 1 ? 100 : (lastVisiblePage / totalPages) * 100,
      anchor: this.activeAnchor,
      anchorVisible: this.activeAnchorVisible,
      paginationExact: this.navigationChunks.every((chunkIndex) => this.chunkPageCounts.has(chunkIndex)),
      chunkIndex: this.currentChunkIndex,
      chunkPage: this.currentColumn + 1,
    };
  }

  skimTarget(requestedPage: number): SkimTarget | undefined {
    if (!this.layout || !this.navigationChunks.length) return undefined;
    const counts = this.navigationChunks.map((chunkIndex) => this.pageCountForSnapshot(chunkIndex));
    const totalPages = Math.max(1, counts.reduce((sum, count) => sum + count, 0));
    let remaining = Math.max(1, Math.min(totalPages, Math.round(requestedPage)));
    let pagesBefore = 0;

    for (let index = 0; index < this.navigationChunks.length; index += 1) {
      const count = counts[index] ?? 1;
      if (remaining > count && index < this.navigationChunks.length - 1) {
        remaining -= count;
        pagesBefore += count;
        continue;
      }
      const chunkIndex = this.navigationChunks[index]!;
      const chunkColumn = Math.floor((remaining - 1) / this.pagesPerView) * this.pagesPerView;
      const currentPage = Math.min(totalPages, pagesBefore + chunkColumn + 1);
      const lastPage = Math.min(totalPages, currentPage + this.pagesPerView - 1, pagesBefore + count);
      return {
        currentPage,
        lastPage,
        totalPages,
        pagesPerView: this.pagesPerView,
        progress: totalPages <= 1 ? 100 : (lastPage / totalPages) * 100,
        chunkIndex,
        chunkPage: chunkColumn + 1,
        bookGeneration: this.bookGeneration,
        layoutKey: this.layout.key,
      };
    }
    return undefined;
  }

  renderSkimPreview(target: SkimTarget, host: HTMLElement): string | undefined {
    const geometry = this.layout;
    const chunk = this.chunks[target.chunkIndex];
    if (
      !this.bookRoot
      || !geometry
      || !chunk
      || target.bookGeneration !== this.bookGeneration
      || target.layoutKey !== geometry.key
    ) return undefined;

    const preview = document.createElement('article');
    preview.className = 'book-content skim-preview-content';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.width = `${geometry.viewportWidth}px`;
    preview.style.height = `${geometry.viewportHeight}px`;
    preview.style.fontSize = `${this.fontSize}px`;
    this.applyGeometry(preview, geometry);

    const book = this.bookRoot.cloneNode(false) as HTMLElement;
    const clone = chunk.element.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    for (const element of Array.from(clone.querySelectorAll<HTMLElement>('[id]'))) {
      element.removeAttribute('id');
    }
    book.append(clone);
    preview.append(book);
    host.replaceChildren(preview);
    host.style.aspectRatio = `${geometry.viewportWidth} / ${geometry.viewportHeight}`;
    void preview.offsetWidth;

    const chunkColumn = target.chunkPage - 1;
    const contentLeft = preview.getBoundingClientRect().left;
    const firstVisibleAnchor = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('[data-reader-anchor]'))]
      .filter((element) => element.dataset.readerAnchor !== undefined)
      .map((element, order) => {
        const rect = element.getClientRects()[0];
        const page = rect
          ? Math.max(0, Math.floor((rect.left - contentLeft) / geometry.pageExtent + 0.02))
          : -1;
        return { element, order, page, top: rect?.top ?? Number.MAX_SAFE_INTEGER };
      })
      .filter(({ page }) => page >= chunkColumn && page < chunkColumn + target.pagesPerView)
      .sort((first, second) => first.page - second.page || first.top - second.top || first.order - second.order)[0]
      ?.element.dataset.readerAnchor;

    const scale = Math.max(0.01, Math.min(
      host.clientWidth / geometry.viewportWidth,
      host.clientHeight / geometry.viewportHeight,
    ));
    preview.style.left = `${Math.max(0, (host.clientWidth - geometry.viewportWidth * scale) / 2)}px`;
    preview.style.transform = `scale(${scale}) translateX(${-chunkColumn * geometry.pageExtent}px)`;
    return firstVisibleAnchor;
  }

  commitSkim(target: SkimTarget): boolean {
    if (
      !this.layout
      || target.bookGeneration !== this.bookGeneration
      || target.layoutKey !== this.layout.key
      || !this.navigationChunks.includes(target.chunkIndex)
    ) return false;

    const targetColumn = target.chunkPage - 1;
    if (target.chunkIndex === this.currentChunkIndex) {
      this.cancelNavigationAnimations();
      this.activeAnchor = undefined;
      this.currentColumn = Math.min(
        Math.floor(targetColumn / this.pagesPerView) * this.pagesPerView,
        this.lastSpreadStart(),
      );
      this.moveToCurrent(true, true);
      return true;
    }

    const direction = this.navigationChunks.indexOf(target.chunkIndex)
      > this.navigationChunks.indexOf(this.currentChunkIndex) ? 1 : -1;
    this.transitionToChunk(target.chunkIndex, targetColumn, direction);
    return true;
  }

  private readonly handleWindowResize = (): void => {
    this.scheduleLayout();
  };

  private extractBook(fragment: DocumentFragment): HTMLElement {
    const renderedBook = fragment.querySelector<HTMLElement>('.book');
    if (renderedBook) {
      const markedChunks = Array.from(
        renderedBook.querySelectorAll<HTMLElement>(':scope > [data-reader-chunk]'),
      );
      if (markedChunks.length) return renderedBook;

      const wrapper = document.createElement('div');
      wrapper.className = 'book-chunk';
      wrapper.dataset.readerChunk = '';
      wrapper.append(...Array.from(renderedBook.childNodes));
      renderedBook.append(wrapper);
      return renderedBook;
    }

    const book = document.createElement('div');
    book.className = 'book';
    const wrapper = document.createElement('div');
    wrapper.className = 'book-chunk';
    wrapper.dataset.readerChunk = '';
    wrapper.append(fragment);
    book.append(wrapper);
    return book;
  }

  private indexChunks(): void {
    if (!this.bookRoot) return;
    let anchorOrder = 0;
    const elements = Array.from(
      this.bookRoot.querySelectorAll<HTMLElement>(':scope > [data-reader-chunk]'),
    );
    this.chunks = elements.map((element, chunkIndex) => {
      const descendants = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];
      const anchors = descendants.filter((candidate) => candidate.dataset.readerAnchor !== undefined);
      for (const anchor of anchors) {
        const id = anchor.dataset.readerAnchor;
        if (id === undefined) continue;
        this.anchorElements.set(id, anchor);
        this.anchorChunks.set(id, chunkIndex);
        this.anchorOrder.set(id, anchorOrder++);
      }
      for (const candidate of descendants) {
        if (!candidate.id) continue;
        this.idElements.set(candidate.id, candidate);
        this.idChunks.set(candidate.id, chunkIndex);
      }
      const wordCount = element.textContent?.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      return {
        element,
        anchors,
        wordCount,
        notes: element.dataset.readerNotes !== undefined,
      };
    });
    this.bookRoot.replaceChildren();
  }

  private rebuildNavigationChunks(): void {
    const inlineFootnotes = this.bookRoot?.dataset.footnotes === 'inline';
    this.navigationChunks = this.chunks.flatMap((chunk, index) => (
      inlineFootnotes && chunk.notes ? [] : [index]
    ));
    if (!this.navigationChunks.length && this.chunks.length) this.navigationChunks = [0];
  }

  private restoreChunk(restore?: RestorePosition): number {
    const anchorChunk = restore?.anchor ? this.anchorChunks.get(restore.anchor) : undefined;
    if (anchorChunk !== undefined && this.navigationChunks.includes(anchorChunk)) return anchorChunk;
    if (restore?.chunk !== undefined && this.navigationChunks.includes(restore.chunk)) return restore.chunk;
    return this.navigationChunks[0] ?? 0;
  }

  private mountChunk(chunkIndex: number): void {
    if (!this.bookRoot) return;
    const chunk = this.chunks[chunkIndex];
    if (!chunk) return;
    this.currentChunkIndex = chunkIndex;
    this.currentColumn = 0;
    this.pageCount = 1;
    this.viewport.scrollTo({ left: 0, behavior: 'auto' });
    this.bookRoot.replaceChildren(chunk.element);
  }

  private adjacentChunk(direction: -1 | 1): number | undefined {
    const index = this.navigationChunks.indexOf(this.currentChunkIndex);
    return this.navigationChunks[index + direction];
  }

  private requestStep(direction: -1 | 1): void {
    if (this.transitionUpdatePending) {
      this.pendingSteps += direction;
      return;
    }
    this.interruptViewTransition();
    this.step(direction);
  }

  private step(direction: -1 | 1): boolean {
    if (direction > 0 && this.currentColumn < this.lastSpreadStart()) {
      this.currentColumn = Math.min(this.lastSpreadStart(), this.currentColumn + this.pagesPerView);
      this.moveToCurrent(true, true);
      return true;
    }
    if (direction < 0 && this.currentColumn > 0) {
      this.currentColumn = Math.max(0, this.currentColumn - this.pagesPerView);
      this.moveToCurrent(true, true);
      return true;
    }

    const adjacent = this.adjacentChunk(direction);
    if (adjacent === undefined) return false;
    this.transitionToChunk(
      adjacent,
      direction > 0 ? 0 : Number.MAX_SAFE_INTEGER,
      direction,
    );
    return true;
  }

  private flushPendingSteps(): void {
    while (!this.transitionUpdatePending && this.pendingSteps !== 0) {
      const direction = Math.sign(this.pendingSteps) as -1 | 1;
      this.pendingSteps -= direction;
      this.interruptViewTransition();
      if (!this.step(direction)) {
        this.pendingSteps = 0;
        break;
      }
    }
  }

  private scheduleLayout(): void {
    if (!this.bookRoot || !this.chunks.length) return;
    this.cancelNavigationAnimations();
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = undefined;
      this.performLayout({
        anchor: this.activeAnchor,
        chunk: this.currentChunkIndex,
        chunkColumn: this.currentColumn,
      });
    });
  }

  private performLayout(
    restore: RestorePosition = {
      anchor: this.activeAnchor,
      chunk: this.currentChunkIndex,
      chunkColumn: this.currentColumn,
    },
  ): void {
    if (!this.bookRoot || !this.chunks.length) return;
    this.rebuildNavigationChunks();
    if (!this.navigationChunks.includes(this.currentChunkIndex)) {
      const replacement = this.navigationChunks.find((index) => index > this.currentChunkIndex)
        ?? this.navigationChunks.at(-1);
      if (replacement === undefined) return;
      this.activeAnchor = undefined;
      this.mountChunk(replacement);
    }

    const geometry = this.calculateGeometry();
    const layoutChanged = geometry.key !== this.layout?.key;
    this.layout = geometry;
    this.pagesPerView = this.pagesForViewport(geometry.viewportWidth);
    this.pageExtent = geometry.pageExtent;
    this.motionCompanion?.style.setProperty(
      '--reader-page-turn-distance',
      `${this.pageExtent * this.pagesPerView}px`,
    );
    this.applyGeometry(this.content, geometry);
    void this.content.offsetWidth;

    if (layoutChanged) {
      const cachedCounts = this.layoutPageCountCache.get(geometry.key);
      this.chunkPageCounts = new Map(cachedCounts ?? []);
      this.estimatedWordsPerPage = this.initialWordsPerPage(geometry);
    }

    const mountedChunk = this.chunks[this.currentChunkIndex];
    this.pageCount = this.pagesForElement(this.content, mountedChunk.element, geometry);
    this.recordPageCount(this.currentChunkIndex, this.pageCount);

    const restoreAnchorChunk = restore.anchor && this.anchorChunks.get(restore.anchor);
    const restoreElement = restore.anchor && this.anchorElements.get(restore.anchor);
    if (
      restoreElement
      && restoreAnchorChunk === this.currentChunkIndex
      && restoreElement.getClientRects().length > 0
    ) {
      this.currentColumn = this.spreadStart(this.pageForElement(restoreElement));
      this.activeAnchor = restore.anchor;
      this.activeAnchorVisible = true;
    } else {
      this.activeAnchorVisible = false;
      const fallbackColumn = restore.chunk === this.currentChunkIndex
        ? restore.chunkColumn ?? (this.navigationChunks.length === 1 ? restore.column : undefined)
        : undefined;
      this.currentColumn = this.spreadStart(fallbackColumn ?? this.currentColumn);
    }

    this.currentColumn = Math.min(this.currentColumn, this.lastSpreadStart());
    this.moveToCurrent(false);
    if (layoutChanged) this.restartMeasurements();
  }

  private calculateGeometry(): LayoutGeometry {
    const viewportWidth = Math.max(1, this.viewport.clientWidth);
    const viewportHeight = Math.max(1, this.viewport.clientHeight);
    const contentStyle = window.getComputedStyle(this.content);
    const verticalPadding = (Number.parseFloat(contentStyle.paddingTop) || 0)
      + (Number.parseFloat(contentStyle.paddingBottom) || 0);
    const pageContentHeight = Math.max(1, viewportHeight - verticalPadding);
    const pagesPerView = this.pagesForViewport(viewportWidth);
    const pageGap = viewportWidth < 640 ? 20 : 36;
    const innerPageMargin = pagesPerView === 2 ? (viewportWidth < 640 ? 24 : 48) : 0;
    const pageWidth = Math.max(
      1,
      (viewportWidth - pageGap * (pagesPerView - 1)) / pagesPerView,
    );
    const columnWidth = Math.max(1, pageWidth - innerPageMargin);
    const columnGap = pageGap + innerPageMargin * 2;
    const pageExtent = columnWidth + columnGap;
    const footnoteMode = this.bookRoot?.dataset.footnotes ?? 'appendix';
    return {
      columnGap,
      columnWidth,
      pageContentHeight,
      pageExtent,
      viewportHeight,
      viewportWidth,
      key: [viewportWidth, viewportHeight, pagesPerView, this.fontSize, footnoteMode].join(':'),
    };
  }

  private pagesForViewport(viewportWidth: number): number {
    const narrow = viewportWidth < 920;
    return this.pageMode === 'one' || (this.pageMode === 'auto' && narrow) ? 1 : 2;
  }

  private applyGeometry(target: HTMLElement, geometry: LayoutGeometry): void {
    target.style.width = `${geometry.viewportWidth}px`;
    target.style.setProperty('--page-width', `${geometry.columnWidth}px`);
    target.style.setProperty('--page-gap', `${geometry.columnGap}px`);
    target.style.setProperty('--page-content-height', `${geometry.pageContentHeight}px`);
  }

  private pagesForElement(
    container: HTMLElement,
    element: HTMLElement,
    geometry: LayoutGeometry,
  ): number {
    const containerLeft = container.getBoundingClientRect().left;
    const measuredElements = [
      element,
      ...Array.from(element.querySelectorAll<HTMLElement>('[data-reader-anchor]')),
    ];
    const rects = measuredElements.flatMap((candidate) => Array.from(candidate.getClientRects()));
    const maxRight = rects.reduce(
      (right, rect) => Math.max(right, rect.right - containerLeft),
      0,
    );
    const rectPages = maxRight > 0
      ? Math.max(1, Math.floor((maxRight - 0.5) / geometry.pageExtent) + 1)
      : 1;
    const overflowPages = container.scrollWidth > geometry.viewportWidth + 1
      ? Math.max(
        1,
        Math.ceil((container.scrollWidth + geometry.columnGap) / geometry.pageExtent - 0.01),
      )
      : 1;
    return Math.max(rectPages, overflowPages);
  }

  private pageForElement(element: HTMLElement): number {
    const contentLeft = this.content.getBoundingClientRect().left;
    const elementLeft = this.firstRect(element).left;
    const offset = Math.max(0, elementLeft - contentLeft);
    return Math.min(this.pageCount - 1, Math.floor(offset / this.pageExtent + 0.02));
  }

  private pageForTextOffset(element: HTMLElement, requestedOffset: number): number | undefined {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('script, style')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    let candidate = walker.nextNode();
    while (candidate) {
      nodes.push(candidate as Text);
      candidate = walker.nextNode();
    }
    if (!nodes.length) return this.pageForElement(element);

    const total = nodes.reduce((sum, node) => sum + node.data.length, 0);
    const target = Math.max(0, Math.min(Math.max(0, total - 1), requestedOffset));
    let consumed = 0;
    let selected = nodes.at(-1)!;
    let localOffset = selected.data.length ? selected.data.length - 1 : 0;
    for (const node of nodes) {
      const end = consumed + node.data.length;
      if (target < end) {
        selected = node;
        localOffset = target - consumed;
        break;
      }
      consumed = end;
    }

    const range = document.createRange();
    try {
      range.setStart(selected, localOffset);
      range.setEnd(selected, Math.min(selected.data.length, localOffset + 1));
    } catch {
      return undefined;
    }
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return undefined;
    const contentLeft = this.content.getBoundingClientRect().left;
    const pageOffset = Math.max(0, rect.left - contentLeft);
    return Math.min(this.pageCount - 1, Math.floor(pageOffset / this.pageExtent + 0.02));
  }

  private firstRect(element: HTMLElement): DOMRect {
    return element.getClientRects()[0] ?? element.getBoundingClientRect();
  }

  private firstVisibleAnchor(): string | undefined {
    const viewportRect = this.viewport.getBoundingClientRect();
    const lastVisiblePage = Math.min(
      this.pageCount - 1,
      this.currentColumn + this.pagesPerView - 1,
    );
    const candidates = this.chunks[this.currentChunkIndex]?.anchors.flatMap((element, order) => {
      const rect = element.getClientRects()[0];
      if (!rect || rect.top < viewportRect.top - 0.5 || rect.top >= viewportRect.bottom + 0.5) {
        return [];
      }

      const page = this.pageForElement(element);
      if (page < this.currentColumn || page > lastVisiblePage) return [];
      return [{ element, order, page, top: rect.top }];
    }) ?? [];
    candidates.sort((first, second) => (
      first.page - second.page || first.top - second.top || first.order - second.order
    ));
    return candidates[0]?.element.dataset.readerAnchor;
  }

  private captureVisibleAnchor(): void {
    const anchor = this.firstVisibleAnchor();
    this.activeAnchorVisible = Boolean(anchor);
    if (anchor) this.activeAnchor = anchor;
  }

  private chunkForElement(element: HTMLElement): number | undefined {
    const anchor = element.dataset.readerAnchor;
    if (anchor !== undefined) return this.anchorChunks.get(anchor);
    if (element.id) return this.idChunks.get(element.id);
    return this.chunks.findIndex((chunk) => chunk.element === element || chunk.element.contains(element));
  }

  private spreadStart(page: number): number {
    const clampedPage = Math.max(0, Math.min(this.pageCount - 1, page));
    return Math.floor(clampedPage / this.pagesPerView) * this.pagesPerView;
  }

  private lastSpreadStart(): number {
    return Math.floor((this.pageCount - 1) / this.pagesPerView) * this.pagesPerView;
  }

  private moveToCurrent(smooth: boolean, captureAnchor = false): void {
    const left = this.currentColumn * this.pageExtent;
    let motion: PageTurnMotion | undefined;
    if (smooth) {
      motion = this.prepareScrollTo(left);
    } else {
      this.cancelPageAnimation();
      this.viewport.scrollTo({ left, behavior: 'auto' });
    }
    if (captureAnchor) this.captureVisibleAnchor();
    this.onChange(this.getSnapshot(), motion);
    if (motion) this.animatePageTurn(motion);
  }

  private prepareScrollTo(left: number): PageTurnMotion | undefined {
    const previousLeft = this.viewport.scrollLeft;
    const animatedOffset = this.currentAnimatedOffset();
    this.cancelPageAnimation();
    this.clearSwipeStyles();
    this.viewport.scrollTo({ left, behavior: 'auto' });

    const startOffset = animatedOffset + left - previousLeft;
    if (
      Math.abs(startOffset) < 0.5
      || this.prefersReducedMotion()
      || typeof this.content.animate !== 'function'
    ) return undefined;

    const spreadDistance = Math.max(1, this.pageExtent * this.pagesPerView);
    const queuedSpreads = Math.max(1, Math.abs(startOffset) / spreadDistance);
    const duration = Math.max(90, Math.round(PAGE_TURN_DURATION / Math.sqrt(queuedSpreads)));
    return { startOffset, spreadDistance, duration, easing: PAGE_TURN_EASING };
  }

  private animatePageTurn(motion: PageTurnMotion): void {
    const keyframes = [
      { transform: `translateX(${motion.startOffset}px)` },
      { transform: 'translateX(0)' },
    ];
    const options = { duration: motion.duration, easing: motion.easing };
    const animation = this.content.animate(keyframes, options);
    this.pageAnimation = animation;
    void animation.finished.then(() => {
      if (this.pageAnimation === animation) this.pageAnimation = undefined;
    }).catch(() => undefined);

    if (!this.motionCompanion || typeof this.motionCompanion.animate !== 'function') return;
    const companionAnimation = this.motionCompanion.animate(keyframes, options);
    this.companionAnimation = companionAnimation;
    void companionAnimation.finished.then(() => {
      if (this.companionAnimation === companionAnimation) this.companionAnimation = undefined;
    }).catch(() => undefined);
  }

  private transitionToChunk(
    chunkIndex: number,
    chunkColumn: number,
    direction: -1 | 1,
  ): void {
    const generation = ++this.viewTransitionGeneration;
    const update = (): void => {
      if (generation !== this.viewTransitionGeneration) return;
      this.activeAnchor = undefined;
      this.clearSwipeStyles();
      this.mountChunk(chunkIndex);
      this.performLayout({ chunk: chunkIndex, chunkColumn });
      this.captureVisibleAnchor();
      this.moveToCurrent(false);
    };

    this.cancelPageAnimation();
    this.viewTransition?.skipTransition();
    this.viewTransition = undefined;
    this.transitionUpdatePending = true;

    const canUseViewTransition = !this.prefersReducedMotion()
      && typeof document.startViewTransition === 'function';
    if (!canUseViewTransition) {
      update();
      this.transitionUpdatePending = false;
      this.animateChunkEntry(direction);
      this.flushPendingSteps();
      return;
    }

    document.documentElement.dataset.readerDirection = direction > 0 ? 'forward' : 'backward';
    const transition = document.startViewTransition(update);
    this.viewTransition = transition;
    void transition.updateCallbackDone.then(() => {
      if (generation !== this.viewTransitionGeneration) return;
      this.transitionUpdatePending = false;
      this.flushPendingSteps();
    }).catch(() => {
      if (generation !== this.viewTransitionGeneration) return;
      this.transitionUpdatePending = false;
      this.flushPendingSteps();
    });
    void transition.finished.then(() => {
      if (generation !== this.viewTransitionGeneration) return;
      this.viewTransition = undefined;
      delete document.documentElement.dataset.readerDirection;
    }).catch(() => undefined);
  }

  private animateChunkEntry(direction: -1 | 1): void {
    if (this.prefersReducedMotion() || typeof this.content.animate !== 'function') return;
    const distance = Math.min(96, Math.max(40, this.viewport.clientWidth * 0.1));
    this.animatePageTurn({
      startOffset: direction * distance,
      spreadDistance: Math.max(1, this.pageExtent * this.pagesPerView),
      duration: MOTION_DURATION.routine,
      easing: MOTION_EASING.enter,
    });
  }

  private currentAnimatedOffset(): number {
    if (this.swiping) return this.swipeOffset;
    const transform = getComputedStyle(this.content).transform;
    if (!transform || transform === 'none') return 0;
    const matrixValues = transform.slice(transform.indexOf('(') + 1, transform.lastIndexOf(')'));
    const values = matrixValues.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu)?.map(Number) ?? [];
    if (transform.startsWith('matrix3d(')) return values[12] ?? 0;
    if (transform.startsWith('matrix(')) return values[4] ?? 0;
    return 0;
  }

  private prefersReducedMotion(): boolean {
    return prefersReducedMotion();
  }

  private cancelPageAnimation(): void {
    this.pageAnimation?.cancel();
    this.pageAnimation = undefined;
    this.companionAnimation?.cancel();
    this.companionAnimation = undefined;
  }

  private cancelNavigationAnimations(): void {
    this.viewTransitionGeneration += 1;
    this.cancelPageAnimation();
    this.interruptViewTransition();
    this.transitionUpdatePending = false;
    this.pendingSteps = 0;
    this.clearSwipeStyles();
    delete document.documentElement.dataset.readerDirection;
  }

  private interruptViewTransition(): void {
    this.viewTransition?.skipTransition();
    this.viewTransition = undefined;
    delete document.documentElement.dataset.readerDirection;
  }

  private clearSwipeStyles(): void {
    this.swiping = false;
    this.swipeBaseOffset = 0;
    this.swipeOffset = 0;
    this.content.classList.remove('is-swiping');
    this.content.style.removeProperty('transform');
    this.motionCompanion?.style.removeProperty('transform');
  }

  private initialWordsPerPage(geometry: LayoutGeometry): number {
    const usableHeight = Math.max(160, geometry.viewportHeight - 72);
    const areaScale = (geometry.columnWidth / 500) * (usableHeight / 560);
    const fontScale = (18 / this.fontSize) ** 2;
    return Math.max(24, Math.round(115 * areaScale * fontScale));
  }

  private recordPageCount(chunkIndex: number, count: number): void {
    this.chunkPageCounts.set(chunkIndex, count);
    if (this.layout) {
      let cached = this.layoutPageCountCache.get(this.layout.key);
      if (!cached) {
        cached = new Map();
        this.layoutPageCountCache.set(this.layout.key, cached);
      }
      cached.set(chunkIndex, count);
    }

    const words = this.chunks[chunkIndex]?.wordCount ?? 0;
    if (words >= 20 && count > 0) {
      const sample = Math.max(16, words / count);
      this.estimatedWordsPerPage = this.estimatedWordsPerPage * 0.7 + sample * 0.3;
    }
  }

  private pageCountForSnapshot(chunkIndex: number): number {
    const exact = this.chunkPageCounts.get(chunkIndex);
    if (exact !== undefined) return exact;
    const words = this.chunks[chunkIndex]?.wordCount ?? 0;
    return Math.max(1, Math.ceil(words / Math.max(16, this.estimatedWordsPerPage)));
  }

  private restartMeasurements(): void {
    this.cancelMeasurements();
    const geometry = this.layout;
    if (!geometry) return;
    const generation = ++this.measurementGeneration;
    const currentNavigationIndex = Math.max(0, this.navigationChunks.indexOf(this.currentChunkIndex));
    const queue = this.navigationChunks
      .filter((chunkIndex) => !this.chunkPageCounts.has(chunkIndex))
      .sort((first, second) => (
        Math.abs(this.navigationChunks.indexOf(first) - currentNavigationIndex)
        - Math.abs(this.navigationChunks.indexOf(second) - currentNavigationIndex)
      ));

    const measureNext = (): void => {
      if (generation !== this.measurementGeneration || geometry.key !== this.layout?.key) return;
      const chunkIndices = queue.splice(0, MEASUREMENT_BATCH_SIZE);
      if (!chunkIndices.length) {
        this.onChange(this.getSnapshot());
        return;
      }
      for (const [chunkIndex, pageCount] of this.measureChunks(chunkIndices, geometry)) {
        this.recordPageCount(chunkIndex, pageCount);
      }
      this.scheduleMeasurement(measureNext);
    };

    if (!queue.length) {
      this.onChange(this.getSnapshot());
      return;
    }
    this.scheduleMeasurement(measureNext);
  }

  private scheduleMeasurement(callback: () => void): void {
    const idleWindow = window as unknown as IdleCallbacks;
    let completed = false;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    const run = (source: 'idle' | 'timer'): void => {
      if (completed) return;
      completed = true;
      if (source === 'timer' && idleHandle !== undefined) {
        this.idleMeasurementsReliable = false;
      }
      if (source === 'timer' && idleHandle !== undefined) {
        try {
          idleWindow.cancelIdleCallback?.(idleHandle);
        } catch {
          // A late or already-running WebKit callback must not stop the queue.
        }
      }
      if (this.measurementIdleHandle === idleHandle) {
        this.measurementIdleHandle = undefined;
      }
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      if (this.measurementTimeoutHandle === timeoutHandle) {
        this.measurementTimeoutHandle = undefined;
      }
      callback();
    };

    if (idleWindow.requestIdleCallback && this.idleMeasurementsReliable) {
      idleHandle = idleWindow.requestIdleCallback(
        () => run('idle'),
        { timeout: 250 },
      );
      this.measurementIdleHandle = idleHandle;
      // WebKit may never invoke requestIdleCallback, including its timeout path.
      timeoutHandle = window.setTimeout(
        () => run('timer'),
        IDLE_MEASUREMENT_WATCHDOG_MS,
      );
      this.measurementTimeoutHandle = timeoutHandle;
      return;
    }
    timeoutHandle = window.setTimeout(
      () => run('timer'),
      MEASUREMENT_DELAY_MS,
    );
    this.measurementTimeoutHandle = timeoutHandle;
  }

  private cancelMeasurements(): void {
    this.measurementGeneration += 1;
    const idleWindow = window as unknown as IdleCallbacks;
    if (this.measurementIdleHandle !== undefined) {
      try {
        idleWindow.cancelIdleCallback?.(this.measurementIdleHandle);
      } catch {
        // WebKit can deliver an idle callback while its cancellation is racing.
      }
      this.measurementIdleHandle = undefined;
    }
    if (this.measurementTimeoutHandle !== undefined) {
      window.clearTimeout(this.measurementTimeoutHandle);
      this.measurementTimeoutHandle = undefined;
    }
  }

  private measureChunks(
    chunkIndices: readonly number[],
    geometry: LayoutGeometry,
  ): Map<number, number> {
    const counts = new Map<number, number>();
    if (!this.bookRoot) return counts;
    const measurements = chunkIndices.flatMap((chunkIndex) => {
      const chunk = this.chunks[chunkIndex];
      if (!chunk) return [];

      const measurer = document.createElement('article');
      measurer.className = 'book-content reader-measurer';
      measurer.setAttribute('aria-hidden', 'true');
      measurer.style.height = `${Math.max(1, this.content.clientHeight)}px`;
      measurer.style.fontSize = `${this.fontSize}px`;
      this.applyGeometry(measurer, geometry);

      const book = this.bookRoot!.cloneNode(false) as HTMLElement;
      const clone = chunk.element.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      for (const element of Array.from(clone.querySelectorAll<HTMLElement>('[id]'))) {
        element.removeAttribute('id');
      }
      book.append(clone);
      measurer.append(book);
      return [{ chunkIndex, clone, measurer }];
    });

    document.body.append(...measurements.map(({ measurer }) => measurer));
    try {
      void measurements[0]?.measurer.offsetWidth;
      for (const { chunkIndex, clone, measurer } of measurements) {
        counts.set(chunkIndex, this.pagesForElement(measurer, clone, geometry));
      }
    } finally {
      for (const { measurer } of measurements) measurer.remove();
    }
    return counts;
  }
}
