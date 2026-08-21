export interface TouchPoint {
  pointerId: number;
  x: number;
  y: number;
}

const DEFAULT_IDLE_DELAY = 5_000;
const TAP_DISTANCE = 14;
const SWIPE_INTENT_DISTANCE = 8;
const SWIPE_MIN_DISTANCE = 48;
const SWIPE_DISTANCE_RATIO = 0.18;
const SWIPE_MIN_VELOCITY = 0.35;

export type HeaderVisibilityMode = 'auto' | 'persistent';

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

export interface TouchSwipeSample {
  distance: number;
  velocity: number;
}

export interface TouchSwipeHandlers {
  start(): void;
  move(distance: number): void;
  end(sample: TouchSwipeSample): void;
  cancel(): void;
}

interface TouchSwipeSession extends TouchPoint {
  active: boolean;
  lastTime: number;
  lastVelocity: number;
  lastX: number;
}

export function swipeTurnDirection(
  sample: TouchSwipeSample,
  viewportWidth: number,
): -1 | 0 | 1 {
  const requiredDistance = Math.max(
    SWIPE_MIN_DISTANCE,
    Math.min(96, viewportWidth * SWIPE_DISTANCE_RATIO),
  );
  if (
    Math.abs(sample.distance) < requiredDistance
    && Math.abs(sample.velocity) < SWIPE_MIN_VELOCITY
  ) return 0;
  const movement = Math.abs(sample.velocity) >= SWIPE_MIN_VELOCITY
    ? sample.velocity
    : sample.distance;
  return movement < 0 ? 1 : -1;
}

export function bindTouchSwipe(
  target: HTMLElement,
  handlers: TouchSwipeHandlers,
): () => void {
  let session: TouchSwipeSession | undefined;

  const release = (pointerId: number): void => {
    if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  };

  const activate = (event: PointerEvent): boolean => {
    if (!session || session.active) return Boolean(session?.active);
    const distanceX = event.clientX - session.x;
    const distanceY = event.clientY - session.y;
    if (Math.hypot(distanceX, distanceY) < SWIPE_INTENT_DISTANCE) return false;
    if (Math.abs(distanceY) >= Math.abs(distanceX)) {
      session = undefined;
      return false;
    }
    if (hasTextSelection(target.ownerDocument)) {
      session = undefined;
      return false;
    }
    session.active = true;
    target.setPointerCapture?.(event.pointerId);
    handlers.start();
    return true;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (
      !event.isPrimary
      || event.pointerType === 'mouse'
      || isToggleBlockedTarget(event.target)
      || hasTextSelection(target.ownerDocument)
    ) return;
    session = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      lastTime: event.timeStamp,
      lastVelocity: 0,
      lastX: event.clientX,
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!session || session.pointerId !== event.pointerId || !event.isPrimary) return;
    if (!activate(event) || !session) return;
    event.preventDefault();
    const elapsed = event.timeStamp - session.lastTime;
    if (elapsed > 0) session.lastVelocity = (event.clientX - session.lastX) / elapsed;
    session.lastTime = event.timeStamp;
    session.lastX = event.clientX;
    handlers.move(event.clientX - session.x);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = event.clientX - session.x;
    if (!session.active) activate(event);
    if (session?.active) {
      const elapsed = event.timeStamp - session.lastTime;
      const velocity = elapsed > 0
        ? (event.clientX - session.lastX) / elapsed
        : session.lastVelocity;
      handlers.move(distance);
      handlers.end({ distance, velocity });
    }
    release(event.pointerId);
    session = undefined;
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.active) handlers.cancel();
    release(event.pointerId);
    session = undefined;
  };

  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointermove', handlePointerMove);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerCancel);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
    if (session?.active) handlers.cancel();
    if (session) release(session.pointerId);
    session = undefined;
  };
}

export class HeaderVisibilityController {
  private hideTimer?: number;
  private pinned = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly header: HTMLElement,
    private readonly idleDelay = DEFAULT_IDLE_DELAY,
    private readonly onIdleHide?: () => void,
    private readonly mode: HeaderVisibilityMode = 'auto',
    private readonly companionControls: readonly HTMLElement[] = [],
  ) {}

  reveal(): void {
    this.setHidden(false);
    if (this.mode === 'auto') this.scheduleHide();
  }

  hide(): void {
    if (this.pinned || this.mode === 'persistent') return;
    this.clearTimer();
    this.setHidden(true);
  }

  toggle(): void {
    if (this.mode === 'persistent') {
      this.reveal();
      return;
    }
    if (this.root.dataset.headerVisibility === 'hidden') {
      this.reveal();
    } else {
      this.hide();
    }
  }

  setPinned(pinned: boolean): void {
    this.pinned = pinned;
    if (pinned || this.mode === 'persistent') {
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
    if (this.pinned || this.mode === 'persistent') return;
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = undefined;
      this.setHidden(true);
      this.onIdleHide?.();
    }, this.idleDelay);
  }

  private clearTimer(): void {
    if (this.hideTimer === undefined) return;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private setHidden(hidden: boolean): void {
    const nextState = hidden ? 'hidden' : 'visible';
    if (this.root.dataset.headerVisibility === nextState) return;
    this.root.dataset.headerVisibility = nextState;
    for (const element of [this.header, ...this.companionControls]) {
      if (hidden) {
        element.setAttribute('aria-hidden', 'true');
        element.setAttribute('inert', '');
      } else {
        element.removeAttribute('aria-hidden');
        element.removeAttribute('inert');
      }
    }
  }
}
