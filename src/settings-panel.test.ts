import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanelController } from './settings-panel';

describe('SettingsPanelController', () => {
  let controller: SettingsPanelController;
  let button: HTMLButtonElement;
  let panel: HTMLElement;
  let backdrop: HTMLElement;
  let closeButton: HTMLButtonElement;
  let mobile = false;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: mobile,
      media: '(max-width: 640px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    document.body.innerHTML = `
      <button id="settings-button" aria-expanded="false">Настройки</button>
      <div id="settings-backdrop" hidden></div>
      <section id="settings-panel" hidden>
        <button id="settings-close">Закрыть</button>
        <button id="font-down">A−</button>
        <label><input type="radio" name="theme" checked /> Светлая</label>
      </section>
    `;
    button = document.querySelector('#settings-button') as HTMLButtonElement;
    panel = document.querySelector('#settings-panel') as HTMLElement;
    backdrop = document.querySelector('#settings-backdrop') as HTMLElement;
    closeButton = document.querySelector('#settings-close') as HTMLButtonElement;
    controller = new SettingsPanelController({ button, panel, backdrop, closeButton });
  });

  afterEach(() => {
    controller.destroy();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    mobile = false;
  });

  it('opens from the settings button and stays open after an internal click', () => {
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(closeButton);

    (panel.querySelector('input') as HTMLInputElement).click();

    expect(panel.hidden).toBe(false);
  });

  it('closes on Escape and returns focus to the settings button', () => {
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('closes on an outside pointer interaction', () => {
    button.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(panel.hidden).toBe(true);
  });

  it('shows a modal backdrop on mobile', () => {
    controller.destroy();
    mobile = true;
    controller = new SettingsPanelController({ button, panel, backdrop, closeButton });

    button.click();

    expect(backdrop.hidden).toBe(false);
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('closes when the mobile backdrop is clicked', () => {
    controller.destroy();
    mobile = true;
    controller = new SettingsPanelController({ button, panel, backdrop, closeButton });
    button.click();

    backdrop.click();

    expect(panel.hidden).toBe(true);
    expect(backdrop.hidden).toBe(true);
  });
});
