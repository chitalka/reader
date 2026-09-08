import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TocPanelController } from './toc-panel';

describe('TocPanelController', () => {
  let controller: TocPanelController;
  let button: HTMLButtonElement;
  let panel: HTMLElement;
  let backdrop: HTMLElement;
  let closeButton: HTMLButtonElement;
  let list: HTMLElement;
  let onSelect: Mock<(target: string) => void>;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '(max-width: 640px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    document.body.innerHTML = `
      <button id="toc-button" aria-expanded="false" hidden>Оглавление</button>
      <div id="toc-backdrop" hidden></div>
      <section id="toc-panel" hidden>
        <button id="toc-close">Закрыть</button>
        <nav id="toc-list"></nav>
      </section>
    `;
    button = document.querySelector('#toc-button') as HTMLButtonElement;
    panel = document.querySelector('#toc-panel') as HTMLElement;
    backdrop = document.querySelector('#toc-backdrop') as HTMLElement;
    closeButton = document.querySelector('#toc-close') as HTMLButtonElement;
    list = document.querySelector('#toc-list') as HTMLElement;
    onSelect = vi.fn();
    controller = new TocPanelController(
      { button, panel, backdrop, closeButton, list },
      onSelect,
    );
  });

  afterEach(() => {
    controller.destroy();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('renders hierarchy and navigates from a title', () => {
    controller.setItems([{
      title: 'Часть',
      target: 'part',
      children: [{ title: 'Глава', target: 'chapter', children: [] }],
    }]);

    expect(button.hidden).toBe(false);
    expect(list.querySelectorAll('.toc-list')).toHaveLength(2);
    expect(list.querySelector<HTMLButtonElement>('[data-toc-target="chapter"]')?.title)
      .toBe('Глава');
    button.click();
    (list.querySelector('[data-toc-target="chapter"]') as HTMLButtonElement).click();

    expect(onSelect).toHaveBeenCalledWith('chapter');
    expect(panel.hidden).toBe(true);
  });

  it('marks the deepest matching entry as current', () => {
    controller.setItems([{
      title: 'Часть',
      target: 'same',
      children: [{ title: 'Глава', target: 'same', children: [] }],
    }]);
    controller.setActive('same');

    const current = list.querySelector('[aria-current="location"]');
    expect(current?.getAttribute('title')).toBe('Глава');
    expect(list.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('reveals the current chapter, preserves a manual collapse and reveals it on reopening', () => {
    controller.setItems([{
      title: 'Часть', target: 'part',
      children: [{ title: 'Глава', target: 'chapter', children: [] }],
    }]);
    const branch = list.querySelector('details')!;
    expect(branch.open).toBe(false);
    controller.setActive('chapter');
    expect(branch.open).toBe(true);
    button.click();
    branch.open = false;
    controller.setActive('chapter');
    expect(branch.open).toBe(false);
    closeButton.click();
    button.click();
    expect(branch.open).toBe(true);
    expect(document.activeElement?.getAttribute('data-toc-target')).toBe('chapter');
  });

  it('wraps keyboard focus through collapsed summaries without entering hidden chapters', () => {
    controller.setItems([{
      title: 'Часть', target: 'part',
      children: [{ title: 'Глава', target: 'chapter', children: [] }],
    }]);
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(list.querySelector('summary'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps section targets reachable and clears old expansion and current state for a new book', () => {
    const items = [{ title: 'Часть', target: 'part', children: [{ title: 'Глава', target: 'chapter', children: [] }] }];
    controller.setItems(items);
    controller.setActive('part');
    button.click();
    (list.querySelector('[data-toc-target="part"]') as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith('part');
    controller.setItems(items);
    expect(list.querySelector('details')?.open).toBe(false);
    expect(list.querySelector('[aria-current]')).toBeNull();
    expect(panel.hidden).toBe(true);
  });

  it('hides the control when the book has no usable entries', () => {
    controller.setItems([]);
    expect(button.hidden).toBe(true);
    expect(list.childElementCount).toBe(0);
  });

  it('closes with Escape and restores focus', () => {
    controller.setItems([{ title: 'Глава', target: 'chapter', children: [] }]);
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
