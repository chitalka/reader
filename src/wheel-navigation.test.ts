import { describe, expect, it, vi } from 'vitest';
import { bindWheelNavigation, WHEEL_GESTURE_IDLE_MS, WheelGesture } from './wheel-navigation';

const sample = (deltaY: number, timeStamp: number, deltaX = 0, deltaMode = 0) => ({
  deltaX,
  deltaY,
  deltaMode,
  timeStamp,
});

describe('wheel gesture', () => {
  it('turns forward on wheel down and backward on wheel up', () => {
    expect(new WheelGesture().push(sample(100, 0))).toBe(1);
    expect(new WheelGesture().push(sample(-100, 0))).toBe(-1);
  });

  it('uses horizontal scroll when it dominates', () => {
    expect(new WheelGesture().push(sample(5, 0, 60))).toBe(1);
    expect(new WheelGesture().push(sample(5, 0, -60))).toBe(-1);
  });

  it('turns only one page per continuous gesture', () => {
    const gesture = new WheelGesture();
    const turns = Array.from({ length: 40 }, (_, index) => gesture.push(sample(30, index * 16)));
    expect(turns.filter((turn) => turn !== 0)).toEqual([1]);
  });

  it('starts a new gesture after the wheel goes idle', () => {
    const gesture = new WheelGesture();
    expect(gesture.push(sample(100, 0))).toBe(1);
    expect(gesture.push(sample(100, WHEEL_GESTURE_IDLE_MS - 1))).toBe(0);
    expect(gesture.push(sample(-100, WHEEL_GESTURE_IDLE_MS * 3))).toBe(-1);
  });

  it('accumulates small trackpad deltas before turning', () => {
    const gesture = new WheelGesture();
    expect(gesture.push(sample(4, 0))).toBe(0);
    expect(gesture.push(sample(4, 16))).toBe(0);
    expect(gesture.push(sample(4, 32))).toBe(1);
  });

  it('treats line-mode deltas as full wheel notches', () => {
    expect(new WheelGesture().push(sample(1, 0, 0, 1))).toBe(1);
  });
});

describe('wheel navigation binding', () => {
  const wheel = (init: WheelEventInit) => new WheelEvent('wheel', { cancelable: true, ...init });

  it('does nothing while disabled', () => {
    const target = document.createElement('div');
    const turn = vi.fn();
    bindWheelNavigation(target, { enabled: () => false, ignore: () => false, turn });
    const event = wheel({ deltaY: 100 });
    target.dispatchEvent(event);
    expect(turn).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('turns pages and prevents scrolling while enabled', () => {
    const target = document.createElement('div');
    const turn = vi.fn();
    bindWheelNavigation(target, { enabled: () => true, ignore: () => false, turn });
    const event = wheel({ deltaY: 100 });
    target.dispatchEvent(event);
    expect(turn).toHaveBeenCalledWith(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves zoom gestures and ignored targets alone', () => {
    const target = document.createElement('div');
    const turn = vi.fn();
    bindWheelNavigation(target, { enabled: () => true, ignore: (node) => node === target, turn });
    target.dispatchEvent(wheel({ deltaY: 100 }));
    const other = document.createElement('div');
    bindWheelNavigation(other, { enabled: () => true, ignore: () => false, turn });
    other.dispatchEvent(wheel({ deltaY: 100, ctrlKey: true }));
    expect(turn).not.toHaveBeenCalled();
  });
});
