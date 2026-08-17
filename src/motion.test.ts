import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMotionOrigin, VisibilityMotion } from './motion';

describe('VisibilityMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('keeps a surface visible when reopening interrupts its exit', () => {
    const element = document.createElement('section');
    element.hidden = true;
    element.style.transitionProperty = 'opacity';
    element.style.transitionDuration = '200ms';
    document.body.append(element);
    const motion = new VisibilityMotion(element);

    motion.show();
    motion.hide();
    expect(element.dataset.motionState).toBe('closing');
    expect(element.hasAttribute('inert')).toBe(true);

    motion.show();
    vi.advanceTimersByTime(300);

    expect(element.hidden).toBe(false);
    expect(element.dataset.motionState).toBe('open');
    expect(element.hasAttribute('inert')).toBe(false);
  });

  it('waits for the opacity transition before applying hidden', () => {
    const element = document.createElement('section');
    element.style.transitionProperty = 'opacity';
    element.style.transitionDuration = '200ms';
    document.body.append(element);
    const motion = new VisibilityMotion(element);

    motion.hide();
    expect(element.hidden).toBe(false);
    element.dispatchEvent(new TransitionEvent('transitionend', {
      propertyName: 'opacity',
      bubbles: true,
    }));

    expect(element.hidden).toBe(true);
    expect(element.dataset.motionState).toBe('closed');
  });

  it('connects a popover origin to its trigger', () => {
    const surface = document.createElement('section');
    const trigger = document.createElement('button');
    Object.defineProperty(surface, 'getBoundingClientRect', {
      value: () => ({ left: 600, top: 80, width: 340, height: 400 } as DOMRect),
    });
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 820, top: 16, width: 40, height: 40 } as DOMRect),
    });

    setMotionOrigin(surface, trigger);

    expect(surface.style.getPropertyValue('--motion-origin-x')).toBe('240px');
    expect(surface.style.getPropertyValue('--motion-origin-y')).toBe('0px');
  });
});
