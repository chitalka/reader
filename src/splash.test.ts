import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissInitialSplash,
  hideLoadingOverlay,
  showLoadingOverlay,
} from './splash';

describe('loading overlay', () => {
  const immediateFrame = (callback: FrameRequestCallback): number => {
    callback(0);
    return 1;
  };

  beforeEach(() => {
    document.documentElement.removeAttribute('data-app-ready');
    document.body.innerHTML = `
      <div
        id="app-splash"
        role="status"
        style="transition-property: opacity; transition-duration: 160ms"
      >
        <p id="app-splash-label">Открываем книгу…</p>
      </div>
      <div id="app" inert aria-hidden="true"></div>
    `;
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', immediateFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the application inert until the initial overlay finishes leaving', () => {
    const app = document.getElementById('app')!;
    const splash = document.getElementById('app-splash')!;
    expect(app.hasAttribute('inert')).toBe(true);

    dismissInitialSplash(immediateFrame);

    expect(app.hasAttribute('inert')).toBe(true);
    expect(splash.dataset.motionState).toBe('closing');

    splash.dispatchEvent(new TransitionEvent('transitionend', {
      propertyName: 'opacity',
    }));

    expect(splash.hidden).toBe(true);
    expect(splash.dataset.motionState).toBe('closed');
    expect(app.hasAttribute('inert')).toBe(false);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
    expect(document.documentElement.dataset.appReady).toBe('true');
  });

  it('has a timeout fallback when transition events are unavailable', () => {
    const splash = document.getElementById('app-splash')!;
    dismissInitialSplash(immediateFrame);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(210);

    expect(splash.hidden).toBe(true);
  });

  it('shows the same overlay for a newly opened book', async () => {
    const app = document.getElementById('app')!;
    const splash = document.getElementById('app-splash')!;
    splash.hidden = true;
    app.removeAttribute('inert');
    app.removeAttribute('aria-hidden');

    await showLoadingOverlay('Открываем книгу…', immediateFrame);

    expect(splash.hidden).toBe(false);
    expect(splash.dataset.motionState).toBe('open');
    expect(document.getElementById('app-splash-label')?.textContent).toBe('Открываем книгу…');
    expect(app.hasAttribute('inert')).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(app.getAttribute('aria-busy')).toBe('true');
  });

  it('does not let an interrupted exit hide a restarted loading state', async () => {
    const splash = document.getElementById('app-splash')!;
    hideLoadingOverlay();
    expect(splash.dataset.motionState).toBe('closing');

    await showLoadingOverlay('Открываем книгу…', immediateFrame);
    vi.advanceTimersByTime(300);

    expect(splash.hidden).toBe(false);
    expect(splash.dataset.motionState).toBe('open');
    expect(document.getElementById('app')?.hasAttribute('inert')).toBe(true);
  });

  it('restores the application after a repeated loading state finishes', async () => {
    const app = document.getElementById('app')!;
    const splash = document.getElementById('app-splash')!;
    splash.hidden = true;
    app.removeAttribute('inert');
    app.removeAttribute('aria-hidden');

    await showLoadingOverlay('Открываем книгу…', immediateFrame);
    hideLoadingOverlay();
    splash.dispatchEvent(new TransitionEvent('transitionend', {
      propertyName: 'opacity',
    }));

    expect(splash.hidden).toBe(true);
    expect(app.hasAttribute('inert')).toBe(false);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
    expect(app.hasAttribute('aria-busy')).toBe(false);
  });
});
