const MAX_BROWSER_CHROME_INSET = 160;
const MAX_BROWSER_CHROME_RATIO = 0.32;
const INSET_STYLE_PROPERTY = '--mobile-browser-bottom-inset';

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

export function isStandaloneDisplay(
  navigatorValue: IOSNavigator,
  standaloneQueryMatches: boolean,
): boolean {
  return standaloneQueryMatches || navigatorValue.standalone === true;
}

export function isMobileSafari(navigatorValue: Navigator): boolean {
  const userAgent = navigatorValue.userAgent;
  const isIOS = /iPad|iPhone|iPod/u.test(userAgent)
    || (navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1);
  const isSafari = /Safari/u.test(userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/u.test(userAgent);
  return isIOS && isSafari;
}

export function browserChromeBottomInset(
  shellBottom: number,
  shellHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
): number {
  const visualViewportBottom = visualViewportHeight + visualViewportOffsetTop;
  const obscuredHeight = Math.max(0, shellBottom - visualViewportBottom);
  const maximumInset = Math.min(
    MAX_BROWSER_CHROME_INSET,
    Math.max(0, shellHeight) * MAX_BROWSER_CHROME_RATIO,
  );

  if (obscuredHeight < 1 || obscuredHeight > maximumInset) return 0;
  return Math.ceil(obscuredHeight);
}

export class MobileSafariViewportController {
  private readonly standaloneQuery: MediaQueryList;
  private frame?: number;
  private started = false;

  constructor(
    private readonly shell: HTMLElement,
    private readonly footer: HTMLElement,
    private readonly browserWindow: Window = window,
  ) {
    this.standaloneQuery = browserWindow.matchMedia('(display-mode: standalone)');
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.standaloneQuery.addEventListener('change', this.handleEnvironmentChange);
    this.browserWindow.addEventListener('orientationchange', this.handleEnvironmentChange);
    this.bindVisualViewport(true);
    this.update();
  }

  destroy(): void {
    if (!this.started) return;
    this.started = false;
    this.standaloneQuery.removeEventListener('change', this.handleEnvironmentChange);
    this.browserWindow.removeEventListener('orientationchange', this.handleEnvironmentChange);
    this.bindVisualViewport(false);
    if (this.frame !== undefined) this.browserWindow.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.footer.style.removeProperty(INSET_STYLE_PROPERTY);
  }

  private readonly handleEnvironmentChange = (): void => {
    this.scheduleUpdate();
  };

  private bindVisualViewport(add: boolean): void {
    const visualViewport = this.browserWindow.visualViewport;
    if (!visualViewport) return;
    const method = add ? 'addEventListener' : 'removeEventListener';
    visualViewport[method]('resize', this.handleEnvironmentChange);
    visualViewport[method]('scroll', this.handleEnvironmentChange);
  }

  private scheduleUpdate(): void {
    if (this.frame !== undefined) return;
    this.frame = this.browserWindow.requestAnimationFrame(() => {
      this.frame = undefined;
      this.update();
    });
  }

  private update(): void {
    const visualViewport = this.browserWindow.visualViewport;
    const standalone = isStandaloneDisplay(
      this.browserWindow.navigator as IOSNavigator,
      this.standaloneQuery.matches,
    );
    if (!visualViewport || standalone || !isMobileSafari(this.browserWindow.navigator)) {
      this.footer.style.setProperty(INSET_STYLE_PROPERTY, '0px');
      return;
    }

    const shellRect = this.shell.getBoundingClientRect();
    const inset = browserChromeBottomInset(
      shellRect.bottom,
      shellRect.height,
      visualViewport.height,
      visualViewport.offsetTop,
    );
    this.footer.style.setProperty(INSET_STYLE_PROPERTY, `${inset}px`);
  }
}
