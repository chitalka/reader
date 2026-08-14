export type PageMode = 'auto' | 'one' | 'two';

export interface PagerSnapshot {
  currentPage: number;
  totalPages: number;
  pagesPerView: number;
  progress: number;
  anchor?: string;
  anchorVisible: boolean;
}

export interface RestorePosition {
  anchor?: string;
  column?: number;
}

export class ReaderPager {
  private currentColumn = 0;
  private pageCount = 1;
  private pagesPerView = 1;
  private pageExtent = 1;
  private pageMode: PageMode = 'auto';
  private fontSize = 18;
  private activeAnchor?: string;
  private activeAnchorVisible = false;
  private resizeFrame?: number;
  private readonly resizeObserver?: ResizeObserver;

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
  }

  async setBook(fragment: DocumentFragment, restore?: RestorePosition): Promise<void> {
    this.currentColumn = 0;
    this.activeAnchor = restore?.anchor;
    this.activeAnchorVisible = false;
    this.content.replaceChildren(fragment);
    this.content.style.fontSize = `${this.fontSize}px`;

    const images = Array.from(this.content.querySelectorAll('img'));
    for (const image of images) {
      if (!image.complete) {
        image.addEventListener('load', () => this.scheduleLayout(), { once: true });
        image.addEventListener('error', () => this.scheduleLayout(), { once: true });
      }
    }

    await this.nextPaint();
    this.performLayout(restore);
    await this.waitForAssets(images);
    await this.nextPaint();
    this.performLayout();
    await this.nextPaint();
    this.performLayout();

    if (!this.activeAnchor) this.captureVisibleAnchor();
    this.moveToCurrent(false);
  }

  setPageMode(mode: PageMode): void {
    if (this.pageMode === mode) return;
    this.pageMode = mode;
    this.scheduleLayout();
  }

  setFontSize(size: number): void {
    if (this.fontSize === size) return;
    this.fontSize = size;
    this.content.style.fontSize = `${size}px`;
    this.scheduleLayout();
  }

  relayout(): void {
    this.scheduleLayout();
  }

  next(): void {
    if (this.isLast()) return;
    this.currentColumn = Math.min(this.lastSpreadStart(), this.currentColumn + this.pagesPerView);
    this.moveToCurrent(true, true);
  }

  previous(): void {
    if (this.isFirst()) return;
    this.currentColumn = Math.max(0, this.currentColumn - this.pagesPerView);
    this.moveToCurrent(true, true);
  }

  first(): void {
    this.currentColumn = 0;
    this.moveToCurrent(true, true);
  }

  last(): void {
    this.currentColumn = this.lastSpreadStart();
    this.moveToCurrent(true, true);
  }

  isFirst(): boolean {
    return this.currentColumn === 0;
  }

  isLast(): boolean {
    return this.currentColumn >= this.lastSpreadStart();
  }

  goToElement(element: HTMLElement): void {
    const page = this.pageForElement(element);
    this.currentColumn = this.spreadStart(page);
    this.moveToCurrent(true, true);
  }

  getSnapshot(): PagerSnapshot {
    const lastVisiblePage = Math.min(this.pageCount, this.currentColumn + this.pagesPerView);
    return {
      currentPage: this.currentColumn + 1,
      totalPages: this.pageCount,
      pagesPerView: this.pagesPerView,
      progress: this.pageCount <= 1 ? 100 : (lastVisiblePage / this.pageCount) * 100,
      anchor: this.activeAnchor,
      anchorVisible: this.activeAnchorVisible,
    };
  }

  private readonly handleWindowResize = (): void => {
    this.scheduleLayout();
  };

  private nextPaint(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  private async waitForAssets(images: HTMLImageElement[]): Promise<void> {
    const imagePromises = images.map((image) => {
      if (image.complete) {
        return typeof image.decode === 'function'
          ? image.decode().catch(() => undefined)
          : Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const settled = (): void => resolve();
        image.addEventListener('load', settled, { once: true });
        image.addEventListener('error', settled, { once: true });
      });
    });
    const fontsReady = document.fonts?.ready?.then(() => undefined) ?? Promise.resolve();
    const assetsReady = Promise.all([fontsReady, ...imagePromises]).then(() => undefined);

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 3000);
      void assetsReady.finally(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    });
  }

  private scheduleLayout(): void {
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = undefined;
      this.performLayout({ anchor: this.activeAnchor, column: this.currentColumn });
    });
  }

  private performLayout(
    restore: RestorePosition = { anchor: this.activeAnchor, column: this.currentColumn },
  ): void {
    const viewportWidth = Math.max(1, this.viewport.clientWidth);
    const narrow = viewportWidth < 920;
    this.pagesPerView = this.pageMode === 'one' || (this.pageMode === 'auto' && narrow) ? 1 : 2;
    const pageGap = viewportWidth < 640 ? 20 : 36;
    const innerPageMargin = this.pagesPerView === 2 ? (viewportWidth < 640 ? 24 : 48) : 0;
    const pageWidth = Math.max(
      1,
      (viewportWidth - pageGap * (this.pagesPerView - 1)) / this.pagesPerView,
    );
    const contentColumnWidth = Math.max(1, pageWidth - innerPageMargin);
    const contentColumnGap = pageGap + innerPageMargin * 2;
    this.pageExtent = contentColumnWidth + contentColumnGap;

    this.content.style.width = `${viewportWidth}px`;
    this.content.style.setProperty('--page-width', `${contentColumnWidth}px`);
    this.content.style.setProperty('--page-gap', `${contentColumnGap}px`);
    void this.content.offsetWidth;

    this.pageCount = Math.max(
      1,
      Math.ceil((this.content.scrollWidth + contentColumnGap) / this.pageExtent - 0.01),
    );

    if (restore.anchor) {
      const element = this.anchorElement(restore.anchor);
      if (element && element.getClientRects().length > 0) {
        this.currentColumn = this.spreadStart(this.pageForElement(element));
        this.activeAnchorVisible = true;
      } else {
        if (!element && this.activeAnchor === restore.anchor) this.activeAnchor = undefined;
        this.activeAnchorVisible = false;
        this.currentColumn = this.spreadStart(restore.column ?? this.currentColumn);
      }
    } else {
      this.activeAnchorVisible = false;
      this.currentColumn = this.spreadStart(restore.column ?? this.currentColumn);
    }

    this.currentColumn = Math.min(this.currentColumn, this.lastSpreadStart());
    this.moveToCurrent(false);
  }

  private pageForElement(element: HTMLElement): number {
    const contentLeft = this.content.getBoundingClientRect().left;
    const elementLeft = this.firstRect(element).left;
    const offset = Math.max(0, elementLeft - contentLeft);
    return Math.min(this.pageCount - 1, Math.floor(offset / this.pageExtent + 0.02));
  }

  private anchorElement(anchor: string): HTMLElement | undefined {
    return Array.from(
      this.content.querySelectorAll<HTMLElement>('[data-reader-anchor]'),
    ).find((candidate) => candidate.dataset.readerAnchor === anchor);
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
    const candidates = Array.from(
      this.content.querySelectorAll<HTMLElement>('[data-reader-anchor]'),
    ).flatMap((element, order) => {
      const rect = element.getClientRects()[0];
      if (!rect || rect.top < viewportRect.top - 0.5 || rect.top >= viewportRect.bottom + 0.5) {
        return [];
      }

      const page = this.pageForElement(element);
      if (page < this.currentColumn || page > lastVisiblePage) return [];
      return [{ element, order, page, top: rect.top }];
    });
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

  private spreadStart(page: number): number {
    const clampedPage = Math.max(0, Math.min(this.pageCount - 1, page));
    return Math.floor(clampedPage / this.pagesPerView) * this.pagesPerView;
  }

  private lastSpreadStart(): number {
    return Math.floor((this.pageCount - 1) / this.pagesPerView) * this.pagesPerView;
  }

  private moveToCurrent(smooth: boolean, captureAnchor = false): void {
    const left = this.currentColumn * this.pageExtent;
    this.viewport.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
    if (captureAnchor) this.captureVisibleAnchor();
    this.onChange(this.getSnapshot());
  }
}
