import type { BookTocItem } from './book/model';
import { setMotionOrigin, VisibilityMotion } from './motion';

export interface TocPanelElements {
  button: HTMLButtonElement;
  panel: HTMLElement;
  backdrop: HTMLElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
}

const MOBILE_TOC_QUERY = '(max-width: 640px)';

export class TocPanelController {
  private isOpen = false;
  private readonly panelMotion: VisibilityMotion;
  private readonly backdropMotion: VisibilityMotion;
  private readonly mobileQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_TOC_QUERY)
    : undefined;

  constructor(
    private readonly elements: TocPanelElements,
    private readonly onSelect: (target: string) => void,
    private readonly onOpenChange: (isOpen: boolean) => void = () => undefined,
  ) {
    this.panelMotion = new VisibilityMotion(elements.panel);
    this.backdropMotion = new VisibilityMotion(elements.backdrop);
    elements.button.addEventListener('click', this.handleToggle);
    elements.closeButton.addEventListener('click', this.handleClose);
    elements.backdrop.addEventListener('click', this.handleBackdropClick);
    elements.list.addEventListener('click', this.handleListClick);
    document.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('keydown', this.handleKeydown);
    this.mobileQuery?.addEventListener('change', this.handleMediaChange);
    this.syncMode();
  }

  get opened(): boolean {
    return this.isOpen;
  }

  destroy(): void {
    this.elements.button.removeEventListener('click', this.handleToggle);
    this.elements.closeButton.removeEventListener('click', this.handleClose);
    this.elements.backdrop.removeEventListener('click', this.handleBackdropClick);
    this.elements.list.removeEventListener('click', this.handleListClick);
    document.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('keydown', this.handleKeydown);
    this.mobileQuery?.removeEventListener('change', this.handleMediaChange);
    this.panelMotion.destroy();
    this.backdropMotion.destroy();
  }

  setItems(items: BookTocItem[]): void {
    this.close(false);
    this.elements.list.replaceChildren(...this.renderItems(items));
    this.elements.button.hidden = items.length === 0;
  }

  setActive(target: string | undefined): void {
    const active = Array.from(
      this.elements.list.querySelectorAll<HTMLButtonElement>('[data-toc-target]'),
    ).filter((button) => button.dataset.tocTarget === target).at(-1);
    for (const button of this.elements.list.querySelectorAll<HTMLButtonElement>('[aria-current]')) {
      button.removeAttribute('aria-current');
    }
    active?.setAttribute('aria-current', 'location');
  }

  open(): void {
    if (this.isOpen || this.elements.button.hidden) return;
    this.isOpen = true;
    this.panelMotion.show(() => setMotionOrigin(this.elements.panel, this.elements.button));
    this.elements.button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('toc-open');
    this.syncMode();
    this.onOpenChange(true);
    const active = this.elements.list.querySelector<HTMLElement>('[aria-current="location"]');
    (active ?? this.elements.closeButton).focus();
    active?.scrollIntoView?.({ block: 'nearest' });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panelMotion.hide();
    this.backdropMotion.hide();
    this.elements.button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('toc-open');
    this.onOpenChange(false);
    if (restoreFocus) this.elements.button.focus();
  }

  private renderItems(items: BookTocItem[]): HTMLOListElement[] {
    if (!items.length) return [];
    const list = document.createElement('ol');
    list.className = 'toc-list';
    for (const item of items) {
      const listItem = document.createElement('li');
      if (item.target) {
        const button = document.createElement('button');
        button.className = 'toc-link';
        button.type = 'button';
        button.dataset.tocTarget = item.target;
        button.textContent = item.title;
        button.title = item.title;
        listItem.append(button);
      } else {
        const label = document.createElement('span');
        label.className = 'toc-label';
        label.textContent = item.title;
        listItem.append(label);
      }
      listItem.append(...this.renderItems(item.children));
      list.append(listItem);
    }
    return [list];
  }

  private readonly handleToggle = (): void => {
    if (this.isOpen) this.close();
    else this.open();
  };

  private readonly handleClose = (): void => {
    this.close();
  };

  private readonly handleBackdropClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };

  private readonly handleListClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-toc-target]');
    const target = button?.dataset.tocTarget;
    if (!button || !target || !this.elements.list.contains(button)) return;
    this.onSelect(target);
    this.close();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isOpen || !(event.target instanceof Node)) return;
    if (event.target instanceof Element && event.target.closest('[data-language-switcher]')) return;
    if (event.target === this.elements.backdrop) return;
    if (this.elements.panel.contains(event.target) || this.elements.button.contains(event.target)) return;
    this.close(false);
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(this.elements.panel.querySelectorAll<HTMLElement>(
      'button:not([disabled])',
    ));
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

  private readonly handleMediaChange = (): void => {
    this.syncMode();
  };

  private syncMode(): void {
    const isMobile = this.mobileQuery?.matches ?? false;
    if (isMobile) this.elements.panel.setAttribute('aria-modal', 'true');
    else this.elements.panel.removeAttribute('aria-modal');
    if (this.isOpen && isMobile) this.backdropMotion.show();
    else this.backdropMotion.hide();
  }
}
