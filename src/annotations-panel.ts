import { QuotePreviewHighlight, type LocatedSelection } from './reader/quotes';
import {
  ANNOTATION_COLORS,
  type AnnotationColor,
  type BookmarkRecord,
  type QuoteRecord,
} from './reader/state';

type AnnotationRecord = BookmarkRecord | QuoteRecord;

export interface AnnotationPanelElements {
  button: HTMLButtonElement;
  panel: HTMLElement;
  backdrop: HTMLElement;
  closeButton: HTMLButtonElement;
  bookmarksTab: HTMLButtonElement;
  quotesTab: HTMLButtonElement;
  bookmarksView: HTMLElement;
  quotesView: HTMLElement;
  addBookmarkButton: HTMLButtonElement;
  bookmarksList: HTMLElement;
  quotesList: HTMLElement;
  editor: HTMLFormElement;
  editorTitle: HTMLElement;
  editorColors: HTMLElement;
  editorNote: HTMLTextAreaElement;
  editorDelete: HTMLButtonElement;
  editorCancel: HTMLButtonElement;
}

export interface AnnotationPanelActions {
  createBookmark(note: string, color: AnnotationColor): Promise<void> | void;
  navigateBookmark(record: BookmarkRecord): void;
  navigateQuote(record: QuoteRecord): void;
  update(record: AnnotationRecord, note: string, color: AnnotationColor): Promise<void> | void;
  delete(record: AnnotationRecord): Promise<void> | void;
  openChange(isOpen: boolean): void;
}

function colorLabel(color: AnnotationColor): string {
  const labels: Record<AnnotationColor, string> = {
    purple: 'Фиолетовый',
    blue: 'Синий',
    green: 'Зелёный',
    yellow: 'Жёлтый',
    orange: 'Оранжевый',
    pink: 'Розовый',
  };
  return labels[color];
}

export class ColorPicker {
  private value: AnnotationColor = 'purple';

  constructor(
    private readonly root: HTMLElement,
    private readonly onChange?: (color: AnnotationColor) => void,
  ) {
    root.replaceChildren(...ANNOTATION_COLORS.map((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'annotation-color';
      button.dataset.color = color;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', colorLabel(color));
      button.addEventListener('click', () => this.set(color));
      return button;
    }));
    this.set('purple');
  }

  get selected(): AnnotationColor {
    return this.value;
  }

  set(color: AnnotationColor): void {
    this.value = color;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-color]')) {
      const selected = button.dataset.color === color;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    this.onChange?.(color);
  }
}

export class AnnotationPanelController {
  private isOpen = false;
  private bookmarks: BookmarkRecord[] = [];
  private quotes: QuoteRecord[] = [];
  private currentBookmark?: BookmarkRecord;
  private editing?: AnnotationRecord | 'new-bookmark';
  private readonly colors: ColorPicker;
  private readonly mobileQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)')
    : undefined;

  constructor(
    private readonly elements: AnnotationPanelElements,
    private readonly actions: AnnotationPanelActions,
  ) {
    this.colors = new ColorPicker(elements.editorColors);
    elements.button.addEventListener('click', this.handleToggle);
    elements.closeButton.addEventListener('click', this.handleClose);
    elements.backdrop.addEventListener('click', this.handleBackdrop);
    elements.bookmarksTab.addEventListener('click', () => this.selectTab('bookmarks'));
    elements.quotesTab.addEventListener('click', () => this.selectTab('quotes'));
    elements.addBookmarkButton.addEventListener('click', () => {
      this.openEditor(this.currentBookmark ?? 'new-bookmark');
    });
    elements.bookmarksList.addEventListener('click', this.handleListClick);
    elements.quotesList.addEventListener('click', this.handleListClick);
    elements.editor.addEventListener('submit', this.handleEditorSubmit);
    elements.editorCancel.addEventListener('click', () => this.closeEditor());
    elements.editorDelete.addEventListener('click', this.handleEditorDelete);
    document.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('keydown', this.handleKeydown);
    this.mobileQuery?.addEventListener('change', this.syncMode);
    this.render();
    this.syncMode();
  }

  get opened(): boolean {
    return this.isOpen;
  }

  setRecords(bookmarks: BookmarkRecord[], quotes: QuoteRecord[], hasBook: boolean): void {
    this.bookmarks = bookmarks;
    this.quotes = quotes;
    this.elements.button.hidden = !hasBook;
    this.render();
  }

  setCurrentBookmark(record: BookmarkRecord | undefined): void {
    this.currentBookmark = record;
    this.elements.addBookmarkButton.textContent = record
      ? 'Закладка в этом месте сохранена'
      : 'Добавить текущее место';
  }

  edit(record: AnnotationRecord): void {
    this.open(record.kind === 'quote' ? 'quotes' : 'bookmarks');
    this.openEditor(record);
  }

  open(tab: 'bookmarks' | 'quotes' = 'bookmarks'): void {
    if (this.isOpen || this.elements.button.hidden) return;
    this.isOpen = true;
    this.elements.panel.hidden = false;
    this.elements.button.setAttribute('aria-expanded', 'true');
    this.selectTab(tab);
    this.syncMode();
    this.actions.openChange(true);
    (tab === 'bookmarks' ? this.elements.bookmarksTab : this.elements.quotesTab).focus();
  }

  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    this.closeEditor();
    this.isOpen = false;
    this.elements.panel.hidden = true;
    this.elements.backdrop.hidden = true;
    this.elements.button.setAttribute('aria-expanded', 'false');
    this.actions.openChange(false);
    if (restoreFocus) this.elements.button.focus();
  }

  private selectTab(tab: 'bookmarks' | 'quotes'): void {
    const bookmarks = tab === 'bookmarks';
    this.elements.bookmarksTab.setAttribute('aria-selected', String(bookmarks));
    this.elements.quotesTab.setAttribute('aria-selected', String(!bookmarks));
    this.elements.bookmarksTab.tabIndex = bookmarks ? 0 : -1;
    this.elements.quotesTab.tabIndex = bookmarks ? -1 : 0;
    this.elements.bookmarksView.hidden = !bookmarks;
    this.elements.quotesView.hidden = bookmarks;
  }

  private render(): void {
    this.elements.bookmarksList.replaceChildren(...this.cards(this.bookmarks));
    this.elements.quotesList.replaceChildren(...this.cards(this.quotes));
    if (!this.bookmarks.length) this.elements.bookmarksList.append(this.empty('Закладок пока нет'));
    if (!this.quotes.length) this.elements.quotesList.append(this.empty('Цитат пока нет'));
  }

  private cards(records: AnnotationRecord[]): HTMLElement[] {
    return records.map((record) => {
      const card = document.createElement('article');
      card.className = 'annotation-card';
      card.dataset.annotationId = record.id;
      card.dataset.annotationKind = record.kind;
      card.dataset.color = record.color;

      const color = document.createElement('span');
      color.className = 'annotation-card-color';
      color.setAttribute('aria-hidden', 'true');

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'annotation-card-main';
      main.dataset.annotationAction = 'navigate';
      const title = document.createElement('strong');
      title.textContent = record.kind === 'quote'
        ? record.exact.replace(/\s+/gu, ' ').trim()
        : record.chapter || `Позиция ${Math.max(1, Math.round(record.progress))}%`;
      const details = document.createElement('span');
      details.textContent = [
        record.kind === 'quote' ? record.chapter : undefined,
        record.note || undefined,
        `${Math.max(0, Math.min(100, Math.round(record.progress)))}%`,
      ].filter(Boolean).join(' · ');
      main.append(title, details);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'annotation-card-edit';
      edit.dataset.annotationAction = 'edit';
      edit.setAttribute('aria-label', 'Редактировать');
      edit.textContent = '•••';
      card.append(color, main, edit);
      return card;
    });
  }

  private empty(message: string): HTMLElement {
    const element = document.createElement('p');
    element.className = 'annotation-empty';
    element.textContent = message;
    return element;
  }

  private recordFrom(element: Element): AnnotationRecord | undefined {
    const card = element.closest<HTMLElement>('[data-annotation-id]');
    const id = card?.dataset.annotationId;
    if (!id) return undefined;
    return card.dataset.annotationKind === 'quote'
      ? this.quotes.find((record) => record.id === id)
      : this.bookmarks.find((record) => record.id === id);
  }

  private openEditor(record: AnnotationRecord | 'new-bookmark'): void {
    this.editing = record;
    this.elements.editorTitle.textContent = record === 'new-bookmark'
      ? 'Новая закладка'
      : record.kind === 'quote' ? 'Редактировать цитату' : 'Редактировать закладку';
    this.elements.editorNote.value = record === 'new-bookmark' ? '' : record.note;
    this.colors.set(record === 'new-bookmark' ? 'purple' : record.color);
    this.elements.editorDelete.hidden = record === 'new-bookmark';
    this.elements.editor.hidden = false;
    this.elements.editorNote.focus();
  }

  private closeEditor(): void {
    this.editing = undefined;
    this.elements.editor.hidden = true;
  }

  private readonly handleToggle = (): void => this.isOpen ? this.close() : this.open();
  private readonly handleClose = (): void => this.close();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    event.preventDefault();
    this.close();
  };

  private readonly handleListClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target) return;
    const record = this.recordFrom(target);
    if (!record) return;
    const action = target.closest<HTMLElement>('[data-annotation-action]')?.dataset.annotationAction;
    if (action === 'edit') {
      this.openEditor(record);
      return;
    }
    if (action === 'navigate') {
      if (record.kind === 'quote') this.actions.navigateQuote(record);
      else this.actions.navigateBookmark(record);
      this.close();
    }
  };

  private readonly handleEditorSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const editing = this.editing;
    if (!editing) return;
    const operation = editing === 'new-bookmark'
      ? this.actions.createBookmark(this.elements.editorNote.value, this.colors.selected)
      : this.actions.update(editing, this.elements.editorNote.value, this.colors.selected);
    void Promise.resolve(operation).then(() => this.closeEditor());
  };

  private readonly handleEditorDelete = (): void => {
    if (!this.editing || this.editing === 'new-bookmark') return;
    void Promise.resolve(this.actions.delete(this.editing)).then(() => this.closeEditor());
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isOpen || !(event.target instanceof Node)) return;
    if (this.elements.panel.contains(event.target) || this.elements.button.contains(event.target)) return;
    if (event.target === this.elements.backdrop) return;
    this.close(false);
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.elements.editor.hidden) this.closeEditor();
      else this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(this.elements.panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden])',
    )).filter((element) => element.offsetParent !== null || element === document.activeElement);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private readonly syncMode = (): void => {
    const mobile = this.mobileQuery?.matches ?? false;
    if (mobile) this.elements.panel.setAttribute('aria-modal', 'true');
    else this.elements.panel.removeAttribute('aria-modal');
    this.elements.backdrop.hidden = !this.isOpen || !mobile;
  };
}

export interface QuoteMenuElements {
  form: HTMLFormElement;
  selectionRoot: HTMLElement;
  closeButton: HTMLButtonElement;
  preview: HTMLElement;
  colors: HTMLElement;
  note: HTMLTextAreaElement;
  saveButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
}

export class QuoteMenuController {
  private selection?: LocatedSelection;
  private existing?: QuoteRecord;
  private readonly colors: ColorPicker;
  private readonly previewHighlight: QuotePreviewHighlight;

  constructor(
    private readonly elements: QuoteMenuElements,
    private readonly onSave: (
      selection: LocatedSelection,
      note: string,
      color: AnnotationColor,
    ) => Promise<void> | void,
    private readonly onDelete: (quote: QuoteRecord) => Promise<void> | void,
  ) {
    this.previewHighlight = new QuotePreviewHighlight(elements.selectionRoot);
    this.colors = new ColorPicker(elements.colors, (color) => {
      elements.selectionRoot.dataset.quoteSelectionColor = color;
      this.previewHighlight.setColor(color);
    });
    elements.form.addEventListener('submit', this.handleSubmit);
    elements.closeButton.addEventListener('click', () => this.close());
    elements.deleteButton.addEventListener('click', this.handleDelete);
    document.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.opened) this.close();
    });
    document.addEventListener('selectionchange', () => {
      if (!this.opened && document.getSelection()?.isCollapsed) {
        delete this.elements.selectionRoot.dataset.quoteSelectionColor;
      }
    });
  }

  get opened(): boolean {
    return !this.elements.form.hidden;
  }

  open(selection: LocatedSelection, existing?: QuoteRecord): void {
    this.selection = selection;
    this.existing = existing;
    this.elements.preview.textContent = selection.exact.replace(/\s+/gu, ' ').trim();
    this.elements.note.value = existing?.note ?? '';
    this.colors.set(existing?.color ?? 'purple');
    this.elements.saveButton.textContent = existing ? 'Сохранить изменения' : 'Сохранить цитату';
    this.elements.deleteButton.hidden = !existing;
    this.elements.form.hidden = false;
    this.position(selection.range);
    this.previewHighlight.show(selection.range, this.colors.selected);
  }

  close(): void {
    this.previewHighlight.clear();
    this.elements.form.hidden = true;
    this.selection = undefined;
    this.existing = undefined;
    document.getSelection()?.removeAllRanges();
    delete this.elements.selectionRoot.dataset.quoteSelectionColor;
  }

  private position(range: Range): void {
    const rects = Array.from(range.getClientRects());
    const rect = rects.at(-1) ?? range.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
    const desiredTop = rect.bottom + 10;
    const estimatedHeight = 300;
    const top = desiredTop + estimatedHeight < window.innerHeight
      ? desiredTop
      : Math.max(12, rect.top - estimatedHeight - 10);
    this.elements.form.style.left = `${left}px`;
    this.elements.form.style.top = `${top}px`;
  }

  private readonly handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!this.selection) return;
    void Promise.resolve(this.onSave(
      this.selection,
      this.elements.note.value,
      this.colors.selected,
    )).then(() => this.close());
  };

  private readonly handleDelete = (): void => {
    if (!this.existing) return;
    void Promise.resolve(this.onDelete(this.existing)).then(() => this.close());
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.opened || !(event.target instanceof Node)) return;
    if (this.elements.form.contains(event.target)) return;
    if ((event.target as Element).closest?.('[data-reader-quote]')) return;
    this.close();
  };
}
