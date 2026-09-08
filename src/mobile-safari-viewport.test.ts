import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserChromeBottomInset,
  isMobileSafari,
  isStandaloneDisplay,
  MobileSafariViewportController,
} from './mobile-safari-viewport';

const MOBILE_SAFARI_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';

class TestMediaQueryList extends EventTarget {
  matches = false;
  media = '(display-mode: standalone)';
  onchange = null;
  addListener(): void {}
  removeListener(): void {}
  dispatchChange(): void {
    this.dispatchEvent(new Event('change'));
  }
}

class TestVisualViewport extends EventTarget {
  constructor(
    public height: number,
    public offsetTop = 0,
  ) {
    super();
  }
}

describe('mobile Safari viewport compensation', () => {
  const originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
  const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
  const originalTouchPoints = Object.getOwnPropertyDescriptor(window.navigator, 'maxTouchPoints');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => window.clearTimeout(frame));
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: MOBILE_SAFARI_USER_AGENT,
    });
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'iPhone',
    });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalUserAgent) Object.defineProperty(window.navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(window.navigator, 'platform', originalPlatform);
    if (originalTouchPoints) Object.defineProperty(window.navigator, 'maxTouchPoints', originalTouchPoints);
  });

  it('recognizes Safari on iPhone and iPad desktop mode', () => {
    expect(isMobileSafari(window.navigator)).toBe(true);
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
    });
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' });
    expect(isMobileSafari(window.navigator)).toBe(true);
  });

  it('does not target alternate iOS browsers', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: MOBILE_SAFARI_USER_AGENT.replace('Version/26.0', 'CriOS/140.0'),
    });
    expect(isMobileSafari(window.navigator)).toBe(false);
  });

  it('detects both standard and legacy standalone modes', () => {
    expect(isStandaloneDisplay(window.navigator, true)).toBe(true);
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });
    expect(isStandaloneDisplay(window.navigator, false)).toBe(true);
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: false });
    expect(isStandaloneDisplay(window.navigator, false)).toBe(false);
  });

  it('returns only browser-chrome-sized bottom occlusion', () => {
    expect(browserChromeBottomInset(800, 800, 724.4, 0)).toBe(76);
    expect(browserChromeBottomInset(800, 800, 800, 0)).toBe(0);
    expect(browserChromeBottomInset(800, 800, 420, 0)).toBe(0);
  });

  it('updates the footer without changing shell geometry and clears listeners', () => {
    const shell = document.createElement('main');
    const footer = document.createElement('footer');
    const visualViewport = new TestVisualViewport(724);
    const standaloneQuery = new TestMediaQueryList();
    Object.defineProperty(shell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 800,
        height: 800,
        left: 0,
        right: 390,
        top: 0,
        width: 390,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    const testWindow = Object.create(window) as Window;
    Object.defineProperties(testWindow, {
      navigator: { configurable: true, value: window.navigator },
      visualViewport: { configurable: true, value: visualViewport },
      matchMedia: { configurable: true, value: () => standaloneQuery },
      requestAnimationFrame: { configurable: true, value: requestAnimationFrame },
      cancelAnimationFrame: { configurable: true, value: cancelAnimationFrame },
    });
    const controller = new MobileSafariViewportController(shell, footer, testWindow);

    controller.start();
    expect(footer.style.getPropertyValue('--mobile-browser-bottom-inset')).toBe('76px');

    visualViewport.height = 750;
    visualViewport.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(footer.style.getPropertyValue('--mobile-browser-bottom-inset')).toBe('50px');

    standaloneQuery.matches = true;
    standaloneQuery.dispatchChange();
    vi.runAllTimers();
    expect(footer.style.getPropertyValue('--mobile-browser-bottom-inset')).toBe('0px');

    controller.destroy();
    expect(footer.style.getPropertyValue('--mobile-browser-bottom-inset')).toBe('');
    standaloneQuery.matches = false;
    visualViewport.height = 700;
    visualViewport.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    expect(footer.style.getPropertyValue('--mobile-browser-bottom-inset')).toBe('');
  });
});
