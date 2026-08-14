import { decodeBookFile, decodeBookUrl, type DecodedBookSource } from './fb2/decode';
import { parseFb2 } from './fb2/parse';
import { renderFb2 } from './fb2/render';
import { ReaderPager, type PagerSnapshot, type PageMode } from './reader/pager';
import { JsonStorage, positionStorage } from './reader/storage';
import { SettingsPanelController } from './settings-panel';
import {
  DEFAULT_SETTINGS,
  type FootnoteMode,
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
  private backAnchor?: string;
  private isPreparing = true;
  private pointerStartX?: number;
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
  private readonly progress = requiredElement<HTMLProgressElement>('book-progress');
  private readonly pageLabel = requiredElement<HTMLElement>('page-label');
  private readonly timeLabel = requiredElement<HTMLElement>('time-label');
  private readonly fontDownButton = requiredElement<HTMLButtonElement>('font-down');
  private readonly fontUpButton = requiredElement<HTMLButtonElement>('font-up');
  private readonly fontSizeValue = requiredElement<HTMLOutputElement>('font-size-value');
  private readonly settingsButton = requiredElement<HTMLButtonElement>('settings-button');
  private readonly settingsPanel = requiredElement<HTMLElement>('settings-panel');
  private readonly settingsBackdrop = requiredElement<HTMLElement>('settings-backdrop');
  private readonly settingsCloseButton = requiredElement<HTMLButtonElement>('settings-close');
  private readonly themeInputs = requiredInputs('theme');
  private readonly pageModeInputs = requiredInputs('page-mode');
  private readonly footnoteModeInputs = requiredInputs('footnote-mode');
  private readonly backButton = requiredElement<HTMLButtonElement>('back-to-text');
  private readonly toast = requiredElement<HTMLElement>('toast');
  private readonly settingsPanelController = new SettingsPanelController({
    button: this.settingsButton,
    panel: this.settingsPanel,
    backdrop: this.settingsBackdrop,
    closeButton: this.settingsCloseButton,
  });

  async start(): Promise<void> {
    this.applySettings();
    this.bindEvents();

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
    this.updateSettingsControls();
  }

  private bindEvents(): void {
    this.previousButton.addEventListener('click', () => this.pager.previous());
    this.nextButton.addEventListener('click', () => this.pager.next());
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

    this.viewport.addEventListener('pointerdown', (event) => {
      if (event.isPrimary) this.pointerStartX = event.clientX;
    });
    this.viewport.addEventListener('pointerup', (event) => {
      if (this.pointerStartX === undefined || !event.isPrimary) return;
      const distance = event.clientX - this.pointerStartX;
      this.pointerStartX = undefined;
      if (Math.abs(distance) < 48) return;
      if (distance < 0) this.pager.next();
      else this.pager.previous();
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
    const parsed = parseFb2(source.xml);
    const rendered = renderFb2(parsed);
    const bookRoot = rendered.fragment.querySelector<HTMLElement>('.book');
    bookRoot?.setAttribute('data-footnotes', this.settings.footnoteMode);

    this.currentBookFilename = source.filename;
    this.currentWordCount = rendered.wordCount;
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
  }

  private setLoading(message: string): void {
    this.settingsPanelController.close(false);
    this.isPreparing = true;
    this.currentBookFilename = undefined;
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
  }

  private onPageChanged(snapshot: PagerSnapshot): void {
    const lastPage = Math.min(snapshot.totalPages, snapshot.currentPage + snapshot.pagesPerView - 1);
    this.pageLabel.textContent = lastPage > snapshot.currentPage
      ? `Страницы ${snapshot.currentPage}–${lastPage} из ${snapshot.totalPages}`
      : `Страница ${snapshot.currentPage} из ${snapshot.totalPages}`;

    this.progress.value = snapshot.progress;
    this.progress.textContent = `${Math.round(snapshot.progress)}%`;
    this.previousButton.disabled = this.pager.isFirst();
    this.nextButton.disabled = this.pager.isLast();
    this.updateTimeEstimate(snapshot.progress);

    if (this.currentBookFilename && !this.isPreparing) {
      if (this.savePositionTimer) window.clearTimeout(this.savePositionTimer);
      this.savePositionTimer = window.setTimeout(() => {
        if (!this.currentBookFilename || this.isPreparing) return;
        positionStorage(this.currentBookFilename).write({
          anchor: snapshot.anchorVisible ? snapshot.anchor : undefined,
          column: snapshot.currentPage - 1,
        });
      }, 250);
    }
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

  private setFootnoteMode(mode: FootnoteMode): void {
    if (mode === this.settings.footnoteMode) return;
    this.settings.footnoteMode = mode;
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

    if (this.settings.footnoteMode === 'inline') return;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = document.getElementById(id);
    if (!target || !this.content.contains(target)) return;

    this.backAnchor = this.pager.getSnapshot().anchor;
    this.pager.goToElement(target);
    this.backButton.hidden = !this.backAnchor;
  }

  private returnFromFootnote(): void {
    if (!this.backAnchor) return;
    const target = Array.from(
      this.content.querySelectorAll<HTMLElement>('[data-reader-anchor]'),
    ).find((candidate) => candidate.dataset.readerAnchor === this.backAnchor);
    if (target) this.pager.goToElement(target);
    this.backAnchor = undefined;
    this.backButton.hidden = true;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!this.settingsPanel.hidden && target && this.settingsPanel.contains(target)) return;
    if (target?.matches('input, textarea, select') || event.altKey || event.ctrlKey) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        this.pager.next();
        event.preventDefault();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        this.pager.previous();
        event.preventDefault();
        break;
      case 'Home':
        this.pager.first();
        event.preventDefault();
        break;
      case 'End':
        this.pager.last();
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

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, 5000);
  }
}
