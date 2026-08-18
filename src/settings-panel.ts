import { setMotionOrigin, VisibilityMotion } from './motion';

export interface SettingsPanelElements {
  button: HTMLButtonElement;
  panel: HTMLElement;
  backdrop: HTMLElement;
  closeButton: HTMLButtonElement;
}

const MOBILE_SETTINGS_QUERY = '(max-width: 640px)';

export class SettingsPanelController {
  private isOpen = false;
  private readonly panelMotion: VisibilityMotion;
  private readonly backdropMotion: VisibilityMotion;
  private readonly mobileQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_SETTINGS_QUERY)
    : undefined;

  constructor(
    private readonly elements: SettingsPanelElements,
    private readonly onOpenChange: (isOpen: boolean) => void = () => undefined,
  ) {
    this.panelMotion = new VisibilityMotion(elements.panel);
    this.backdropMotion = new VisibilityMotion(elements.backdrop);
    elements.button.addEventListener('click', this.handleToggle);
    elements.closeButton.addEventListener('click', this.handleClose);
    elements.backdrop.addEventListener('click', this.handleBackdropClick);
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
    document.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('keydown', this.handleKeydown);
    this.mobileQuery?.removeEventListener('change', this.handleMediaChange);
    this.panelMotion.destroy();
    this.backdropMotion.destroy();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panelMotion.show(() => setMotionOrigin(this.elements.panel, this.elements.button));
    this.elements.button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('settings-open');
    this.syncMode();
    this.onOpenChange(true);
    this.elements.closeButton.focus();
  }

  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panelMotion.hide();
    this.backdropMotion.hide();
    this.elements.button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('settings-open');
    this.onOpenChange(false);
    if (restoreFocus) this.elements.button.focus();
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
      'button:not([disabled]), input:checked:not([disabled])',
    ));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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
