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
  pageExtent: number;
  viewportHeight: number;
  viewportWidth: number;
}

interface IdleCallbacks {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const PAGE_TURN_DURATION = 260;
const PAGE_TURN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

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
  private idElements = new Map<string, HTMLElement>();
  private idChunks = new Map<string, number>();
  private chunkPageCounts = new Map<number, number>();
  private readonly layoutPageCountCache = new Map<string, Map<number, number>>();
  private layout?: LayoutGeometry;
  private estimatedWordsPerPage = 100;
  private measurementGeneration = 0;
  private measurementHandle?: number;
  private measurementUsesIdleCallback = false;
  private bookGeneration = 0;
  private pageAnimation?: Animation;
  private chunkAnimations: Animation[] = [];
  private transitionLayer?: HTMLElement;
  private transitionGeneration = 0;
  private transitioning = false;
  private pendingSteps = 0;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly content: HTMLElement,
    private readonly onChange: (snapshot: PagerSnapshot) => void,
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

  goToElement(element: HTMLElement): void {
    const chunkIndex = this.chunkForElement(element);
    if (chunkIndex === undefined || !this.navigationChunks.includes(chunkIndex)) return;
    this.cancelNavigationAnimations();
    this.activeAnchor = element.dataset.readerAnchor;
    if (chunkIndex !== this.currentChunkIndex) this.mountChunk(chunkIndex);
    this.performLayout({ anchor: this.activeAnchor, chunk: chunkIndex });
    this.captureVisibleAnchor();
    this.moveToCurrent(false);
  }

  goToAnchor(anchor: string): boolean {
    const element = this.anchorElements.get(anchor);
    if (!element) return false;
    this.goToElement(element);
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
    if (this.transitioning) {
      this.pendingSteps += direction;
      this.accelerateChunkTransition();
      return;
    }
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
    while (!this.transitioning && this.pendingSteps !== 0) {
      const direction = Math.sign(this.pendingSteps) as -1 | 1;
      this.pendingSteps -= direction;
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
    if (smooth) this.animateScrollTo(left);
    else {
      this.cancelPageAnimation();
      this.viewport.scrollTo({ left, behavior: 'auto' });
    }
    if (captureAnchor) this.captureVisibleAnchor();
    this.onChange(this.getSnapshot());
  }

  private animateScrollTo(left: number): void {
    const previousLeft = this.viewport.scrollLeft;
    const animatedOffset = this.currentAnimatedOffset();
    this.cancelPageAnimation();
    this.viewport.scrollTo({ left, behavior: 'auto' });

    const startOffset = animatedOffset + left - previousLeft;
    if (
      Math.abs(startOffset) < 0.5
      || this.prefersReducedMotion()
      || typeof this.content.animate !== 'function'
    ) return;

    const spreadDistance = Math.max(1, this.pageExtent * this.pagesPerView);
    const queuedSpreads = Math.max(1, Math.abs(startOffset) / spreadDistance);
    const duration = Math.max(90, Math.round(PAGE_TURN_DURATION / Math.sqrt(queuedSpreads)));
    const animation = this.content.animate(
      [
        { transform: `translateX(${startOffset}px)` },
        { transform: 'translateX(0)' },
      ],
      { duration, easing: PAGE_TURN_EASING },
    );
    this.pageAnimation = animation;
    void animation.finished.then(() => {
      if (this.pageAnimation === animation) this.pageAnimation = undefined;
    }).catch(() => undefined);
  }

  private transitionToChunk(
    chunkIndex: number,
    chunkColumn: number,
    direction: -1 | 1,
  ): void {
    const generation = ++this.transitionGeneration;
    const layer = this.createTransitionLayer();
    this.transitioning = true;
    this.activeAnchor = undefined;
    this.mountChunk(chunkIndex);
    this.performLayout({ chunk: chunkIndex, chunkColumn });
    this.captureVisibleAnchor();
    this.moveToCurrent(false);

    const distance = Math.max(this.viewport.clientWidth, this.pageExtent * this.pagesPerView);
    if (
      !layer
      || this.prefersReducedMotion()
      || typeof this.content.animate !== 'function'
      || typeof layer.animate !== 'function'
    ) {
      this.finishChunkTransition(generation);
      return;
    }

    const options: KeyframeAnimationOptions = {
      duration: PAGE_TURN_DURATION,
      easing: PAGE_TURN_EASING,
      fill: 'both',
    };
    this.chunkAnimations = [
      layer.animate(
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(${-direction * distance}px)` },
        ],
        options,
      ),
      this.content.animate(
        [
          { transform: `translateX(${direction * distance}px)` },
          { transform: 'translateX(0)' },
        ],
        options,
      ),
    ];
    void Promise.allSettled(this.chunkAnimations.map((animation) => animation.finished))
      .then(() => this.finishChunkTransition(generation));
  }

  private createTransitionLayer(): HTMLElement | undefined {
    if (!this.bookRoot) return undefined;
    const previousLeft = this.viewport.scrollLeft;
    const animatedOffset = this.currentAnimatedOffset();
    this.cancelPageAnimation();

    const layer = document.createElement('div');
    layer.className = 'reader-transition-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('inert', '');
    const clone = this.content.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    for (const element of Array.from(clone.querySelectorAll<HTMLElement>('[id]'))) {
      element.removeAttribute('id');
    }
    if (Math.abs(animatedOffset) >= 0.5) {
      clone.style.transform = `translateX(${animatedOffset}px)`;
    }
    layer.append(clone);
    this.viewport.append(layer);
    layer.scrollLeft = previousLeft;
    this.transitionLayer = layer;
    return layer;
  }

  private finishChunkTransition(generation: number): void {
    if (generation !== this.transitionGeneration) return;
    for (const animation of this.chunkAnimations) animation.cancel();
    this.chunkAnimations = [];
    this.transitionLayer?.remove();
    this.transitionLayer = undefined;
    this.transitioning = false;
    this.flushPendingSteps();
  }

  private accelerateChunkTransition(): void {
    const playbackRate = Math.min(4, 1 + Math.abs(this.pendingSteps) * 0.5);
    for (const animation of this.chunkAnimations) animation.playbackRate = playbackRate;
  }

  private currentAnimatedOffset(): number {
    if (!this.pageAnimation) return 0;
    const transform = getComputedStyle(this.content).transform;
    if (!transform || transform === 'none') return 0;
    const matrixValues = transform.slice(transform.indexOf('(') + 1, transform.lastIndexOf(')'));
    const values = matrixValues.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu)?.map(Number) ?? [];
    if (transform.startsWith('matrix3d(')) return values[12] ?? 0;
    if (transform.startsWith('matrix(')) return values[4] ?? 0;
    return 0;
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private cancelPageAnimation(): void {
    this.pageAnimation?.cancel();
    this.pageAnimation = undefined;
  }

  private cancelNavigationAnimations(): void {
    this.transitionGeneration += 1;
    this.cancelPageAnimation();
    for (const animation of this.chunkAnimations) animation.cancel();
    this.chunkAnimations = [];
    this.transitionLayer?.remove();
    this.transitionLayer = undefined;
    this.transitioning = false;
    this.pendingSteps = 0;
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
      this.measurementHandle = undefined;
      if (generation !== this.measurementGeneration || geometry.key !== this.layout?.key) return;
      const chunkIndex = queue.shift();
      if (chunkIndex === undefined) {
        this.onChange(this.getSnapshot());
        return;
      }
      const pageCount = this.measureChunk(chunkIndex, geometry);
      this.recordPageCount(chunkIndex, pageCount);
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
    if (idleWindow.requestIdleCallback) {
      this.measurementUsesIdleCallback = true;
      this.measurementHandle = idleWindow.requestIdleCallback(callback, { timeout: 250 });
    } else {
      this.measurementUsesIdleCallback = false;
      this.measurementHandle = window.setTimeout(callback, 32);
    }
  }

  private cancelMeasurements(): void {
    this.measurementGeneration += 1;
    if (this.measurementHandle === undefined) return;
    const idleWindow = window as unknown as IdleCallbacks;
    if (this.measurementUsesIdleCallback && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(this.measurementHandle);
    } else {
      window.clearTimeout(this.measurementHandle);
    }
    this.measurementHandle = undefined;
  }

  private measureChunk(chunkIndex: number, geometry: LayoutGeometry): number {
    if (!this.bookRoot) return 1;
    const chunk = this.chunks[chunkIndex];
    if (!chunk) return 1;

    const measurer = document.createElement('article');
    measurer.className = 'book-content reader-measurer';
    measurer.setAttribute('aria-hidden', 'true');
    measurer.style.height = `${Math.max(1, this.content.clientHeight)}px`;
    measurer.style.fontSize = `${this.fontSize}px`;
    this.applyGeometry(measurer, geometry);

    const book = this.bookRoot.cloneNode(false) as HTMLElement;
    const clone = chunk.element.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    for (const element of Array.from(clone.querySelectorAll<HTMLElement>('[id]'))) {
      element.removeAttribute('id');
    }
    book.append(clone);
    measurer.append(book);
    document.body.append(measurer);
    void measurer.offsetWidth;
    const pageCount = this.pagesForElement(measurer, clone, geometry);
    measurer.remove();
    return pageCount;
  }
}
