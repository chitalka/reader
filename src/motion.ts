export const MOTION_DURATION = {
  immediate: 140,
  exit: 160,
  routine: 200,
  page: 260,
} as const;

export const MOTION_EASING = {
  enter: 'cubic-bezier(0.23, 1, 0.32, 1)',
  move: 'cubic-bezier(0.77, 0, 0.175, 1)',
} as const;

type MotionState = 'closed' | 'closing' | 'open' | 'opening';

function timeInMilliseconds(value: string): number {
  const normalized = value.trim();
  if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || 0;
  if (normalized.endsWith('s')) return (Number.parseFloat(normalized) || 0) * 1_000;
  return 0;
}

function longestTransition(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const durations = style.transitionDuration.split(',').map(timeInMilliseconds);
  const delays = style.transitionDelay.split(',').map(timeInMilliseconds);
  return durations.reduce((longest, duration, index) => (
    Math.max(longest, duration + (delays[index % Math.max(1, delays.length)] ?? 0))
  ), 0);
}

function nextFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return window.setTimeout(() => callback(performance.now()), 16);
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

export class VisibilityMotion {
  private generation = 0;
  private frame?: number;
  private stopWaiting?: () => void;

  constructor(private readonly element: HTMLElement) {
    element.dataset.motionState = element.hidden ? 'closed' : 'open';
  }

  show(prepare?: () => void): void {
    const generation = ++this.generation;
    const wasHidden = this.element.hidden;
    this.cancelPending();
    this.element.hidden = false;
    this.element.removeAttribute('aria-hidden');
    this.element.removeAttribute('inert');
    this.setState('open');
    prepare?.();

    if (!wasHidden) return;
    this.setState('opening');
    this.frame = nextFrame(() => {
      this.frame = undefined;
      if (generation === this.generation) this.setState('open');
    });
  }

  hide(afterHidden?: () => void): void {
    const generation = ++this.generation;
    this.cancelPending();
    if (this.element.hidden) {
      afterHidden?.();
      return;
    }

    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('inert', '');
    this.setState('closing');
    const duration = longestTransition(this.element);
    if (duration <= 0) {
      this.finishHide(generation, afterHidden);
      return;
    }

    let timer: number | undefined;
    const finish = (event?: TransitionEvent): void => {
      if (event && (event.target !== this.element || event.propertyName !== 'opacity')) return;
      this.element.removeEventListener('transitionend', finish);
      if (timer !== undefined) window.clearTimeout(timer);
      this.stopWaiting = undefined;
      this.finishHide(generation, afterHidden);
    };
    this.element.addEventListener('transitionend', finish);
    timer = window.setTimeout(() => finish(), duration + 50);
    this.stopWaiting = () => {
      this.element.removeEventListener('transitionend', finish);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }

  hideImmediately(): void {
    ++this.generation;
    this.cancelPending();
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('inert', '');
    this.setState('closed');
  }

  destroy(): void {
    ++this.generation;
    this.cancelPending();
  }

  private finishHide(generation: number, afterHidden?: () => void): void {
    if (generation !== this.generation) return;
    this.element.hidden = true;
    this.setState('closed');
    afterHidden?.();
  }

  private cancelPending(): void {
    if (this.frame !== undefined) cancelFrame(this.frame);
    this.frame = undefined;
    this.stopWaiting?.();
    this.stopWaiting = undefined;
  }

  private setState(state: MotionState): void {
    this.element.dataset.motionState = state;
  }
}

export function setMotionOrigin(surface: HTMLElement, trigger: HTMLElement): void {
  const surfaceRect = surface.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  if (!surfaceRect.width || !surfaceRect.height) return;
  const x = Math.min(
    surfaceRect.width - 20,
    Math.max(20, triggerRect.left + triggerRect.width / 2 - surfaceRect.left),
  );
  const y = Math.min(
    surfaceRect.height - 12,
    Math.max(0, triggerRect.top + triggerRect.height / 2 - surfaceRect.top),
  );
  surface.style.setProperty('--motion-origin-x', `${x}px`);
  surface.style.setProperty('--motion-origin-y', `${y}px`);
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
