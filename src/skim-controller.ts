import { t } from './i18n';
import { type PagerSnapshot, ReaderPager, type SkimTarget } from './reader/pager';

export interface SkimElements {
  group: HTMLElement;
  input: HTMLInputElement;
  popover: HTMLElement;
  chapter: HTMLElement;
  page: HTMLElement;
  preview: HTMLElement;
  hint: HTMLElement;
}

export interface SkimActions {
  chapterForAnchor(anchor: string | undefined): string;
  committed(): void;
}

type SkimMode = 'idle' | 'hover' | 'drag' | 'keyboard';

export class SkimController {
  private mode: SkimMode = 'idle';
  private committedPage = 1;
  private target?: SkimTarget;
  private pointerId?: number;
  private renderFrame?: number;

  constructor(
    private readonly elements: SkimElements,
    private readonly pager: ReaderPager,
    private readonly actions: SkimActions,
  ) {
    const { input } = elements;
    input.addEventListener('pointerenter', this.handlePointerEnter);
    input.addEventListener('pointermove', this.handlePointerMove);
    input.addEventListener('pointerleave', this.handlePointerLeave);
    input.addEventListener('pointerdown', this.handlePointerDown);
    input.addEventListener('pointerup', this.handlePointerUp);
    input.addEventListener('pointercancel', this.handlePointerCancel);
    input.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    input.addEventListener('input', this.handleInput);
    input.addEventListener('keydown', this.handleKeydown);
    input.addEventListener('focus', this.handleFocus);
    input.addEventListener('blur', this.handleBlur);
  }

  destroy(): void {
    const { input } = this.elements;
    input.removeEventListener('pointerenter', this.handlePointerEnter);
    input.removeEventListener('pointermove', this.handlePointerMove);
    input.removeEventListener('pointerleave', this.handlePointerLeave);
    input.removeEventListener('pointerdown', this.handlePointerDown);
    input.removeEventListener('pointerup', this.handlePointerUp);
    input.removeEventListener('pointercancel', this.handlePointerCancel);
    input.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    input.removeEventListener('input', this.handleInput);
    input.removeEventListener('keydown', this.handleKeydown);
    input.removeEventListener('focus', this.handleFocus);
    input.removeEventListener('blur', this.handleBlur);
    this.cancelRender();
  }

  sync(snapshot: PagerSnapshot): void {
    this.committedPage = snapshot.currentPage;
    this.elements.input.max = String(snapshot.totalPages);
    this.elements.input.disabled = !snapshot.paginationExact || snapshot.totalPages <= 1;
    this.elements.input.setAttribute('aria-valuemax', String(snapshot.totalPages));
    this.elements.group.style.setProperty(
      '--skim-committed-position',
      this.progressForPage(snapshot.currentPage),
    );
    if (this.mode === 'idle') this.resetInput();
    if (this.elements.input.disabled) this.cancel();
  }

  cancel(): void {
    this.mode = 'idle';
    this.pointerId = undefined;
    this.target = undefined;
    this.cancelRender();
    this.resetInput();
    this.elements.group.classList.remove('is-skimming');
    this.elements.popover.hidden = true;
    this.elements.preview.replaceChildren();
  }

  private resetInput(): void {
    this.elements.input.value = String(this.committedPage);
    this.elements.input.style.setProperty(
      '--skim-position',
      this.progressForPage(this.committedPage),
    );
  }

  private progressForPage(page: number): string {
    const maximum = Math.max(1, Number(this.elements.input.max));
    return `${maximum <= 1 ? 100 : ((page - 1) / (maximum - 1)) * 100}%`;
  }

  private pageFromPointer(event: PointerEvent): number {
    const rect = this.elements.input.getBoundingClientRect();
    const fraction = rect.width <= 0 ? 0 : (event.clientX - rect.left) / rect.width;
    const maximum = Math.max(1, Number(this.elements.input.max));
    return 1 + Math.round(Math.max(0, Math.min(1, fraction)) * (maximum - 1));
  }

  private previewPage(page: number, mode: Exclude<SkimMode, 'idle'>): void {
    const target = this.pager.skimTarget(page);
    if (!target) return;
    this.mode = mode;
    this.target = target;
    this.elements.input.value = String(target.currentPage);
    this.elements.input.style.setProperty('--skim-position', this.progressForPage(target.currentPage));
    this.elements.group.style.setProperty('--skim-position', this.progressForPage(target.currentPage));
    this.elements.group.classList.add('is-skimming');
    this.elements.popover.hidden = false;
    this.elements.hint.textContent = mode === 'keyboard'
      ? t('reader.skimKeyboardHint')
      : mode === 'drag' ? t('reader.skimPointerHint') : '';
    this.positionPopover(target.currentPage);
    this.scheduleRender(target);
  }

  private scheduleRender(target: SkimTarget): void {
    this.cancelRender();
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = undefined;
      if (this.target !== target) return;
      const anchor = this.pager.renderSkimPreview(target, this.elements.preview);
      this.elements.chapter.textContent = this.actions.chapterForAnchor(anchor);
      this.elements.page.textContent = target.lastPage > target.currentPage
        ? t('reader.skimPages', {
          first: target.currentPage,
          last: target.lastPage,
          progress: Math.round(target.progress),
        })
        : t('reader.skimPage', {
          current: target.currentPage,
          progress: Math.round(target.progress),
        });
    });
  }

  private cancelRender(): void {
    if (this.renderFrame === undefined) return;
    cancelAnimationFrame(this.renderFrame);
    this.renderFrame = undefined;
  }

  private positionPopover(page: number): void {
    const maximum = Math.max(1, Number(this.elements.input.max));
    const fraction = maximum <= 1 ? 0 : (page - 1) / (maximum - 1);
    this.elements.popover.style.setProperty('--skim-popover-position', `${fraction * 100}%`);
  }

  private commit(): void {
    const target = this.target;
    if (!target || !this.pager.commitSkim(target)) {
      this.cancel();
      return;
    }
    this.cancel();
    this.actions.committed();
  }

  private readonly handlePointerEnter = (event: PointerEvent): void => {
    if (this.elements.input.disabled || event.pointerType === 'touch') return;
    this.previewPage(this.pageFromPointer(event), 'hover');
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.elements.input.disabled || event.pointerType === 'touch') return;
    if (this.mode === 'drag' && this.pointerId !== event.pointerId) return;
    this.previewPage(this.pageFromPointer(event), this.mode === 'drag' ? 'drag' : 'hover');
  };

  private readonly handlePointerLeave = (): void => {
    if (this.mode === 'hover') this.cancel();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.elements.input.disabled || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.pointerId = event.pointerId;
    this.elements.input.setPointerCapture?.(event.pointerId);
    this.previewPage(this.pageFromPointer(event), 'drag');
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.mode !== 'drag' || this.pointerId !== event.pointerId) return;
    this.pointerId = undefined;
    if (this.elements.input.hasPointerCapture?.(event.pointerId)) {
      this.elements.input.releasePointerCapture(event.pointerId);
    }
    this.commit();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointerId === event.pointerId) this.cancel();
  };

  private readonly handleLostPointerCapture = (): void => {
    if (this.mode === 'drag' && this.pointerId !== undefined) this.cancel();
  };

  private readonly handleInput = (): void => {
    if (this.elements.input.disabled) return;
    this.previewPage(Number(this.elements.input.value), this.mode === 'drag' ? 'drag' : 'keyboard');
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && this.mode === 'keyboard') {
      event.preventDefault();
      this.commit();
      return;
    }
    if (event.key === 'Escape' && this.mode !== 'idle') {
      event.preventDefault();
      this.cancel();
      return;
    }

    const current = this.target ?? this.pager.skimTarget(this.committedPage);
    if (!current) return;
    const pageStep = current.pagesPerView;
    const targetPage = (() => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          return current.currentPage + pageStep;
        case 'ArrowLeft':
        case 'ArrowUp':
          return current.currentPage - pageStep;
        case 'PageDown':
          return current.currentPage + pageStep * 5;
        case 'PageUp':
          return current.currentPage - pageStep * 5;
        case 'Home':
          return 1;
        case 'End':
          return current.totalPages;
        default:
          return undefined;
      }
    })();
    if (targetPage === undefined) return;
    event.preventDefault();
    this.previewPage(targetPage, 'keyboard');
  };

  private readonly handleFocus = (): void => {
    if (this.mode === 'idle') this.previewPage(this.committedPage, 'keyboard');
  };

  private readonly handleBlur = (): void => {
    if (this.mode === 'keyboard') this.cancel();
  };
}
