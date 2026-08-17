import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderVisibilityController,
  bindMouseReadingClick,
  bindTouchSwipe,
  bindTouchTap,
  isShortTap,
  swipeTurnDirection,
} from './header-visibility';

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: Partial<Pick<
    PointerEvent,
    'clientX' | 'clientY' | 'isPrimary' | 'pointerId' | 'pointerType' | 'timeStamp'
  >> = {},
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
    timeStamp: { value: init.timeStamp ?? performance.now() },
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

  it('reports automatic idle hides but not explicit reading actions', () => {
    const onIdleHide = vi.fn();
    controller.destroy();
    controller = new HeaderVisibilityController(root, header, 5_000, onIdleHide);

    controller.reveal();
    controller.hide();
    expect(onIdleHide).not.toHaveBeenCalled();

    controller.reveal();
    vi.advanceTimersByTime(5_000);
    expect(onIdleHide).toHaveBeenCalledTimes(1);

    controller.reveal();
    vi.advanceTimersByTime(5_000);
    expect(onIdleHide).toHaveBeenCalledTimes(2);
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

  it('does not toggle for an active selection or a saved quote highlight', () => {
    const reader = document.createElement('main');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Выделенный текст';
    const highlight = document.createElement('mark');
    highlight.dataset.readerQuote = 'quote-1';
    highlight.textContent = 'Сохранённая цитата';
    reader.append(paragraph, highlight);
    document.body.append(reader);
    const onTap = vi.fn();
    const unbind = bindTouchTap(reader, onTap);

    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.addRange(range);
    dispatchPointer(paragraph, 'pointerdown');
    dispatchPointer(paragraph, 'pointerup');
    selection?.removeAllRanges();

    dispatchPointer(highlight, 'pointerdown');
    dispatchPointer(highlight, 'pointerup');

    expect(onTap).not.toHaveBeenCalled();
    unbind();
    reader.remove();
  });
});

describe('bindMouseReadingClick', () => {
  it('handles a short primary mouse click but ignores touch and drag gestures', () => {
    const reader = document.createElement('main');
    const onClick = vi.fn();
    const unbind = bindMouseReadingClick(reader, onClick);

    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse' });
    expect(onClick).toHaveBeenCalledTimes(1);

    dispatchPointer(reader, 'pointerdown');
    dispatchPointer(reader, 'pointerup');
    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse', clientX: 150 });
    expect(onClick).toHaveBeenCalledTimes(1);

    unbind();
  });

  it('does not toggle for text selection or interactive content', () => {
    const reader = document.createElement('main');
    const paragraph = document.createElement('p');
    const text = document.createTextNode('Выделяемый текст');
    const link = document.createElement('a');
    link.href = '#note';
    link.textContent = 'Сноска';
    const highlight = document.createElement('mark');
    highlight.dataset.readerQuote = 'quote-1';
    highlight.textContent = 'Цитата';
    paragraph.append(text, link, highlight);
    reader.append(paragraph);
    document.body.append(reader);

    const onClick = vi.fn();
    const unbind = bindMouseReadingClick(reader, onClick);
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);

    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse' });
    selection?.removeAllRanges();

    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse' });
    selection?.addRange(range);
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse' });
    selection?.removeAllRanges();

    dispatchPointer(link, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(link, 'pointerup', { pointerType: 'mouse' });
    dispatchPointer(highlight, 'pointerdown', { pointerType: 'mouse' });
    dispatchPointer(highlight, 'pointerup', { pointerType: 'mouse' });
    expect(onClick).not.toHaveBeenCalled();

    unbind();
    reader.remove();
  });
});

describe('bindTouchSwipe', () => {
  it('reports live horizontal touch movement and release velocity', () => {
    const reader = document.createElement('main');
    const handlers = {
      start: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      cancel: vi.fn(),
    };
    const unbind = bindTouchSwipe(reader, handlers);

    dispatchPointer(reader, 'pointerdown', { clientX: 100, timeStamp: 0 });
    dispatchPointer(reader, 'pointermove', { clientX: 70, timeStamp: 50 });
    dispatchPointer(reader, 'pointerup', { clientX: 40, timeStamp: 100 });

    expect(handlers.start).toHaveBeenCalledTimes(1);
    expect(handlers.move).toHaveBeenNthCalledWith(1, -30);
    expect(handlers.move).toHaveBeenNthCalledWith(2, -60);
    expect(handlers.end).toHaveBeenCalledWith({ distance: -60, velocity: -0.6 });
    expect(handlers.cancel).not.toHaveBeenCalled();

    unbind();
  });

  it('cancels an active gesture on pointer cancellation', () => {
    const reader = document.createElement('main');
    const handlers = {
      start: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn(),
    };
    const unbind = bindTouchSwipe(reader, handlers);

    dispatchPointer(reader, 'pointerdown', { clientX: 100 });
    dispatchPointer(reader, 'pointermove', { clientX: 70 });
    dispatchPointer(reader, 'pointercancel', { clientX: 70 });

    expect(handlers.start).toHaveBeenCalledTimes(1);
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(handlers.end).not.toHaveBeenCalled();
    unbind();
  });

  it('leaves mouse and vertical touch movement to native browser behavior', () => {
    const reader = document.createElement('main');
    const handlers = {
      start: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn(),
    };
    const unbind = bindTouchSwipe(reader, handlers);

    dispatchPointer(reader, 'pointerdown', { pointerType: 'mouse', clientX: 100 });
    dispatchPointer(reader, 'pointerup', { pointerType: 'mouse', clientX: 20 });
    dispatchPointer(reader, 'pointerdown', { clientX: 100 });
    dispatchPointer(reader, 'pointermove', { clientX: 105, clientY: 140 });
    dispatchPointer(reader, 'pointerup', { clientX: 105, clientY: 140 });
    expect(handlers.start).not.toHaveBeenCalled();
    expect(handlers.end).not.toHaveBeenCalled();

    unbind();
  });

  it('settles from distance or velocity and cancels a short slow drag', () => {
    expect(swipeTurnDirection({ distance: -80, velocity: -0.1 }, 390)).toBe(1);
    expect(swipeTurnDirection({ distance: 20, velocity: 0.5 }, 390)).toBe(-1);
    expect(swipeTurnDirection({ distance: -30, velocity: -0.1 }, 390)).toBe(0);
  });
});
