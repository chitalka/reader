import { decodeBookFile, decodeBookUrl, type DecodedBookSource } from './fb2/decode';
import type { BookTocItem } from './book/model';
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
  private readonly viewport = requiredElement<HTMLElement>('book-viewport');
  private readonly content = requiredElement<HTMLElement>('book-content');
  private readonly pager = new ReaderPager(
    this.viewport,
    this.content,
    (snapshot) => this.onPageChanged(snapshot),
  );
  private currentBookFilename?: string;
  private currentWordCount = 0;
  private currentTocTargets: string[] = [];
  private backAnchor?: string;
  private isPreparing = true;
  private dragDepth = 0;
  private savePositionTimer?: number;
  private toastTimer?: number;

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
  }

  async start(): Promise<void> {
    this.applySettings();
    this.bindEvents();
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

    this.content.addEventListener('click', (event) => this.handleBookLink(event));
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
    bindMouseReadingClick(this.viewport, () => this.headerVisibility.toggle());
    bindTouchTap(this.viewport, () => this.headerVisibility.toggle());
    bindTouchSwipe(this.viewport, (distance) => {
      if (distance < 0) this.navigate(() => this.pager.next());
      else this.navigateBackward();
    });

    for (const eventName of ['dragenter', 'dragover']) {
      this.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (eventName === 'dragenter') this.dragDepth += 1;
        this.dropOverlay.hidden = false;
      });
    }
    this.dropZone.addEventListener('dragleave', (event) => {
      event.preventDefault();
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) this.dropOverlay.hidden = true;
    });
    this.dropZone.addEventListener('drop', (event) => {
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
    this.currentWordCount = rendered.wordCount;
    this.currentTocTargets = tocTargets(rendered.toc);
    this.tocPanelController.setItems(rendered.toc);
    this.backAnchor = undefined;
    this.backButton.hidden = true;
    this.title.textContent = rendered.metadata.title;
    this.author.textContent = rendered.metadata.authors.join(', ');
    document.title = `${rendered.metadata.title} — Читалка`;

    const savedPosition = positionStorage(source.filename).read();
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
    this.tocPanelController.setItems([]);
    this.isPreparing = true;
    this.currentBookFilename = undefined;
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

    if (this.currentBookFilename && !this.isPreparing) {
      if (this.savePositionTimer) window.clearTimeout(this.savePositionTimer);
      this.savePositionTimer = window.setTimeout(() => {
        if (!this.currentBookFilename || this.isPreparing) return;
        positionStorage(this.currentBookFilename).write({
          anchor: snapshot.anchorVisible ? snapshot.anchor : undefined,
          column: snapshot.currentPage - 1,
          chunk: snapshot.chunkIndex,
          chunkColumn: snapshot.chunkPage - 1,
        });
      }, 250);
    }
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
    this.saveSettings();
    this.pager.setFontSize(nextSize);
    this.updateSettingsControls();
  }

  private setPageMode(mode: PageMode): void {
    if (mode === this.settings.pageMode) return;
    this.settings.pageMode = mode;
    this.saveSettings();
    this.pager.setPageMode(this.settings.pageMode);
    this.updateSettingsControls();
  }

  private setPageButtons(mode: PageButtonsMode): void {
    if (mode === this.settings.pageButtons) return;
    this.settings.pageButtons = mode;
    document.documentElement.dataset.pageButtons = mode;
    this.saveSettings();
    this.updateSettingsControls();
  }

  private setFootnoteMode(mode: FootnoteMode): void {
    if (mode === this.settings.footnoteMode) return;
    this.settings.footnoteMode = mode;
    if (mode === 'inline') this.clearFootnoteReturn();
    this.content.querySelector<HTMLElement>('.book')
      ?.setAttribute('data-footnotes', this.settings.footnoteMode);
    this.saveSettings();
    this.updateSettingsControls();
    this.pager.relayout();
  }

  private setTheme(theme: Theme): void {
    if (theme === this.settings.theme) return;
    this.settings.theme = theme;
    document.documentElement.dataset.theme = this.settings.theme;
    this.saveSettings();
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

  private saveSettings(): void {
    this.settingsStorage.write(this.settings);
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
    if (isOpen) this.tocPanelController.close(false);
    this.syncHeaderPin();
  }

  private handleTocOpenChange(isOpen: boolean): void {
    if (isOpen) this.settingsPanelController.close(false);
    this.syncHeaderPin();
  }

  private syncHeaderPin(): void {
    this.headerVisibility.setPinned(
      this.settingsPanelController.opened || this.tocPanelController.opened,
    );
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
