export interface TouchPoint {
  pointerId: number;
  x: number;
  y: number;
}

const DEFAULT_IDLE_DELAY = 5_000;
const TAP_DISTANCE = 14;
const SWIPE_DISTANCE = 48;

export function isShortTap(start: TouchPoint | undefined, end: TouchPoint): boolean {
  if (!start || start.pointerId !== end.pointerId) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_DISTANCE;
}

export function bindTouchTap(target: HTMLElement, onTap: () => void): () => void {
  let start: (TouchPoint & { selectionActive: boolean; blocked: boolean }) | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      selectionActive: hasTextSelection(target.ownerDocument),
      blocked: isToggleBlockedTarget(event.target),
    };
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    const end = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    if (
      isShortTap(start, end)
      && !start?.selectionActive
      && !start?.blocked
      && !hasTextSelection(target.ownerDocument)
    ) onTap();
    start = undefined;
  };
  const handlePointerCancel = () => {
    start = undefined;
  };

  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
  };
}

function hasTextSelection(document: Document): boolean {
  const selection = document.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function isToggleBlockedTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('a, button, input, textarea, select, label, [data-reader-quote]'));
}

export function bindMouseReadingClick(target: HTMLElement, onClick: () => void): () => void {
  let start: (TouchPoint & { selectionActive: boolean; interactive: boolean }) | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType !== 'mouse' || event.button !== 0) return;
    start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      selectionActive: hasTextSelection(target.ownerDocument),
      interactive: isToggleBlockedTarget(event.target),
    };
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType !== 'mouse') return;
    const end = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    if (
      isShortTap(start, end)
      && !start?.selectionActive
      && !start?.interactive
      && !hasTextSelection(target.ownerDocument)
    ) {
      onClick();
    }
    start = undefined;
  };
  const handlePointerCancel = () => {
    start = undefined;
  };

  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
  };
}

export function bindTouchSwipe(target: HTMLElement, onSwipe: (distance: number) => void): () => void {
  let start: TouchPoint | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = event.clientX - start.x;
    start = undefined;
    if (Math.abs(distance) >= SWIPE_DISTANCE) onSwipe(distance);
  };
  const handlePointerCancel = () => {
    start = undefined;
  };

  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
  };
}

export class HeaderVisibilityController {
  private hideTimer?: number;
  private pinned = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly header: HTMLElement,
    private readonly idleDelay = DEFAULT_IDLE_DELAY,
  ) {}

  reveal(): void {
    this.setHidden(false);
    this.scheduleHide();
  }

  hide(): void {
    if (this.pinned) return;
    this.clearTimer();
    this.setHidden(true);
  }

  toggle(): void {
    if (this.root.dataset.headerVisibility === 'hidden') {
      this.reveal();
    } else {
      this.hide();
    }
  }

  setPinned(pinned: boolean): void {
    this.pinned = pinned;
    if (pinned) {
      this.clearTimer();
      this.setHidden(false);
    } else {
      this.reveal();
    }
  }

  destroy(): void {
    this.clearTimer();
  }

  private scheduleHide(): void {
    this.clearTimer();
    if (this.pinned) return;
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = undefined;
      this.setHidden(true);
    }, this.idleDelay);
  }

  private clearTimer(): void {
    if (this.hideTimer === undefined) return;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private setHidden(hidden: boolean): void {
    this.root.dataset.headerVisibility = hidden ? 'hidden' : 'visible';
    if (hidden) {
      this.header.setAttribute('aria-hidden', 'true');
      this.header.setAttribute('inert', '');
    } else {
      this.header.removeAttribute('aria-hidden');
      this.header.removeAttribute('inert');
    }
  }
}
