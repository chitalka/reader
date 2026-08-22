import { decodeBookFile, decodeBookUrl, type DecodedBookSource } from './fb2/decode';
import { tocPathLabels, type BookTocItem } from './book/model';
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
  swipeTurnDirection,
} from './header-visibility';
import { VisibilityMotion } from './motion';
import {
  ReaderPager,
  type PagerSnapshot,
  type PageMode,
  type PageTurnMotion,
} from './reader/pager';
import { formatPageLabel } from './reader/page-label';
import { SkimController } from './skim-controller';
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
  nextRevision,
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
import { AnalyticsRepository } from './reader/analytics-repository';
import {
  estimateMinutes,
  medianReadingSpeed,
  nonWhitespaceCharacters,
  ReadingSessionTracker,
  type ReadingSession,
  type ReadingSpeed,
} from './reader/analytics';
import type { CloudProvider, ProviderStatusEvent } from './sync/provider';
import { hideLoadingOverlay, showLoadingOverlay } from './splash';
import {
  applyDocumentTranslations,
  formatCompactTimeLeft,
  getLanguage,
  normalizeLanguage,
  setLanguage as activateLanguage,
  t,
  type Language,
  type TranslationKey,
} from './i18n';
import {
  DEFAULT_SETTINGS,
  effectiveTheme,
  normalizeFullscreenStatusMode,
  normalizePageButtonsMode,
  normalizeTheme,
  type FootnoteMode,
  type FullscreenStatusMode,
  type PageButtonsMode,
  type ReaderSettings,
  type Theme,
} from './settings';

const demoBookUrl = new URL('../books/Anna-Karenina.fb2', import.meta.url);

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(t('error.interfaceElement', { id }));
  return element as T;
}

function requiredInputs(name: string): HTMLInputElement[] {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  if (!inputs.length) throw new Error(t('error.settingInputs', { name }));
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
  private readonly analyticsRepository = new AnalyticsRepository();
  private readonly googleSyncConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  private readonly yandexSyncConfigured = Boolean(import.meta.env.VITE_YANDEX_CLIENT_ID);
  private readonly colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly googleProvider = new GoogleDriveProvider();
  private readonly yandexProvider = new YandexDiskProvider();
  private readonly syncEngine = new SyncEngine(
    this.library.repository,
    [this.googleProvider, this.yandexProvider],
    this.analyticsRepository,
  );
  private readonly analyticsTracker = new ReadingSessionTracker(async (session) => {
    try {
      await this.analyticsRepository.add(session);
    } catch {
      this.showToast(t('analytics.storageError'));
      return;
    }
    this.syncEngine.schedule();
    if (this.settingsPanelController?.opened) await this.renderAnalytics();
  });
  private readonly viewport = requiredElement<HTMLElement>('book-viewport');
  private readonly content = requiredElement<HTMLElement>('book-content');
  private readonly fullscreenPageTrack = requiredElement<HTMLElement>('fullscreen-page-track');
  private readonly pager = new ReaderPager(
    this.viewport,
    this.content,
    (snapshot, motion) => this.onPageChanged(snapshot, motion),
    this.fullscreenPageTrack,
  );
  private currentBookFilename?: string;
  private currentBookTitle?: string;
  private currentBookFingerprint?: string;
  private currentBookmarks: BookmarkRecord[] = [];
  private currentQuotes: QuoteRecord[] = [];
  private currentWordCount = 0;
  private currentCharacterCount = 0;
  private personalSpeed?: ReadingSpeed;
  private analyticsHistoryExpanded = false;
  private currentTocTargets: string[] = [];
  private currentTocLabels = new Map<string, string>();
  private backAnchor?: string;
  private isPreparing = true;
  private dragDepth = 0;
  private savePositionTimer?: number;
  private toastTimer?: number;
  private selectionTimer?: number;
  private selectionPointerActive = false;
  private loadingMessage: { key: TranslationKey; parameters?: Record<string, string | number> } = {
    key: 'app.demoLoading',
  };
  private readonly providerStatuses = new Map<ProviderStatusEvent['provider'], ProviderStatusEvent>();
  private syncDisplay: { type: 'never' | 'started' | 'completed' | 'error'; value?: string } = {
    type: 'never',
  };

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
  private readonly pagingControls = requiredElement<HTMLElement>('paging-controls');
  private readonly progressGroup = requiredElement<HTMLElement>('progress-group');
  private readonly progress = requiredElement<HTMLProgressElement>('book-progress');
  private readonly progressPercent = requiredElement<HTMLElement>('progress-percent');
  private readonly pageLabel = requiredElement<HTMLElement>('page-label');
  private readonly timeLabel = requiredElement<HTMLElement>('time-label');
  private readonly compactTimeLabel = requiredElement<HTMLElement>('time-label-compact');
  private readonly readerFooter = requiredElement<HTMLElement>('reader-footer');
  private readonly fullscreenProgressPercent = requiredElement<HTMLElement>(
    'fullscreen-progress-percent',
  );
  private readonly scrubber = requiredElement<HTMLInputElement>('book-scrubber');
  private readonly skimPopover = requiredElement<HTMLElement>('skim-popover');
  private readonly skimChapter = requiredElement<HTMLElement>('skim-chapter');
  private readonly skimPage = requiredElement<HTMLElement>('skim-page');
  private readonly skimPreview = requiredElement<HTMLElement>('skim-preview');
  private readonly skimHint = requiredElement<HTMLElement>('skim-hint');
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
  private readonly quoteMenuTitle = requiredElement<HTMLElement>('quote-menu-title');
  private readonly quoteMenuClose = requiredElement<HTMLButtonElement>('quote-menu-close');
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
  private readonly analyticsToggle = requiredElement<HTMLInputElement>('reading-analytics-toggle');
  private readonly analyticsEmpty = requiredElement<HTMLElement>('analytics-empty');
  private readonly analyticsDashboard = requiredElement<HTMLElement>('analytics-dashboard');
  private readonly analyticsSummary = requiredElement<HTMLElement>('analytics-summary');
  private readonly analyticsSpeed = requiredElement<HTMLElement>('analytics-speed');
  private readonly analyticsForecast = requiredElement<HTMLElement>('analytics-forecast');
  private readonly analyticsWeek = requiredElement<HTMLElement>('analytics-week');
  private readonly analyticsCalendar = requiredElement<HTMLElement>('analytics-calendar');
  private readonly analyticsSessions = requiredElement<HTMLElement>('analytics-sessions');
  private readonly analyticsHistoryToggle = requiredElement<HTMLButtonElement>('analytics-history-toggle');
  private readonly analyticsClear = requiredElement<HTMLButtonElement>('analytics-clear');
  private readonly analyticsClearDialog = requiredElement<HTMLDialogElement>('analytics-clear-dialog');
  private readonly analyticsClearConfirm = requiredElement<HTMLButtonElement>('analytics-clear-confirm');
  private readonly languageSelect = requiredElement<HTMLSelectElement>('language-select');
  private readonly themeInputs = requiredInputs('theme');
  private readonly pageModeInputs = requiredInputs('page-mode');
  private readonly pageButtonInputs = requiredInputs('page-buttons');
  private readonly fullscreenStatusInputs = requiredInputs('fullscreen-status');
  private readonly footnoteModeInputs = requiredInputs('footnote-mode');
  private readonly backButton = requiredElement<HTMLButtonElement>('back-to-text');
  private readonly toast = requiredElement<HTMLElement>('toast');
  private readonly toastMotion = new VisibilityMotion(this.toast);
  private readonly appRoot = requiredElement<HTMLElement>('app');
  private readonly header = requiredElement<HTMLElement>('app-header');
  private readonly headerVisibility = new HeaderVisibilityController(
    this.appRoot,
    this.header,
    undefined,
    undefined,
    'manual',
    [this.pagingControls, this.progressGroup],
  );
  private readonly settingsPanelController: SettingsPanelController;
  private readonly tocPanelController: TocPanelController;
  private readonly annotationPanelController: AnnotationPanelController;
  private readonly quoteMenuController: QuoteMenuController;
  private readonly skimController: SkimController;

  constructor() {
    activateLanguage(this.settings.language);
    applyDocumentTranslations();
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
        title: this.quoteMenuTitle,
        closeButton: this.quoteMenuClose,
        colors: this.quoteMenuColors,
        note: this.quoteMenuNote,
        saveButton: this.quoteMenuSave,
        deleteButton: this.quoteMenuDelete,
      },
      (selection, note, color) => this.saveQuote(selection, note, color),
      (quote) => this.deleteAnnotation(quote),
    );
    this.skimController = new SkimController(
      {
        group: this.progressGroup,
        input: this.scrubber,
        popover: this.skimPopover,
        chapter: this.skimChapter,
        page: this.skimPage,
        preview: this.skimPreview,
        hint: this.skimHint,
      },
      this.pager,
      {
        chapterForAnchor: (anchor) => this.skimChapterForAnchor(anchor),
        committed: () => {
          this.clearFootnoteReturn();
          this.headerVisibility.hide();
        },
      },
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
    return {
      language: normalizeLanguage(value.language),
      fontSize: Number.isFinite(value.fontSize)
        ? Math.min(28, Math.max(14, value.fontSize))
        : DEFAULT_SETTINGS.fontSize,
      pageMode: pageModes.includes(value.pageMode) ? value.pageMode : DEFAULT_SETTINGS.pageMode,
      pageButtons: normalizePageButtonsMode(value.pageButtons),
      fullscreenStatus: normalizeFullscreenStatusMode(value.fullscreenStatus),
      footnoteMode: footnoteModes.includes(value.footnoteMode)
        ? value.footnoteMode
        : DEFAULT_SETTINGS.footnoteMode,
      theme: normalizeTheme(value.theme),
      wordsPerMinute: Number.isFinite(value.wordsPerMinute)
        ? Math.min(500, Math.max(80, value.wordsPerMinute))
        : DEFAULT_SETTINGS.wordsPerMinute,
      readingAnalytics: value.readingAnalytics === true,
    };
  }

  private applySettings(): void {
    this.applyLanguage();
    this.pager.setFontSize(this.settings.fontSize);
    this.pager.setPageMode(this.settings.pageMode);
    this.content.querySelector<HTMLElement>('.book')
      ?.setAttribute('data-footnotes', this.settings.footnoteMode);
    this.applyTheme();
    document.documentElement.dataset.pageButtons = this.settings.pageButtons;
    this.appRoot.dataset.fullscreenStatus = this.settings.fullscreenStatus;
    this.updateSettingsControls();
    this.analyticsTracker.configure(this.settings.readingAnalytics);
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
    for (const input of this.fullscreenStatusInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setFullscreenStatus(input.value as FullscreenStatusMode);
      });
    }
    for (const input of this.footnoteModeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.setFootnoteMode(input.value as FootnoteMode);
      });
    }
    this.backButton.addEventListener('click', () => this.returnFromFootnote());
    this.languageSelect.addEventListener('change', () => {
      this.setInterfaceLanguage(normalizeLanguage(this.languageSelect.value));
    });
    this.colorSchemeQuery.addEventListener('change', this.handleColorSchemeChange);
    this.analyticsToggle.addEventListener('change', () => {
      this.settings.readingAnalytics = this.analyticsToggle.checked;
      this.saveSettings('readingAnalytics');
      this.analyticsTracker.configure(this.settings.readingAnalytics);
      void this.renderAnalytics();
    });
    for (const button of this.settingsPanel.querySelectorAll<HTMLButtonElement>('[data-settings-section]')) {
      button.addEventListener('click', () => this.showSettingsSection(button.dataset.settingsSection ?? 'reading'));
    }
    this.analyticsClear.addEventListener('click', () => this.analyticsClearDialog.showModal());
    this.analyticsHistoryToggle.addEventListener('click', () => {
      this.analyticsHistoryExpanded = !this.analyticsHistoryExpanded;
      void this.renderAnalytics();
    });
    this.analyticsClearConfirm.addEventListener('click', () => void this.clearAnalytics());
    document.addEventListener('visibilitychange', () => this.analyticsTracker.setPaused(document.hidden));
    window.addEventListener('blur', () => this.analyticsTracker.setPaused(true));
    window.addEventListener('focus', () => this.analyticsTracker.setPaused(false));

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) void this.loadFile(file);
      this.fileInput.value = '';
    });

    this.content.addEventListener('click', (event) => this.handleContentClick(event));
    preventBookContentDrag(this.content);
    this.content.addEventListener('pointerdown', () => {
      this.selectionPointerActive = true;
      this.analyticsTracker.record(this.pager.getSnapshot());
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
    bindTouchSwipe(this.viewport, {
      start: () => this.pager.beginSwipe(),
      move: (distance) => this.pager.updateSwipe(distance),
      end: (sample) => {
        const direction = swipeTurnDirection(sample, this.viewport.clientWidth);
        if (direction === 0) {
          this.pager.cancelSwipe();
          return;
        }
        if (direction < 0 && this.backAnchor) {
          this.pager.cancelSwipe();
          this.navigateBackward();
          return;
        }
        if (this.pager.finishSwipe(direction)) this.headerVisibility.hide();
      },
      cancel: () => this.pager.cancelSwipe(),
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
    this.setLoading('loading.openFile', { filename: file.name });
    await showLoadingOverlay(t('loading.openFile', { filename: file.name }));
    try {
      await this.loadDecoded(await decodeBookFile(file));
    } catch (error) {
      this.showError(error);
    } finally {
      hideLoadingOverlay();
    }
  }

  private async loadDecoded(source: DecodedBookSource): Promise<void> {
    this.setLoading('loading.prepareFile', { filename: source.filename });
    const rendered = source.format === 'epub'
      ? renderEpub(parseEpubArchive(source.files))
      : renderFb2(parseFb2(source.xml));
    const bookRoot = rendered.fragment.querySelector<HTMLElement>('.book');
    bookRoot?.setAttribute('data-footnotes', this.settings.footnoteMode);

    this.currentBookFilename = source.filename;
    this.currentBookTitle = rendered.metadata.title;
    this.currentBookFingerprint = source.fingerprint;
    this.currentWordCount = rendered.wordCount;
    this.currentCharacterCount = nonWhitespaceCharacters(rendered.fragment.textContent ?? '');
    this.currentTocTargets = tocTargets(rendered.toc);
    this.currentTocLabels = tocPathLabels(rendered.toc);
    this.tocPanelController.setItems(rendered.toc);
    this.backAnchor = undefined;
    this.backButton.hidden = true;
    this.title.textContent = rendered.metadata.title;
    this.author.textContent = rendered.metadata.authors.join(', ');
    document.title = `${rendered.metadata.title} — ${t('app.name')}`;

    await this.library.registerBook({
      fingerprint: source.fingerprint,
      title: rendered.metadata.title,
      authors: rendered.metadata.authors,
      format: source.format,
      filename: source.filename,
    });
    const state = await this.library.repository.read();
    this.analyticsTracker.setBook({
      fingerprint: source.fingerprint,
      title: rendered.metadata.title,
      deviceId: state.deviceId,
      wordCount: this.currentWordCount,
      characterCount: this.currentCharacterCount,
    });
    await this.refreshPersonalSpeed();
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

  private setLoading(key: TranslationKey, parameters?: Record<string, string | number>): void {
    this.settingsPanelController.close(false);
    this.annotationPanelController.close(false);
    this.tocPanelController.setItems([]);
    this.isPreparing = true;
    this.currentBookFilename = undefined;
    this.currentBookTitle = undefined;
    this.currentBookFingerprint = undefined;
    this.analyticsTracker.setBook(undefined);
    this.currentBookmarks = [];
    this.currentQuotes = [];
    this.annotationPanelController.setRecords([], [], false);
    this.quoteMenuController.close();
    this.currentTocTargets = [];
    this.currentTocLabels.clear();
    this.setPaginationPending(true);
    if (this.savePositionTimer) {
      window.clearTimeout(this.savePositionTimer);
      this.savePositionTimer = undefined;
    }
    this.loadingMessage = { key, parameters };
    this.statusMessage.textContent = t(key, parameters);
    this.status.classList.remove('is-error');
    this.status.hidden = false;
    this.reader.hidden = false;
    this.reader.classList.add('is-preparing');
    this.dropZone.setAttribute('aria-busy', 'true');
    this.headerVisibility.reveal();
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : t('error.unknown');
    this.showToast(message);

    this.currentBookFilename = undefined;
    this.currentBookFingerprint = undefined;
    this.currentBookmarks = [];
    this.currentQuotes = [];
    this.annotationPanelController.close(false);
    this.annotationPanelController.setRecords([], [], false);
    this.quoteMenuController.close();
    this.statusMessage.textContent = t('error.chooseAnother', { message });
    this.status.classList.add('is-error');
    this.status.hidden = false;
    this.reader.classList.add('is-preparing');
    this.dropZone.setAttribute('aria-busy', 'false');
    this.headerVisibility.reveal();
  }

  private onPageChanged(snapshot: PagerSnapshot, motion?: PageTurnMotion): void {
    this.previousButton.disabled = this.pager.isFirst();
    this.nextButton.disabled = this.pager.isLast();
    this.tocPanelController.setActive(
      this.pager.closestPrecedingAnchor(this.currentTocTargets, snapshot.anchor),
    );

    this.renderProgress(snapshot, motion);
    this.analyticsTracker.record(snapshot);

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

  private renderProgress(snapshot: PagerSnapshot, motion?: PageTurnMotion): void {
    this.skimController.sync(snapshot);
    this.pageLabel.textContent = formatPageLabel(snapshot);
    this.renderFullscreenPages(snapshot, motion);
    const pagesPerView = String(snapshot.pagesPerView);
    if (this.appRoot.dataset.pagesPerView !== pagesPerView) {
      this.appRoot.dataset.pagesPerView = pagesPerView;
    }

    if (this.progress.value !== snapshot.progress) this.progress.value = snapshot.progress;
    const roundedProgress = Math.round(snapshot.progress);
    const progressText = `${roundedProgress}%`;
    if (this.progressPercent.textContent !== progressText) {
      this.progressPercent.textContent = progressText;
    }
    if (this.fullscreenProgressPercent.textContent !== progressText) {
      this.fullscreenProgressPercent.textContent = progressText;
    }
    if (this.progress.textContent !== progressText) this.progress.textContent = progressText;

    if (snapshot.paginationExact) {
      this.updateTimeEstimate(snapshot.progress);
    } else {
      this.setTimeEstimatePending();
    }
    this.setPaginationPending(!snapshot.paginationExact);
  }

  private renderFullscreenPages(snapshot: PagerSnapshot, motion?: PageTurnMotion): void {
    const cssDistance = Number.parseFloat(
      this.fullscreenPageTrack.style.getPropertyValue('--reader-page-turn-distance'),
    );
    const spreadDistance = motion?.spreadDistance
      ?? (Number.isFinite(cssDistance) && cssDistance > 0 ? cssDistance : this.viewport.clientWidth);
    const offsets = new Map<number, number>([
      [-1, -spreadDistance],
      [0, 0],
      [1, spreadDistance],
    ]);

    if (motion) {
      const direction = Math.sign(motion.startOffset);
      const crossedSpreads = Math.ceil(Math.abs(motion.startOffset) / spreadDistance);
      for (let step = 2; step <= Math.min(6, crossedSpreads); step += 1) {
        const pageOffset = -direction * step;
        offsets.set(pageOffset, pageOffset * spreadDistance);
      }
      if (crossedSpreads > 6) {
        const pageOffset = -Math.round(motion.startOffset / spreadDistance);
        offsets.set(pageOffset, -motion.startOffset);
      }
    }

    const fragment = document.createDocumentFragment();
    for (const [spreadOffset, pixelOffset] of [...offsets].sort((a, b) => a[1] - b[1])) {
      const firstPage = snapshot.currentPage + spreadOffset * snapshot.pagesPerView;
      if (firstPage < 1 || firstPage > snapshot.totalPages) continue;
      const spread = document.createElement('div');
      spread.className = 'fullscreen-page-spread';
      spread.dataset.pagesPerView = String(snapshot.pagesPerView);
      spread.style.transform = `translateX(${pixelOffset}px)`;

      const first = document.createElement('span');
      first.textContent = String(firstPage);
      spread.append(first);

      const secondPage = firstPage + 1;
      if (snapshot.pagesPerView === 2 && secondPage <= snapshot.totalPages) {
        const second = document.createElement('span');
        second.textContent = String(secondPage);
        spread.append(second);
      }
      fragment.append(spread);
    }
    this.fullscreenPageTrack.replaceChildren(fragment);
  }

  private skimChapterForAnchor(anchor: string | undefined): string {
    const target = this.pager.closestPrecedingAnchor(this.currentTocTargets, anchor);
    return (target && this.currentTocLabels.get(target)) || this.currentBookTitle || t('app.name');
  }

  private setPaginationPending(pending: boolean): void {
    const value = String(pending);
    if (
      this.progressGroup.classList.contains('is-pending') === pending
      && this.readerFooter.classList.contains('is-pending') === pending
      && this.progressGroup.getAttribute('aria-busy') === value
    ) return;
    this.progressGroup.classList.toggle('is-pending', pending);
    this.readerFooter.classList.toggle('is-pending', pending);
    this.progressGroup.setAttribute('aria-busy', value);
  }

  private setTimeEstimatePending(): void {
    if (this.timeLabel.textContent !== '…') this.timeLabel.textContent = '…';
    if (this.compactTimeLabel.textContent !== '…') this.compactTimeLabel.textContent = '…';
  }

  private updateTimeEstimate(progress: number): void {
    const wordsLeft = Math.max(0, this.currentWordCount * (1 - progress / 100));
    const minutes = estimateMinutes(wordsLeft, this.personalSpeed, this.settings.wordsPerMinute);
    const timeText = (() => {
      if (minutes <= 1) return t('reader.lessThanMinute');
      if (minutes < 60) return t('reader.minutesLeft', { minutes });
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return t('reader.hoursLeft', { hours, minutes: remainder });
    })();
    if (this.timeLabel.textContent !== timeText) this.timeLabel.textContent = timeText;
    const compactTimeText = formatCompactTimeLeft(minutes);
    if (this.compactTimeLabel.textContent !== compactTimeText) {
      this.compactTimeLabel.textContent = compactTimeText;
    }
  }

  private showSettingsSection(section: string): void {
    for (const view of this.settingsPanel.querySelectorAll<HTMLElement>('[data-settings-view]')) {
      view.hidden = view.dataset.settingsView !== section;
    }
    for (const button of this.settingsPanel.querySelectorAll<HTMLButtonElement>('[data-settings-section]')) {
      const active = button.dataset.settingsSection === section;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    this.settingsPanel.scrollTop = 0;
    if (section === 'analytics') void this.renderAnalytics();
  }

  private async refreshPersonalSpeed(sessions?: ReadingSession[]): Promise<void> {
    const recent = sessions ?? await this.analyticsRepository.list();
    this.personalSpeed = this.settings.readingAnalytics ? medianReadingSpeed(recent.slice(0, 10)) : undefined;
    if (!this.isPreparing) this.updateTimeEstimate(this.pager.getSnapshot().progress);
  }

  private async renderAnalytics(): Promise<void> {
    const sessions = await this.analyticsRepository.list();
    await this.refreshPersonalSpeed(sessions);
    const enabled = this.settings.readingAnalytics;
    this.analyticsToggle.checked = enabled;
    this.analyticsEmpty.hidden = enabled && sessions.length > 0;
    this.analyticsDashboard.hidden = !enabled || sessions.length === 0;
    this.analyticsClear.disabled = sessions.length === 0;
    if (!enabled || !sessions.length) return;

    const now = new Date();
    const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
    const today = dayKey(now);
    const todayMs = sessions.filter((session) => session.startedAt.slice(0, 10) === today)
      .reduce((sum, session) => sum + session.activeMs, 0);
    const totalScreens = sessions.reduce((sum, session) => sum + session.screensRead, 0);
    const activeDays = new Set(sessions.map((session) => session.startedAt.slice(0, 10)));
    let streak = 0;
    for (let offset = 0; offset < 3660; offset += 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      if (!activeDays.has(dayKey(date))) break;
      streak += 1;
    }
    this.analyticsSummary.replaceChildren(
      this.analyticsMetric(this.settings.language === 'ru' ? 'Сегодня' : 'Today', this.formatDuration(todayMs)),
      this.analyticsMetric(this.settings.language === 'ru' ? 'Серия' : 'Streak', this.settings.language === 'ru' ? `${streak} дн.` : `${streak} days`),
      this.analyticsMetric(this.settings.language === 'ru' ? 'Перелистано' : 'Turned', this.settings.language === 'ru' ? `${totalScreens} экранов` : `${totalScreens} screens`),
    );

    this.analyticsSpeed.replaceChildren();
    if (this.personalSpeed) {
      const primary = document.createElement('strong');
      primary.textContent = `${this.personalSpeed.wordsPerMinute} ${this.settings.language === 'ru' ? 'слов/мин' : 'words/min'}`;
      const secondary = document.createElement('span');
      secondary.textContent = `${this.personalSpeed.charactersPerMinute.toLocaleString(this.settings.language)} ${this.settings.language === 'ru' ? 'знаков/мин' : 'chars/min'}`;
      this.analyticsSpeed.append(primary, secondary);
    } else {
      this.analyticsSpeed.textContent = this.settings.language === 'ru' ? 'Недостаточно данных' : 'Not enough data';
    }

    this.analyticsForecast.replaceChildren();
    if (this.currentBookTitle && this.currentWordCount > 0) {
      const progress = this.pager.getSnapshot().progress;
      const minutes = estimateMinutes(this.currentWordCount * (1 - progress / 100), this.personalSpeed, this.settings.wordsPerMinute);
      const title = document.createElement('strong');
      title.textContent = this.currentBookTitle;
      const remaining = document.createElement('span');
      remaining.textContent = `${this.settings.language === 'ru' ? 'Осталось' : 'About'} ≈ ${this.formatDuration(minutes * 60_000)}`;
      this.analyticsForecast.append(title, remaining);

      const dailyReadingMinutes = this.medianDailyReadingMinutes(sessions, now);
      if (dailyReadingMinutes) {
        const rhythm = document.createElement('span');
        const days = Math.max(1, Math.ceil(minutes / dailyReadingMinutes));
        rhythm.textContent = this.settings.language === 'ru'
          ? `При текущем ритме — ${days} дн.`
          : `At your current pace — ${days} days`;
        this.analyticsForecast.append(rhythm);
      }
    }

    this.renderAnalyticsWeek(sessions, now);
    this.renderAnalyticsCalendar(sessions, now);
    this.renderAnalyticsSessions(this.analyticsHistoryExpanded ? sessions : sessions.slice(0, 3));
    this.analyticsHistoryToggle.hidden = sessions.length <= 3;
    this.analyticsHistoryToggle.textContent = t(this.analyticsHistoryExpanded ? 'analytics.showRecent' : 'analytics.showAll');
    this.analyticsHistoryToggle.title = this.analyticsHistoryToggle.textContent;
  }

  private medianDailyReadingMinutes(sessions: ReadingSession[], now: Date): number | undefined {
    const daily = new Map<string, number>();
    const firstDay = new Date(now);
    firstDay.setHours(0, 0, 0, 0);
    firstDay.setDate(firstDay.getDate() - 13);
    sessions.forEach((session) => {
      const startedAt = new Date(session.startedAt);
      if (startedAt < firstDay || startedAt > now) return;
      const key = session.startedAt.slice(0, 10);
      daily.set(key, (daily.get(key) ?? 0) + session.activeMs);
    });
    if (daily.size < 3) return undefined;
    const values = [...daily.values()].map((value) => value / 60_000).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1]! + values[middle]!) / 2;
  }

  private analyticsMetric(label: string, value: string): HTMLElement {
    const item = document.createElement('div');
    const caption = document.createElement('span');
    const strong = document.createElement('strong');
    caption.textContent = label;
    strong.textContent = value;
    item.append(caption, strong);
    return item;
  }

  private renderAnalyticsWeek(sessions: ReadingSession[], now: Date): void {
    const values: number[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      values.push(sessions.filter((session) => session.startedAt.slice(0, 10) === key)
        .reduce((sum, session) => sum + session.activeMs, 0));
    }
    const maximum = Math.max(...values, 1);
    const formatter = new Intl.DateTimeFormat(this.settings.language, { weekday: 'short' });
    this.analyticsWeek.replaceChildren(...values.map((value, index) => {
      const item = document.createElement('div');
      const bar = document.createElement('span');
      bar.style.setProperty('--bar-height', `${Math.max(4, value / maximum * 100)}%`);
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - index));
      const label = document.createElement('small');
      label.textContent = formatter.format(date);
      item.title = this.formatDuration(value);
      item.append(bar, label);
      return item;
    }));
  }

  private renderAnalyticsCalendar(sessions: ReadingSession[], now: Date): void {
    const totals = new Map<string, number>();
    sessions.forEach((session) => totals.set(
      session.startedAt.slice(0, 10),
      (totals.get(session.startedAt.slice(0, 10)) ?? 0) + session.activeMs,
    ));
    const cells: HTMLElement[] = [];
    for (let offset = 364; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const value = totals.get(date.toISOString().slice(0, 10)) ?? 0;
      const cell = document.createElement('span');
      cell.dataset.level = String(value === 0 ? 0 : value < 15 * 60_000 ? 1 : value < 30 * 60_000 ? 2 : value < 60 * 60_000 ? 3 : 4);
      cell.title = `${new Intl.DateTimeFormat(this.settings.language, { dateStyle: 'medium' }).format(date)} · ${this.formatDuration(value)}`;
      cells.push(cell);
    }
    this.analyticsCalendar.replaceChildren(...cells);
  }

  private renderAnalyticsSessions(sessions: ReadingSession[]): void {
    const formatter = new Intl.DateTimeFormat(this.settings.language, { dateStyle: 'medium', timeStyle: 'short' });
    this.analyticsSessions.replaceChildren(...sessions.map((session) => {
      const row = document.createElement('div');
      const heading = document.createElement('div');
      const title = document.createElement('strong');
      const duration = document.createElement('span');
      const metadata = document.createElement('small');
      title.textContent = session.bookTitle;
      duration.textContent = this.formatDuration(session.activeMs);
      const speed = session.speedSampleMs >= 120_000 ? Math.round(session.wordsRead / (session.speedSampleMs / 60_000)) : undefined;
      metadata.textContent = [
        formatter.format(new Date(session.startedAt)),
        this.settings.language === 'ru' ? `${session.screensRead} экранов` : `${session.screensRead} screens`,
        speed ? `${speed} ${this.settings.language === 'ru' ? 'слов/мин' : 'words/min'}` : undefined,
      ].filter(Boolean).join(' · ');
      heading.append(title, duration);
      row.append(heading, metadata);
      return row;
    }));
  }

  private formatDuration(milliseconds: number): string {
    const minutes = Math.max(0, Math.round(milliseconds / 60_000));
    if (minutes < 60) return this.settings.language === 'ru' ? `${minutes} мин` : `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return this.settings.language === 'ru' ? `${hours} ч ${remainder} мин` : `${hours} h ${remainder} min`;
  }

  private async clearAnalytics(): Promise<void> {
    await this.analyticsTracker.finish();
    await this.analyticsRepository.clear();
    await this.library.repository.update((state) => {
      state.analyticsCleared = {
        value: new Date().toISOString(),
        revision: nextRevision(state),
        updatedAt: new Date().toISOString(),
      };
    });
    this.personalSpeed = undefined;
    this.syncEngine.schedule();
    await this.renderAnalytics();
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

  private setFullscreenStatus(mode: FullscreenStatusMode): void {
    if (mode === this.settings.fullscreenStatus) return;
    this.settings.fullscreenStatus = mode;
    this.appRoot.dataset.fullscreenStatus = mode;
    this.saveSettings('fullscreenStatus');
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
    this.applyTheme();
    this.saveSettings('theme');
    this.updateSettingsControls();
  }

  private applyTheme(): void {
    const theme = effectiveTheme(this.settings.theme, this.colorSchemeQuery.matches);
    document.documentElement.dataset.themeMode = this.settings.theme;
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>('#app-theme-color');
    if (themeColor) themeColor.content = theme === 'dark' ? '#171717' : '#f5f4f2';
  }

  private updateSettingsControls(): void {
    this.fontSizeValue.textContent = `${this.settings.fontSize} px`;
    for (const input of this.themeInputs) input.checked = input.value === this.settings.theme;
    for (const input of this.pageModeInputs) input.checked = input.value === this.settings.pageMode;
    for (const input of this.pageButtonInputs) {
      input.checked = input.value === this.settings.pageButtons;
    }
    for (const input of this.fullscreenStatusInputs) {
      input.checked = input.value === this.settings.fullscreenStatus;
    }
    for (const input of this.footnoteModeInputs) input.checked = input.value === this.settings.footnoteMode;
    this.fontDownButton.disabled = this.settings.fontSize <= 14;
    this.fontUpButton.disabled = this.settings.fontSize >= 28;
    this.analyticsToggle.checked = this.settings.readingAnalytics;
  }

  private saveSettings<Key extends keyof ReaderSettings>(key: Key): void {
    this.settingsStorage.write(this.settings);
    void this.library.updateSetting(key, this.settings[key]);
  }

  private setInterfaceLanguage(language: Language): void {
    if (language === this.settings.language) return;
    this.settings.language = language;
    this.saveSettings('language');
    this.applyLanguage();
  }

  private applyLanguage(): void {
    activateLanguage(this.settings.language);
    applyDocumentTranslations();
    this.languageSelect.value = this.settings.language;
    this.annotationPanelController?.refreshLanguage();
    this.quoteMenuController?.refreshLanguage();
    if (this.currentBookTitle) {
      this.title.textContent = this.currentBookTitle;
      document.title = `${this.currentBookTitle} — ${t('app.name')}`;
    } else {
      this.title.textContent = t('app.openingLibrary');
      document.title = t('app.name');
    }
    if (this.isPreparing && !this.status.classList.contains('is-error')) {
      this.statusMessage.textContent = t(this.loadingMessage.key, this.loadingMessage.parameters);
    }
    if (!this.isPreparing) this.renderProgress(this.pager.getSnapshot());
    this.renderSyncDisplay();
    if (this.settingsPanelController?.opened) void this.renderAnalytics();
    for (const event of this.providerStatuses.values()) this.updateProviderStatus(event);
    this.showMissingSyncConfiguration();
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
        this.showToast(t('error.quoteLocation'));
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
    const target = event.target instanceof HTMLElement ? event.target : null;
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
      this.analyticsTracker.setPaused(true);
      void this.renderAnalytics();
    } else {
      this.analyticsTracker.setPaused(false);
    }
    this.syncHeaderPin();
  }

  private handleTocOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.settingsPanelController.close(false);
      this.annotationPanelController.close(false);
    }
    this.analyticsTracker.setPaused(isOpen);
    this.syncHeaderPin();
  }

  private handleAnnotationsOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.settingsPanelController.close(false);
      this.tocPanelController.close(false);
      this.quoteMenuController.close();
    }
    this.analyticsTracker.setPaused(isOpen);
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
      this.showToast(t('error.currentLocation'));
      return;
    }
    await this.library.addBookmark(fingerprint, snapshot.anchor, {
      chapter: this.currentChapter(),
      progress: snapshot.progress,
      note,
      color,
    });
    await this.refreshAnnotations();
    this.showToast(t('toast.bookmarkSaved'));
  }

  private goToBookmark(record: BookmarkRecord): void {
    if (!this.pager.goToAnchor(record.anchor, true)) this.showToast(t('error.bookmarkLocation'));
  }

  private goToQuote(record: QuoteRecord): void {
    if (!this.pager.goToTextOffset(record.start.anchor, record.start.offset, true)) {
      this.showToast(t('error.quoteLocation'));
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
    this.showToast(t('toast.changesSaved'));
  }

  private async deleteAnnotation(record: BookmarkRecord | QuoteRecord): Promise<void> {
    if (record.kind === 'quote') await this.library.deleteQuote(record.id);
    else await this.library.deleteBookmark(record.id);
    await this.refreshAnnotations();
    this.applyCurrentHighlights();
    this.showToast(t(record.kind === 'quote' ? 'toast.quoteDeleted' : 'toast.bookmarkDeleted'));
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
    this.showToast(t('toast.quoteSaved'));
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
        this.syncDisplay = { type: 'started' };
      } else if (event.type === 'completed' && event.lastSyncAt) {
        this.syncDisplay = { type: 'completed', value: event.lastSyncAt };
      } else if (event.type === 'error') {
        this.syncDisplay = { type: 'error', value: event.message };
      }
      this.renderSyncDisplay();
    });
    this.googleConnect.addEventListener('click', () => void this.toggleProvider(this.googleProvider));
    this.yandexConnect.addEventListener('click', () => void this.toggleProvider(this.yandexProvider));
    this.syncNowButton.addEventListener('click', () => void this.syncEngine.syncNow());
    const lastSync = localStorage.getItem('chitalka:sync:last');
    if (lastSync) {
      this.syncDisplay = { type: 'completed', value: lastSync };
      this.renderSyncDisplay();
    }
    this.showMissingSyncConfiguration();
  }

  private showMissingSyncConfiguration(): void {
    if (!this.googleSyncConfigured) {
      this.googleSyncStatus.textContent = t('sync.clientIdRequired');
      this.googleConnect.disabled = true;
      this.googleConnect.title = t('sync.clientIdBuild', { variable: 'VITE_GOOGLE_CLIENT_ID' });
    }
    if (!this.yandexSyncConfigured) {
      this.yandexSyncStatus.textContent = t('sync.clientIdRequired');
      this.yandexConnect.disabled = true;
      this.yandexConnect.title = t('sync.clientIdBuild', { variable: 'VITE_YANDEX_CLIENT_ID' });
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
      this.showToast(error instanceof Error ? error.message : t('error.cloudConnect'));
    }
  }

  private updateProviderStatus(event: ProviderStatusEvent): void {
    this.providerStatuses.set(event.provider, event);
    const label = event.provider === 'google' ? this.googleSyncStatus : this.yandexSyncStatus;
    const button = event.provider === 'google' ? this.googleConnect : this.yandexConnect;
    const providerName = event.provider === 'google' ? 'Google Drive' : t('sync.yandex');
    const statuses: Record<ProviderStatusEvent['status'], string> = {
      disconnected: t('sync.notConnected'),
      connecting: t('sync.connecting'),
      connected: t('sync.connected'),
      syncing: t('sync.syncing'),
      reconnect: t('sync.needsReconnect'),
      error: event.message || t('sync.error'),
    };
    label.textContent = statuses[event.status];
    const connected = event.status === 'connected' || event.status === 'syncing';
    const action = t(connected
      ? 'sync.disconnect'
      : event.status === 'reconnect' ? 'sync.reconnect' : 'sync.connect');
    button.textContent = action;
    button.setAttribute('aria-label', `${action} ${providerName}`);
    button.title = `${action} ${providerName}`;
    button.disabled = event.status === 'connecting' || event.status === 'syncing';
    if (
      (event.provider === 'google' && !this.googleSyncConfigured)
      || (event.provider === 'yandex' && !this.yandexSyncConfigured)
    ) {
      label.textContent = t('sync.clientIdRequired');
      button.disabled = true;
    }
    this.syncNowButton.disabled = ![this.googleProvider, this.yandexProvider]
      .some((candidate) => candidate.status === 'connected');
  }

  private renderSyncDisplay(): void {
    switch (this.syncDisplay.type) {
      case 'started':
        this.syncLastTime.textContent = t('sync.syncing');
        break;
      case 'completed':
        this.syncLastTime.textContent = t('sync.last', {
          time: this.formatSyncTime(this.syncDisplay.value ?? ''),
        });
        break;
      case 'error':
        this.syncLastTime.textContent = this.syncDisplay.value || t('sync.errorGeneric');
        break;
      default:
        this.syncLastTime.textContent = t('sync.never');
    }
  }

  private formatSyncTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? t('sync.unknownTime')
      : date.toLocaleString(getLanguage() === 'ru' ? 'ru-RU' : 'en-US');
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toastMotion.show();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastMotion.hide();
    }, 5000);
  }

  private readonly handleColorSchemeChange = (): void => {
    if (this.settings.theme === 'auto') this.applyTheme();
  };
}
