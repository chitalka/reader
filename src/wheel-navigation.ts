const WHEEL_LINE_HEIGHT = 16;
const WHEEL_TURN_THRESHOLD = 12;
export const WHEEL_GESTURE_IDLE_MS = 220;

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  timeStamp: number;
}

function pixelDelta(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_HEIGHT;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/**
 * Turns a stream of wheel events into at most one page turn per gesture.
 * A gesture lasts until no wheel event arrives for WHEEL_GESTURE_IDLE_MS,
 * so trackpad inertia and free-spinning wheels flip a single page.
 */
export class WheelGesture {
  private accumulated = 0;
  private lastTime = Number.NEGATIVE_INFINITY;
  private turned = false;

  constructor(private readonly pageSize = 800) {}

  /** Returns 1 for the next page, -1 for the previous page, 0 for no turn. */
  push(sample: WheelSample): -1 | 0 | 1 {
    if (sample.timeStamp - this.lastTime > WHEEL_GESTURE_IDLE_MS) {
      this.accumulated = 0;
      this.turned = false;
    }
    this.lastTime = sample.timeStamp;
    if (this.turned) return 0;

    const dominant = Math.abs(sample.deltaX) > Math.abs(sample.deltaY) ? sample.deltaX : sample.deltaY;
    const delta = pixelDelta(dominant, sample.deltaMode, this.pageSize);
    if (delta === 0) return 0;
    if (Math.sign(delta) !== Math.sign(this.accumulated)) this.accumulated = 0;
    this.accumulated += delta;
    if (Math.abs(this.accumulated) < WHEEL_TURN_THRESHOLD) return 0;

    this.turned = true;
    return this.accumulated > 0 ? 1 : -1;
  }
}

export interface WheelNavigationOptions {
  enabled(): boolean;
  ignore(target: EventTarget | null): boolean;
  turn(direction: -1 | 1): void;
}

export function bindWheelNavigation(target: HTMLElement, options: WheelNavigationOptions): () => void {
  const gesture = new WheelGesture();
  const handleWheel = (event: WheelEvent): void => {
    if (!options.enabled() || event.ctrlKey || event.metaKey || options.ignore(event.target)) return;
    event.preventDefault();
    const direction = gesture.push(event);
    if (direction !== 0) options.turn(direction);
  };
  target.addEventListener('wheel', handleWheel, { passive: false });
  return () => target.removeEventListener('wheel', handleWheel);
}
