import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderVisibilityController, isShortTap } from './header-visibility';

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
