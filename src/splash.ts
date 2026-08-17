import { VisibilityMotion } from './motion';

type FrameScheduler = (callback: FrameRequestCallback) => number;

let splashElement: HTMLElement | undefined;
let splashMotion: VisibilityMotion | undefined;

function elements(): {
  app?: HTMLElement;
  label?: HTMLElement;
  splash?: HTMLElement;
} {
  const splash = document.getElementById('app-splash') ?? undefined;
  return {
    app: document.getElementById('app') ?? undefined,
    label: document.getElementById('app-splash-label') ?? undefined,
    splash,
  };
}

function motionFor(element: HTMLElement): VisibilityMotion {
  if (element !== splashElement || !splashMotion) {
    splashElement = element;
    splashMotion = new VisibilityMotion(element);
  }
  return splashMotion;
}

function setApplicationBlocked(app: HTMLElement | undefined, blocked: boolean): void {
  if (!app) return;
  if (blocked) {
    app.setAttribute('inert', '');
    app.setAttribute('aria-hidden', 'true');
    app.setAttribute('aria-busy', 'true');
    return;
  }
  app.removeAttribute('inert');
  app.removeAttribute('aria-hidden');
  app.removeAttribute('aria-busy');
}

function frameScheduler(scheduleFrame?: FrameScheduler): FrameScheduler {
  if (scheduleFrame) return scheduleFrame;
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame;
  return (callback) => window.setTimeout(() => callback(performance.now()), 16);
}

export async function showLoadingOverlay(
  message = 'Открываем книгу…',
  scheduleFrame?: FrameScheduler,
): Promise<void> {
  const { app, label, splash } = elements();
  if (!splash) return;

  setApplicationBlocked(app, true);
  if (label) label.textContent = message;
  motionFor(splash).show();
  await new Promise<void>((resolve) => frameScheduler(scheduleFrame)(() => resolve()));
}

export function hideLoadingOverlay(): void {
  const { app, splash } = elements();
  if (!splash) {
    setApplicationBlocked(app, false);
    document.documentElement.dataset.appReady = 'true';
    return;
  }

  motionFor(splash).hide(() => {
    setApplicationBlocked(app, false);
    document.documentElement.dataset.appReady = 'true';
  });
}

export function dismissInitialSplash(
  scheduleFrame?: FrameScheduler,
): void {
  const scheduler = frameScheduler(scheduleFrame);
  scheduler(() => scheduler(() => hideLoadingOverlay()));
}
