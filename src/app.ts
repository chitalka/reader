import { decodeBookFile, decodeBookUrl, type DecodedBookSource } from './fb2/decode';
import type { BookTocItem } from './book/model';
import { hasDraggedFiles, preventBookContentDrag } from './book/drag';
import { parseFb2 } from './fb2/parse';
import { renderFb2 } from './fb2/render';
import { parseEpubArchive } from './epub/parse';
import { renderEpub } from './epub/render';
import {
  HeaderVisibilityController,
  bindMouseReadingClick,
  bindTouchSwipe,
  bindTouchTap,
} from './header-visibility';
import { ReaderPager, type PagerSnapshot, type PageMode } from './reader/pager';
import { JsonStorage, positionStorage } from './reader/storage';
import { SettingsPanelController } from './settings-panel';
import { TocPanelController } from './toc-panel';
import { AnnotationPanelController, QuoteMenuController } from './annotations-panel';
import { ReaderLibrary } from './reader/library';
import {
  applyQuoteHighlights,
  locateSelection,
  rangeForQuote,
  restoreSelection,
  type LocatedSelection,
} from './reader/quotes';
import {
  bookmarkId,
  visibleBookmarks,
  visibleQuotes,
  type AnnotationColor,
  type BookmarkRecord,
  type QuoteRecord,
  type ReaderState,
} from './reader/state';
import { GoogleDriveProvider } from './sync/google';
import { YandexDiskProvider } from './sync/yandex';
import { SyncEngine } from './sync/engine';
import type { CloudProvider, ProviderStatusEvent } from './sync/provider';
import {
  DEFAULT_SETTINGS,
  normalizePageButtonsMode,
  type FootnoteMode,
  type PageButtonsMode,
  type ReaderSettings,
  type Theme,
} from './settings';

const demoBookUrl = new URL('../books/Anna-Karenina.fb2', import.meta.url);

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Не найден элемент интерфейса #${id}`);
  return element as T;
}

function requiredInputs(name: string): HTMLInputElement[] {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  if (!inputs.length) throw new Error(`Не найдены элементы настройки ${name}`);
  return inputs;
}

function tocTargets(items: BookTocItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.target ? [item.target] : []),
    ...tocTargets(item.children),
  ]);
}

export class ChitalkaApp {
  private readonly settingsStorage = new JsonStorage<ReaderSettings>(
    'chitalka:settings:v1',
    DEFAULT_SETTINGS,
  );
  private settings = this.normalizedSettings(this.settingsStorage.read());
  private readonly library = new ReaderLibrary();
  private readonly googleSyncConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  private readonly yandexSyncConfigured = Boolean(import.meta.env.VITE_YANDEX_CLIENT_ID);
  private readonly googleProvider = new GoogleDriveProvider();
  private readonly yandexProvider = new YandexDiskProvider();
  private readonly syncEngine = new SyncEngine(
    this.library.repository,
    [this.googleProvider, this.yandexProvider],
  );
  private readonly viewport = requiredElement<HTMLElement>('book-viewport');
  private readonly content = requiredElement<HTMLElement>('book-content');
  private readonly pager = new ReaderPager(
    this.viewport,
    this.content,
    (snapshot) => this.onPageChanged(snapshot),
  );
  private currentBookFilename?: string;
  private currentBookFingerprint?: string;
  private currentBookmarks: BookmarkRecord[] = [];
  private currentQuotes: QuoteRecord[] = [];
  private currentWordCount = 0;
  private currentTocTargets: string[] = [];
  private backAnchor?: string;
  private isPreparing = true;
  private dragDepth = 0;
  private savePositionTimer?: number;
  private toastTimer?: number;
  private selectionTimer?: number;
  private selectionPointerActive = false;

  private readonly reader = requiredElement<HTMLElement>('reader');
  private readonly status = requiredElement<HTMLElement>('reader-status');
  private readonly statusMessage = requiredElement<HTMLElement>('status-message');
  private readonly dropZone = requiredElement<HTMLElement>('drop-zone');
  private readonly dropOverlay = requiredElement<HTMLElement>('drop-overlay');
  private readonly fileInput = requiredElement<HTMLInputElement>('book-file');
  private readonly title = requiredElement<HTMLElement>('book-title');
  private readonly author = requiredElement<HTMLElement>('book-author');
  private readonly previousButton = requiredElement<HTMLButtonElement>('previous-page');
  private readonly nextButton = requiredElement<HTMLButtonElement>('next-page');
  private readonly progressGroup = requiredElement<HTMLElement>('progress-group');
  private readonly progress = requiredElement<HTMLProgressElement>('book-progress');
  private readonly pageLabel = requiredElement<HTMLElement>('page-label');
  private readonly timeLabel = requiredElement<HTMLElement>('time-label');
  private readonly paginationPlaceholder = requiredElement<HTMLElement>('pagination-placeholder');
  private readonly fontDownButton = requiredElement<HTMLButtonElement>('font-down');
  private readonly fontUpButton = requiredElement<HTMLButtonElement>('font-up');
  private readonly fontSizeValue = requiredElement<HTMLOutputElement>('font-size-value');
  private readonly settingsButton = requiredElement<HTMLButtonElement>('settings-button');
  private readonly settingsPanel = requiredElement<HTMLElement>('settings-panel');
  private readonly settingsBackdrop = requiredElement<HTMLElement>('settings-backdrop');
  private readonly settingsCloseButton = requiredElement<HTMLButtonElement>('settings-close');
  private readonly tocButton = requiredElement<HTMLButtonElement>('toc-button');
  private readonly tocPanel = requiredElement<HTMLElement>('toc-panel');
  private readonly tocBackdrop = requiredElement<HTMLElement>('toc-backdrop');
  private readonly tocCloseButton = requiredElement<HTMLButtonElement>('toc-close');
  private readonly tocList = requiredElement<HTMLElement>('toc-list-root');
  private readonly annotationsButton = requiredElement<HTMLButtonElement>('annotations-button');
  private readonly annotationsPanel = requiredElement<HTMLElement>('annotations-panel');
  private readonly annotationsBackdrop = requiredElement<HTMLElement>('annotations-backdrop');
  private readonly annotationsCloseButton = requiredElement<HTMLButtonElement>('annotations-close');
  private readonly bookmarksTab = requiredElement<HTMLButtonElement>('bookmarks-tab');
  private readonly quotesTab = requiredElement<HTMLButtonElement>('quotes-tab');
  private readonly bookmarksView = requiredElement<HTMLElement>('bookmarks-view');
  private readonly quotesView = requiredElement<HTMLElement>('quotes-view');
  private readonly addBookmarkButton = requiredElement<HTMLButtonElement>('add-bookmark');
  private readonly bookmarksList = requiredElement<HTMLElement>('bookmarks-list');
  private readonly quotesList = requiredElement<HTMLElement>('quotes-list');
  private readonly annotationEditor = requiredElement<HTMLFormElement>('annotation-editor');
  private readonly annotationEditorTitle = requiredElement<HTMLElement>('annotation-editor-title');
  private readonly annotationEditorColors = requiredElement<HTMLElement>('annotation-editor-colors');
  private readonly annotationEditorNote = requiredElement<HTMLTextAreaElement>('annotation-editor-note');
  private readonly annotationEditorDelete = requiredElement<HTMLButtonElement>('annotation-editor-delete');
  private readonly annotationEditorCancel = requiredElement<HTMLButtonElement>('annotation-editor-cancel');
  private readonly quoteMenuElement = requiredElement<HTMLFormElement>('quote-menu');
  private readonly quoteMenuClose = requiredElement<HTMLButtonElement>('quote-menu-close');
  private readonly quoteMenuPreview = requiredElement<HTMLElement>('quote-menu-preview');
  private readonly quoteMenuColors = requiredElement<HTMLElement>('quote-menu-colors');
  private readonly quoteMenuNote = requiredElement<HTMLTextAreaElement>('quote-menu-note');
  private readonly quoteMenuSave = requiredElement<HTMLButtonElement>('quote-menu-save');
  private readonly quoteMenuDelete = requiredElement<HTMLButtonElement>('quote-menu-delete');
  private readonly googleConnect = requiredElement<HTMLButtonElement>('google-connect');
  private readonly yandexConnect = requiredElement<HTMLButtonElement>('yandex-connect');
  private readonly googleSyncStatus = requiredElement<HTMLElement>('google-sync-status');
  private readonly yandexSyncStatus = requiredElement<HTMLElement>('yandex-sync-status');
  private readonly syncLastTime = requiredElement<HTMLElement>('sync-last-time');
  private readonly syncNowButton = requiredElement<HTMLButtonElement>('sync-now');
  private readonly themeInputs = requiredInputs('theme');
  private readonly pageModeInputs = requiredInputs('page-mode');
  private readonly pageButtonInputs = requiredInputs('page-buttons');
  private readonly footnoteModeInputs = requiredInputs('footnote-mode');
  private readonly backButton = requiredElement<HTMLButtonElement>('back-to-text');
  private readonly toast = requiredElement<HTMLElement>('toast');
  private readonly appRoot = requiredElement<HTMLElement>('app');
  private readonly header = requiredElement<HTMLElement>('app-header');
  private readonly headerVisibility = new HeaderVisibilityController(this.appRoot, this.header);
  private readonly settingsPanelController: SettingsPanelController;
  private readonly tocPanelController: TocPanelController;
  private readonly annotationPanelController: AnnotationPanelController;
  private readonly quoteMenuController: QuoteMenuController;

  constructor() {
    this.settingsPanelController = new SettingsPanelController(
      {
        button: this.settingsButton,
        panel: this.settingsPanel,
        backdrop: this.settingsBackdrop,
        closeButton: this.settingsCloseButton,
      },
      (isOpen) => this.handleSettingsOpenChange(isOpen),
    );
    this.tocPanelController = new TocPanelController(
      {
        button: this.tocButton,
        panel: this.tocPanel,
        backdrop: this.tocBackdrop,
        closeButton: this.tocCloseButton,
        list: this.tocList,
      },
      (target) => this.goToTocTarget(target),
      (isOpen) => this.handleTocOpenChange(isOpen),
    );
    this.annotationPanelController = new AnnotationPanelController(
      {
        button: this.annotationsButton,
        panel: this.annotationsPanel,
        backdrop: this.annotationsBackdrop,
        closeButton: this.annotationsCloseButton,
        bookmarksTab: this.bookmarksTab,
        quotesTab: this.quotesTab,
        bookmarksView: this.bookmarksView,
        quotesView: this.quotesView,
        addBookmarkButton: this.addBookmarkButton,
        bookmarksList: this.bookmarksList,
        quotesList: this.quotesList,
        editor: this.annotationEditor,
        editorTitle: this.annotationEditorTitle,
        editorColors: this.annotationEditorColors,
        editorNote: this.annotationEditorNote,
        editorDelete: this.annotationEditorDelete,
        editorCancel: this.annotationEditorCancel,
      },
      {
        createBookmark: (note, color) => this.createBookmark(note, color),
        navigateBookmark: (record) => this.goToBookmark(record),
        navigateQuote: (record) => this.goToQuote(record),
        update: (record, note, color) => this.updateAnnotation(record, note, color),
        delete: (record) => this.deleteAnnotation(record),
        openChange: (isOpen) => this.handleAnnotationsOpenChange(isOpen),
      },
    );
    this.quoteMenuController = new QuoteMenuController(
      {
        form: this.quoteMenuElement,
        selectionRoot: this.content,
        closeButton: this.quoteMenuClose,
        preview: this.quoteMenuPreview,
        colors: this.quoteMenuColors,
        note: this.quoteMenuNote,
        saveButton: this.quoteMenuSave,
        deleteButton: this.quoteMenuDelete,
      },
      (selection, note, color) => this.saveQuote(selection, note, color),
      (quote) => this.deleteAnnotation(quote),
    );
  }

  async start(): Promise<void> {
    this.settings = this.normalizedSettings(await this.library.initialize(this.settings));
    this.settingsStorage.write(this.settings);
    this.applySettings();
    this.bindEvents();
    this.bindSynchronization();
    this.headerVisibility.reveal();

    try {
      await this.loadDecoded(await decodeBookUrl(demoBookUrl));
    } catch (error) {
      this.showError(error);
    }
  }

  private normalizedSettings(value: ReaderSettings): ReaderSettings {
    const pageModes: PageMode[] = ['auto', 'one', 'two'];
    const footnoteModes: FootnoteMode[] = ['appendix', 'inline'];
    const themes: Theme[] = ['light', 'dark'];

    return {
      fontSize: Number.isFinite(value.fontSize)
        ? Math.min(28, Math.max(14, value.fontSize))
        : DEFAULT_SETTINGS.fontSize,
      pageMode: pageModes.includes(value.pageMode) ? value.pageMode : DEFAULT_SETTINGS.pageMode,
      pageButtons: normalizePageButtonsMode(value.pageButtons),
      footnoteMode: footnoteModes.includes(value.footnoteMode)
        ? value.footnoteMode
        : DEFAULT_SETTINGS.footnoteMode,
      theme: themes.includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
      wordsPerMinute: Number.isFinite(value.wordsPerMinute)
        ? Math.min(500, Math.max(80, value.wordsPerMinute))
        : DEFAULT_SETTINGS.wordsPerMinute,
    };
  }

  private applySettings(): void {
    this.pager.setFontSize(this.settings.fontSize);
    this.pager.setPageMode(this.settings.pageMode);
    this.content.querySelector<HTMLElement>('.book')
      ?.setAttribute('data-footnotes', this.settings.footnoteMode);
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.dataset.pageButtons = this.settings.pageButtons;
    this.updateSettingsControls();
  }

  private bindEvents(): void {
    this.previousButton.addEventListener('click', () => this.navigateBackward());
    this.nextButton.addEventListener('click', () => this.navigate(() => this.pager.next()));
    this.fontDownButton.addEventListener('click', () => this.changeFontSize(-2));
    this.fontUpButton.addEventListener('click', () => this.changeFontSize(2));
    for (const input of this.themeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setTheme(input.value as Theme);
      });
    }
    for (const input of this.pageModeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setPageMode(input.value as PageMode);
      });
    }
    for (const input of this.pageButtonInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setPageButtons(input.value as PageButtonsMode);
      });
    }
    for (const input of this.footnoteModeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setFootnoteMode(input.value as FootnoteMode);
      });
    }
    this.backButton.addEventListener('click', () => this.returnFromFootnote());

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) void this.loadFile(file);
      this.fileInput.value = '';
    });

    this.content.addEventListener('click', (event) => this.handleContentClick(event));
    preventBookContentDrag(this.content);
    this.content.addEventListener('pointerdown', () => {
      this.selectionPointerActive = true;
    });
    document.addEventListener('pointerup', () => {
      if (!this.selectionPointerActive) return;
      this.selectionPointerActive = false;
      this.scheduleSelectionMenu();
    });
    document.addEventListener('pointercancel', () => {
      this.selectionPointerActive = false;
    });
    document.addEventListener('selectionchange', () => this.scheduleSelectionMenu());
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
    bindMouseReadingClick(this.viewport, () => this.headerVisibility.toggle());
    bindTouchTap(this.viewport, () => this.headerVisibility.toggle());
    bindTouchSwipe(this.viewport, (distance) => {
      if (distance < 0) this.navigate(() => this.pager.next());
      else this.navigateBackward();
    });

    for (const eventName of ['dragenter', 'dragover']) {
      this.dropZone.addEventListener(eventName, (event) => {
        const dragEvent = event as DragEvent;
        if (!hasDraggedFiles(dragEvent.dataTransfer)) return;
        event.preventDefault();
        if (eventName === 'dragenter') this.dragDepth += 1;
        this.dropOverlay.hidden = false;
      });
    }
    this.dropZone.addEventListener('dragleave', (event) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) this.dropOverlay.hidden = true;
    });
    this.dropZone.addEventListener('drop', (event) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      this.dragDepth = 0;
      this.dropOverlay.hidden = true;
      const file = event.dataTransfer?.files[0];
      if (file) void this.loadFile(file);
    });
  }

  private async loadFile(file: File): Promise<void> {
    this.setLoading(`Открываем «${file.name}»…`);
    try {
      await this.loadDecoded(await decodeBookFile(file));
    } catch (error) {
      this.showError(error);
    }
  }

  private async loadDecoded(source: DecodedBookSource): Promise<void> {
    this.setLoading(`Готовим «${source.filename}»…`);
    const rendered = source.format === 'epub'
      ? renderEpub(parseEpubArchive(source.files))
      : renderFb2(parseFb2(source.xml));
    const bookRoot = rendered.fragment.querySelector<HTMLElement>('.book');
    bookRoot?.setAttribute('data-footnotes', this.settings.footnoteMode);

    this.currentBookFilename = source.filename;
    this.currentBookFingerprint = source.fingerprint;
    this.currentWordCount = rendered.wordCount;
    this.currentTocTargets = tocTargets(rendered.toc);
    this.tocPanelController.setItems(rendered.toc);
    this.backAnchor = undefined;
    this.backButton.hidden = true;
    this.title.textContent = rendered.metadata.title;
    this.author.textContent = rendered.metadata.authors.join(', ');
    document.title = `${rendered.metadata.title} — Читалка`;

    await this.library.registerBook({
      fingerprint: source.fingerprint,
      title: rendered.metadata.title,
      authors: rendered.metadata.authors,
      format: source.format,
      filename: source.filename,
    });
    await this.refreshAnnotations();

    const savedPosition = await this.library.position(source.fingerprint, source.filename);
    await this.pager.setBook(rendered.fragment, savedPosition);

    this.isPreparing = false;
    this.status.hidden = true;
    this.reader.hidden = false;
    this.reader.classList.remove('is-preparing');
    this.dropZone.setAttribute('aria-busy', 'false');
    this.onPageChanged(this.pager.getSnapshot());
    this.headerVisibility.reveal();
  }

  private setLoading(message: string): void {
    this.settingsPanelController.close(false);
    this.annotationPanelController.close(false);
    this.tocPanelController.setItems([]);
    this.isPreparing = true;
    this.currentBookFilename = undefined;
    this.currentBookFingerprint = undefined;
    this.currentBookmarks = [];
    this.currentQuotes = [];
    this.annotationPanelController.setRecords([], [], false);
    this.quoteMenuController.close();
    this.currentTocTargets = [];
    this.setPaginationPending(true);
    if (this.savePositionTimer) {
      window.clearTimeout(this.savePositionTimer);
      this.savePositionTimer = undefined;
    }
    this.statusMessage.textContent = message;
    this.status.classList.remove('is-error');
    this.status.hidden = false;
    this.reader.hidden = false;
    this.reader.classList.add('is-preparing');
    this.dropZone.setAttribute('aria-busy', 'true');
    this.headerVisibility.reveal();
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    this.showToast(message);

    this.currentBookFilename = undefined;
    this.currentBookFingerprint = undefined;
    this.currentBookmarks = [];
    this.currentQuotes = [];
    this.annotationPanelController.close(false);
    this.annotationPanelController.setRecords([], [], false);
    this.quoteMenuController.close();
    this.statusMessage.textContent = `${message}. Выберите другую книгу.`;
    this.status.classList.add('is-error');
    this.status.hidden = false;
    this.reader.classList.add('is-preparing');
    this.dropZone.setAttribute('aria-busy', 'false');
    this.headerVisibility.reveal();
  }

  private onPageChanged(snapshot: PagerSnapshot): void {
    this.previousButton.disabled = this.pager.isFirst();
    this.nextButton.disabled = this.pager.isLast();
    this.tocPanelController.setActive(
      this.pager.closestPrecedingAnchor(this.currentTocTargets, snapshot.anchor),
    );

    if (snapshot.paginationExact) {
      const lastPage = Math.min(
        snapshot.totalPages,
        snapshot.currentPage + snapshot.pagesPerView - 1,
      );
      this.pageLabel.textContent = lastPage > snapshot.currentPage
        ? `Страницы ${snapshot.currentPage}–${lastPage} из ${snapshot.totalPages}`
        : `Страница ${snapshot.currentPage} из ${snapshot.totalPages}`;
      this.progress.value = snapshot.progress;
      this.progress.textContent = `${Math.round(snapshot.progress)}%`;
      this.updateTimeEstimate(snapshot.progress);
      this.setPaginationPending(false);
    } else {
      this.setPaginationPending(true);
    }

    if (this.currentBookFingerprint && !this.isPreparing) {
      if (this.savePositionTimer) window.clearTimeout(this.savePositionTimer);
      this.savePositionTimer = window.setTimeout(() => {
        if (!this.currentBookFingerprint || this.isPreparing) return;
        const position = {
          anchor: snapshot.anchorVisible ? snapshot.anchor : undefined,
          column: snapshot.currentPage - 1,
          chunk: snapshot.chunkIndex,
          chunkColumn: snapshot.chunkPage - 1,
          progress: snapshot.progress,
        };
        void this.library.savePosition(this.currentBookFingerprint, position);
        if (this.currentBookFilename) positionStorage(this.currentBookFilename).write(position);
      }, 250);
    }
    this.applyCurrentHighlights();
    this.updateCurrentBookmark(snapshot.anchor);
  }

  private setPaginationPending(pending: boolean): void {
    this.progressGroup.classList.toggle('is-pending', pending);
    this.progressGroup.setAttribute('aria-busy', String(pending));
    this.paginationPlaceholder.hidden = !pending;
  }

  private updateTimeEstimate(progress: number): void {
    const wordsLeft = Math.max(0, this.currentWordCount * (1 - progress / 100));
    const minutes = Math.ceil(wordsLeft / this.settings.wordsPerMinute);

    if (minutes <= 1) {
      this.timeLabel.textContent = 'До конца меньше минуты';
    } else if (minutes < 60) {
      this.timeLabel.textContent = `До конца около ${minutes} мин`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      this.timeLabel.textContent = `До конца около ${hours} ч ${remainder} мин`;
    }
  }

  private changeFontSize(delta: number): void {
    const nextSize = Math.min(28, Math.max(14, this.settings.fontSize + delta));
    if (nextSize === this.settings.fontSize) return;
    this.settings.fontSize = nextSize;
    this.saveSettings('fontSize');
    this.pager.setFontSize(nextSize);
    this.updateSettingsControls();
  }

  private setPageMode(mode: PageMode): void {
    if (mode === this.settings.pageMode) return;
    this.settings.pageMode = mode;
    this.saveSettings('pageMode');
    this.pager.setPageMode(this.settings.pageMode);
    this.updateSettingsControls();
  }

  private setPageButtons(mode: PageButtonsMode): void {
    if (mode === this.settings.pageButtons) return;
    this.settings.pageButtons = mode;
    document.documentElement.dataset.pageButtons = mode;
    this.saveSettings('pageButtons');
    this.updateSettingsControls();
  }

  private setFootnoteMode(mode: FootnoteMode): void {
    if (mode === this.settings.footnoteMode) return;
    this.settings.footnoteMode = mode;
    if (mode === 'inline') this.clearFootnoteReturn();
    this.content.querySelector<HTMLElement>('.book')
      ?.setAttribute('data-footnotes', this.settings.footnoteMode);
    this.saveSettings('footnoteMode');
    this.updateSettingsControls();
    this.pager.relayout();
  }

  private setTheme(theme: Theme): void {
    if (theme === this.settings.theme) return;
    this.settings.theme = theme;
    document.documentElement.dataset.theme = this.settings.theme;
    this.saveSettings('theme');
    this.updateSettingsControls();
  }

  private updateSettingsControls(): void {
    this.fontSizeValue.textContent = `${this.settings.fontSize} px`;
    for (const input of this.themeInputs) input.checked = input.value === this.settings.theme;
    for (const input of this.pageModeInputs) input.checked = input.value === this.settings.pageMode;
    for (const input of this.pageButtonInputs) {
      input.checked = input.value === this.settings.pageButtons;
    }
    for (const input of this.footnoteModeInputs) input.checked = input.value === this.settings.footnoteMode;
    this.fontDownButton.disabled = this.settings.fontSize <= 14;
    this.fontUpButton.disabled = this.settings.fontSize >= 28;
  }

  private saveSettings<Key extends keyof ReaderSettings>(key: Key): void {
    this.settingsStorage.write(this.settings);
    void this.library.updateSetting(key, this.settings[key]);
  }

  private handleContentClick(event: MouseEvent): void {
    const highlight = (event.target as Element | null)?.closest<HTMLElement>('[data-reader-quote]');
    const quoteId = highlight?.dataset.readerQuote;
    const quote = quoteId ? this.currentQuotes.find((record) => record.id === quoteId) : undefined;
    if (quote) {
      event.preventDefault();
      event.stopPropagation();
      const range = rangeForQuote(this.content, quote);
      if (!range) {
        this.showToast('Место цитаты не найдено');
        return;
      }
      restoreSelection(this.content, quote);
      this.quoteMenuController.open({
        start: quote.start,
        end: quote.end,
        exact: quote.exact,
        prefix: quote.prefix,
        suffix: quote.suffix,
        range,
        id: quote.id,
      }, quote);
      return;
    }
    this.handleBookLink(event);
  }

  private handleBookLink(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link || !this.content.contains(link)) return;
    event.preventDefault();

    const footnote = link.classList.contains('footnote-link');
    if (footnote && this.settings.footnoteMode === 'inline') return;
    const id = decodeURIComponent(link.hash.slice(1));
    const returnAnchor = footnote ? this.pager.getSnapshot().anchor : undefined;
    if (!this.pager.goToId(id)) return;
    this.backAnchor = returnAnchor;
    this.backButton.hidden = !footnote || !this.backAnchor;
  }

  private returnFromFootnote(): boolean {
    if (!this.backAnchor) return false;
    const returned = this.pager.goToAnchor(this.backAnchor);
    if (!returned) return false;
    this.clearFootnoteReturn();
    return true;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') this.headerVisibility.reveal();
    const target = event.target as HTMLElement | null;
    if (!this.settingsPanel.hidden && target && this.settingsPanel.contains(target)) return;
    if (!this.tocPanel.hidden && target && this.tocPanel.contains(target)) return;
    if (!this.annotationsPanel.hidden && target && this.annotationsPanel.contains(target)) return;
    if (!this.quoteMenuElement.hidden && target && this.quoteMenuElement.contains(target)) return;
    if (target?.matches('input, textarea, select') || event.altKey || event.ctrlKey) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        this.navigate(() => this.pager.next());
        event.preventDefault();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        this.navigateBackward();
        event.preventDefault();
        break;
      case 'Home':
        this.clearFootnoteReturn();
        this.navigate(() => this.pager.first());
        event.preventDefault();
        break;
      case 'End':
        this.clearFootnoteReturn();
        this.navigate(() => this.pager.last());
        event.preventDefault();
        break;
      case '+':
      case '=':
        this.changeFontSize(2);
        event.preventDefault();
        break;
      case '-':
      case '_':
        this.changeFontSize(-2);
        event.preventDefault();
        break;
    }
  }

  private navigate(action: () => void): void {
    action();
    this.headerVisibility.hide();
  }

  private navigateBackward(): void {
    if (!this.returnFromFootnote()) this.pager.previous();
    this.headerVisibility.hide();
  }

  private goToTocTarget(target: string): void {
    this.clearFootnoteReturn();
    this.pager.goToAnchor(target, true);
  }

  private clearFootnoteReturn(): void {
    this.backAnchor = undefined;
    this.backButton.hidden = true;
  }

  private handleSettingsOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.tocPanelController.close(false);
      this.annotationPanelController.close(false);
    }
    this.syncHeaderPin();
  }

  private handleTocOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.settingsPanelController.close(false);
      this.annotationPanelController.close(false);
    }
    this.syncHeaderPin();
  }

  private handleAnnotationsOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.settingsPanelController.close(false);
      this.tocPanelController.close(false);
      this.quoteMenuController.close();
    }
    this.syncHeaderPin();
  }

  private syncHeaderPin(): void {
    this.headerVisibility.setPinned(
      this.settingsPanelController.opened
      || this.tocPanelController.opened
      || this.annotationPanelController.opened,
    );
  }

  private currentChapter(): string | undefined {
    const snapshot = this.pager.getSnapshot();
    const target = this.pager.closestPrecedingAnchor(this.currentTocTargets, snapshot.anchor);
    if (!target) return undefined;
    return Array.from(this.tocList.querySelectorAll<HTMLButtonElement>('[data-toc-target]'))
      .find((button) => button.dataset.tocTarget === target)?.textContent?.trim();
  }

  private async createBookmark(note: string, color: AnnotationColor): Promise<void> {
    const fingerprint = this.currentBookFingerprint;
    const snapshot = this.pager.getSnapshot();
    if (!fingerprint || !snapshot.anchor) {
      this.showToast('Не удалось определить текущее место');
      return;
    }
    await this.library.addBookmark(fingerprint, snapshot.anchor, {
      chapter: this.currentChapter(),
      progress: snapshot.progress,
      note,
      color,
    });
    await this.refreshAnnotations();
    this.showToast('Закладка сохранена');
  }

  private goToBookmark(record: BookmarkRecord): void {
    if (!this.pager.goToAnchor(record.anchor, true)) this.showToast('Место закладки не найдено');
  }

  private goToQuote(record: QuoteRecord): void {
    if (!this.pager.goToTextOffset(record.start.anchor, record.start.offset, true)) {
      this.showToast('Место цитаты не найдено');
      return;
    }
    this.applyCurrentHighlights();
    const mark = Array.from(this.content.querySelectorAll<HTMLElement>('[data-reader-quote]'))
      .find((element) => element.dataset.readerQuote === record.id);
    mark?.animate?.(
      [{ outline: '0 solid transparent' }, { outline: '4px solid var(--accent)' }, { outline: '0 solid transparent' }],
      { duration: 900, easing: 'ease-out' },
    );
  }

  private async updateAnnotation(
    record: BookmarkRecord | QuoteRecord,
    note: string,
    color: AnnotationColor,
  ): Promise<void> {
    if (record.kind === 'quote') await this.library.editQuote(record.id, note, color);
    else await this.library.editBookmark(record.id, note, color);
    await this.refreshAnnotations();
    this.applyCurrentHighlights();
    this.showToast('Изменения сохранены');
  }

  private async deleteAnnotation(record: BookmarkRecord | QuoteRecord): Promise<void> {
    if (record.kind === 'quote') await this.library.deleteQuote(record.id);
    else await this.library.deleteBookmark(record.id);
    await this.refreshAnnotations();
    this.applyCurrentHighlights();
    this.showToast(record.kind === 'quote' ? 'Цитата удалена' : 'Закладка удалена');
  }

  private scheduleSelectionMenu(): void {
    if (this.selectionTimer) window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => {
      this.selectionTimer = undefined;
      if (
        !this.currentBookFingerprint
        || this.isPreparing
        || this.selectionPointerActive
        || this.quoteMenuController.opened
        || this.annotationPanelController.opened
      ) return;
      const located = locateSelection(this.content, this.currentBookFingerprint);
      if (!located) return;
      const existing = this.currentQuotes.find((record) => record.id === located.id);
      this.quoteMenuController.open(located, existing);
      this.headerVisibility.reveal();
    }, 180);
  }

  private async saveQuote(
    selection: LocatedSelection,
    note: string,
    color: AnnotationColor,
  ): Promise<void> {
    const fingerprint = this.currentBookFingerprint;
    if (!fingerprint) return;
    await this.library.addQuote(fingerprint, {
      start: selection.start,
      end: selection.end,
      exact: selection.exact,
      prefix: selection.prefix,
      suffix: selection.suffix,
      chapter: this.currentChapter(),
      progress: this.pager.getSnapshot().progress,
      note,
      color,
    });
    await this.refreshAnnotations();
    this.applyCurrentHighlights();
    window.getSelection()?.removeAllRanges();
    this.showToast('Цитата сохранена');
  }

  private async refreshAnnotations(): Promise<void> {
    const fingerprint = this.currentBookFingerprint;
    if (!fingerprint) {
      this.currentBookmarks = [];
      this.currentQuotes = [];
    } else {
      const state = await this.library.repository.read();
      this.currentBookmarks = visibleBookmarks(state, fingerprint);
      this.currentQuotes = visibleQuotes(state, fingerprint);
    }
    this.annotationPanelController.setRecords(
      this.currentBookmarks,
      this.currentQuotes,
      Boolean(fingerprint),
    );
    this.updateCurrentBookmark(this.pager.getSnapshot().anchor);
  }

  private updateCurrentBookmark(anchor: string | undefined): void {
    if (!anchor || !this.currentBookFingerprint) {
      this.annotationPanelController.setCurrentBookmark(undefined);
      return;
    }
    const id = bookmarkId(this.currentBookFingerprint, anchor);
    this.annotationPanelController.setCurrentBookmark(
      this.currentBookmarks.find((record) => record.id === id),
    );
  }

  private applyCurrentHighlights(): void {
    applyQuoteHighlights(this.content, this.currentQuotes);
  }

  private bindSynchronization(): void {
    this.library.repository.subscribe((state) => this.applyRepositoryState(state));
    this.syncEngine.providerEvents((event) => this.updateProviderStatus(event));
    this.syncEngine.subscribe((event) => {
      if (event.type === 'started') {
        this.syncLastTime.textContent = 'Синхронизируем…';
      } else if (event.type === 'completed' && event.lastSyncAt) {
        this.syncLastTime.textContent = `Последняя синхронизация: ${this.formatSyncTime(event.lastSyncAt)}`;
      } else if (event.type === 'error') {
        this.syncLastTime.textContent = event.message || 'Ошибка синхронизации';
      }
    });
    this.googleConnect.addEventListener('click', () => void this.toggleProvider(this.googleProvider));
    this.yandexConnect.addEventListener('click', () => void this.toggleProvider(this.yandexProvider));
    this.syncNowButton.addEventListener('click', () => void this.syncEngine.syncNow());
    const lastSync = localStorage.getItem('chitalka:sync:last');
    if (lastSync) this.syncLastTime.textContent = `Последняя синхронизация: ${this.formatSyncTime(lastSync)}`;
    this.showMissingSyncConfiguration();
  }

  private showMissingSyncConfiguration(): void {
    if (!this.googleSyncConfigured) {
      this.googleSyncStatus.textContent = 'Нужен Client ID';
      this.googleConnect.disabled = true;
      this.googleConnect.title = 'Задайте VITE_GOOGLE_CLIENT_ID при сборке';
    }
    if (!this.yandexSyncConfigured) {
      this.yandexSyncStatus.textContent = 'Нужен Client ID';
      this.yandexConnect.disabled = true;
      this.yandexConnect.title = 'Задайте VITE_YANDEX_CLIENT_ID при сборке';
    }
  }

  private applyRepositoryState(state: ReaderState): void {
    const nextSettings = this.normalizedSettings(this.library.settingsFromState(state, this.settings));
    if (JSON.stringify(nextSettings) !== JSON.stringify(this.settings)) {
      this.settings = nextSettings;
      this.settingsStorage.write(this.settings);
      this.applySettings();
      this.content.querySelector<HTMLElement>('.book')
        ?.setAttribute('data-footnotes', this.settings.footnoteMode);
      this.pager.relayout();
    }
    if (this.currentBookFingerprint) {
      this.currentBookmarks = visibleBookmarks(state, this.currentBookFingerprint);
      this.currentQuotes = visibleQuotes(state, this.currentBookFingerprint);
      this.annotationPanelController.setRecords(this.currentBookmarks, this.currentQuotes, true);
      this.applyCurrentHighlights();
    }
  }

  private async toggleProvider(provider: CloudProvider): Promise<void> {
    try {
      if (provider.status === 'connected' || provider.status === 'syncing') {
        await provider.disconnect();
      } else {
        await provider.connect();
        await this.syncEngine.syncNow();
      }
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Не удалось подключить облако');
    }
  }

  private updateProviderStatus(event: ProviderStatusEvent): void {
    const label = event.provider === 'google' ? this.googleSyncStatus : this.yandexSyncStatus;
    const button = event.provider === 'google' ? this.googleConnect : this.yandexConnect;
    const statuses: Record<ProviderStatusEvent['status'], string> = {
      disconnected: 'Не подключён',
      connecting: 'Подключаем…',
      connected: 'Подключён',
      syncing: 'Синхронизируем…',
      reconnect: 'Нужно переподключить',
      error: event.message || 'Ошибка',
    };
    label.textContent = statuses[event.status];
    const connected = event.status === 'connected' || event.status === 'syncing';
    button.textContent = connected ? 'Отключить' : event.status === 'reconnect' ? 'Переподключить' : 'Подключить';
    button.disabled = event.status === 'connecting' || event.status === 'syncing';
    if (
      (event.provider === 'google' && !this.googleSyncConfigured)
      || (event.provider === 'yandex' && !this.yandexSyncConfigured)
    ) {
      label.textContent = 'Нужен Client ID';
      button.disabled = true;
    }
    this.syncNowButton.disabled = ![this.googleProvider, this.yandexProvider]
      .some((candidate) => candidate.status === 'connected');
  }

  private formatSyncTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'неизвестно' : date.toLocaleString('ru-RU');
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, 5000);
  }
}
