import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderVisibilityController, bindTouchTap, isShortTap } from './header-visibility';

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointerup' | 'pointercancel',
  init: Partial<Pick<PointerEvent, 'clientX' | 'clientY' | 'isPrimary' | 'pointerId' | 'pointerType'>> = {},
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX ?? 100,
    clientY: init.clientY ?? 100,
  });
  Object.defineProperties(event, {
    isPrimary: { value: init.isPrimary ?? true },
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? 'touch' },
  });
  target.dispatchEvent(event);
}

describe('HeaderVisibilityController', () => {
  let root: HTMLElement;
  let header: HTMLElement;
  let controller: HeaderVisibilityController;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"><header id="header"></header></div>';
    root = document.querySelector('#root') as HTMLElement;
    header = document.querySelector('#header') as HTMLElement;
    controller = new HeaderVisibilityController(root, header, 5_000);
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('hides the header after five seconds of inactivity', () => {
    controller.reveal();
    vi.advanceTimersByTime(4_999);
    expect(root.dataset.headerVisibility).toBe('visible');

    vi.advanceTimersByTime(1);
    expect(root.dataset.headerVisibility).toBe('hidden');
    expect(header.getAttribute('aria-hidden')).toBe('true');
    expect(header.hasAttribute('inert')).toBe(true);
  });

  it('reveals the header and restarts the inactivity timer', () => {
    controller.reveal();
    vi.advanceTimersByTime(4_000);
    controller.reveal();
    vi.advanceTimersByTime(4_000);

    expect(root.dataset.headerVisibility).toBe('visible');
    expect(header.hasAttribute('inert')).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(root.dataset.headerVisibility).toBe('hidden');
  });

  it('hides immediately for a reading action', () => {
    controller.reveal();
    controller.hide();

    expect(root.dataset.headerVisibility).toBe('hidden');
  });

  it('toggles the header on consecutive reading-area taps', () => {
    controller.reveal();

    controller.toggle();
    expect(root.dataset.headerVisibility).toBe('hidden');
    expect(header.hasAttribute('inert')).toBe(true);

    controller.toggle();
    expect(root.dataset.headerVisibility).toBe('visible');
    expect(header.hasAttribute('inert')).toBe(false);

    vi.advanceTimersByTime(5_000);
    expect(root.dataset.headerVisibility).toBe('hidden');
  });

  it('does not hide from a toggle while settings pin the header', () => {
    controller.setPinned(true);
    controller.toggle();

    expect(root.dataset.headerVisibility).toBe('visible');
    expect(header.hasAttribute('inert')).toBe(false);
  });

  it('stays visible while pinned and starts a fresh timer when released', () => {
    controller.reveal();
    controller.setPinned(true);
    vi.advanceTimersByTime(10_000);
    expect(root.dataset.headerVisibility).toBe('visible');

    controller.setPinned(false);
    vi.advanceTimersByTime(4_999);
    expect(root.dataset.headerVisibility).toBe('visible');

    vi.advanceTimersByTime(1);
    expect(root.dataset.headerVisibility).toBe('hidden');
  });
});

describe('isShortTap', () => {
  const start = { pointerId: 1, x: 100, y: 100 };

  it('accepts a short movement from the same pointer', () => {
    expect(isShortTap(start, { pointerId: 1, x: 108, y: 106 })).toBe(true);
  });

  it('rejects a swipe or another pointer', () => {
    expect(isShortTap(start, { pointerId: 1, x: 60, y: 100 })).toBe(false);
    expect(isShortTap(start, { pointerId: 2, x: 100, y: 100 })).toBe(false);
  });
});

describe('bindTouchTap', () => {
  it('handles short touch taps only inside the bound reading area', () => {
    document.body.innerHTML = '<main id="reader"></main><header id="header"></header>';
    const reader = document.querySelector('#reader') as HTMLElement;
    const header = document.querySelector('#header') as HTMLElement;
    const onTap = vi.fn();
    const unbind = bindTouchTap(reader, onTap);

    dispatchPointer(reader, 'pointerdown');
    dispatchPointer(reader, 'pointerup');
    expect(onTap).toHaveBeenCalledTimes(1);

    dispatchPointer(header, 'pointerdown');
    dispatchPointer(header, 'pointerup');
    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse' });
    dispatchPointer(reader, 'pointerdown');
    dispatchPointer(reader, 'pointerup', { clientX: 150 });
    expect(onTap).toHaveBeenCalledTimes(1);

    unbind();
    document.body.replaceChildren();
  });

  it('forgets a touch gesture when the pointer is cancelled', () => {
    const reader = document.createElement('main');
    const onTap = vi.fn();
    const unbind = bindTouchTap(reader, onTap);

    dispatchPointer(reader, 'pointerdown');
    dispatchPointer(reader, 'pointercancel');
    dispatchPointer(reader, 'pointerup');
    expect(onTap).not.toHaveBeenCalled();

    unbind();
  });
});
