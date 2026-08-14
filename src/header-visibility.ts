export interface TouchPoint {
  pointerId: number;
  x: number;
  y: number;
}

const DEFAULT_IDLE_DELAY = 5_000;
const TAP_DISTANCE = 14;

export function isShortTap(start: TouchPoint | undefined, end: TouchPoint): boolean {
  if (!start || start.pointerId !== end.pointerId) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_DISTANCE;
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
