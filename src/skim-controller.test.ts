import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkimController, type SkimElements } from './skim-controller';
import { type PagerSnapshot, type ReaderPager, type SkimTarget } from './reader/pager';

function target(page: number): SkimTarget {
  return {
    currentPage: page,
    lastPage: page,
    totalPages: 100,
    pagesPerView: 1,
    progress: page,
    chunkIndex: 0,
    chunkPage: page,
    bookGeneration: 1,
    layoutKey: 'layout',
  };
}

function snapshot(page = 12): PagerSnapshot {
  return {
    currentPage: page,
    totalPages: 100,
    pagesPerView: 1,
    progress: page,
    anchor: 'start',
    anchorVisible: true,
    paginationExact: true,
    chunkIndex: 0,
    chunkPage: page,
  };
}

describe('SkimController', () => {
  let elements: SkimElements;
  let pager: ReaderPager;
  let commitSkim: ReturnType<typeof vi.fn>;
  let committed: ReturnType<typeof vi.fn<() => void>>;
  let controller: SkimController;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="group">
        <input id="input" type="range" min="1" max="100" value="12">
        <aside id="popover" hidden>
          <strong id="chapter"></strong>
          <div id="preview"></div>
          <span id="page"></span>
          <span id="hint"></span>
        </aside>
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>('#input')!;
    Object.defineProperty(input, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 100, width: 100 } as DOMRect),
    });
    elements = {
      group: document.querySelector('#group')!,
      input,
      popover: document.querySelector('#popover')!,
      chapter: document.querySelector('#chapter')!,
      page: document.querySelector('#page')!,
      preview: document.querySelector('#preview')!,
      hint: document.querySelector('#hint')!,
    };
    commitSkim = vi.fn(() => true);
    pager = {
      skimTarget: vi.fn((page: number) => target(page)),
      renderSkimPreview: vi.fn((_target: SkimTarget, host: HTMLElement) => {
        host.textContent = 'preview';
        return 'chapter';
      }),
      commitSkim,
    } as unknown as ReaderPager;
    committed = vi.fn<() => void>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    controller = new SkimController(elements, pager, {
      chapterForAnchor: () => 'Chapter',
      committed,
    });
    controller.sync(snapshot());
  });

  it('previews keyboard changes without committing them', () => {
    elements.input.focus();
    elements.input.value = '45';
    elements.input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(elements.popover.hidden).toBe(false);
    expect(elements.chapter.textContent).toBe('Chapter');
    expect(elements.page.textContent).toContain('45');
    expect(commitSkim).not.toHaveBeenCalled();

    elements.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(elements.popover.hidden).toBe(true);
    expect(elements.input.value).toBe('12');
    expect(commitSkim).not.toHaveBeenCalled();
  });

  it('commits a keyboard preview only when Enter is pressed', () => {
    elements.input.focus();
    elements.input.value = '67';
    elements.input.dispatchEvent(new Event('input', { bubbles: true }));
    elements.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(commitSkim).toHaveBeenCalledWith(expect.objectContaining({ currentPage: 67 }));
    expect(committed).toHaveBeenCalledOnce();
  });

  it('moves keyboard previews by a whole spread in two-page mode', () => {
    vi.mocked(pager.skimTarget).mockImplementation((page: number) => ({
      ...target(Math.floor((page - 1) / 2) * 2 + 1),
      lastPage: Math.floor((page - 1) / 2) * 2 + 2,
      pagesPerView: 2,
    }));
    controller.sync({ ...snapshot(5), pagesPerView: 2 });
    elements.input.focus();

    elements.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(elements.input.value).toBe('7');
    expect(commitSkim).not.toHaveBeenCalled();
  });

  it('shows a hover preview and removes it without committing', () => {
    const move = new Event('pointermove', { bubbles: true });
    Object.assign(move, { clientX: 80, pointerType: 'mouse', pointerId: 1 });
    elements.input.dispatchEvent(move);

    expect(elements.popover.hidden).toBe(false);
    expect(elements.input.value).toBe('80');

    elements.input.dispatchEvent(new Event('pointerleave', { bubbles: true }));

    expect(elements.popover.hidden).toBe(true);
    expect(elements.input.value).toBe('12');
    expect(commitSkim).not.toHaveBeenCalled();
  });

  it('commits a pointer drag on release and cancels an interrupted drag', () => {
    const pointer = (type: string, clientX: number, pointerId: number): Event => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, {
        button: 0,
        clientX,
        isPrimary: true,
        pointerId,
        pointerType: 'mouse',
      });
      return event;
    };

    elements.input.dispatchEvent(pointer('pointerdown', 40, 3));
    elements.input.dispatchEvent(pointer('pointermove', 70, 3));
    expect(commitSkim).not.toHaveBeenCalled();
    elements.input.dispatchEvent(pointer('pointerup', 70, 3));

    expect(commitSkim).toHaveBeenCalledWith(expect.objectContaining({ currentPage: 70 }));
    expect(committed).toHaveBeenCalledOnce();

    commitSkim.mockClear();
    elements.input.dispatchEvent(pointer('pointerdown', 55, 4));
    elements.input.dispatchEvent(pointer('pointercancel', 55, 4));

    expect(commitSkim).not.toHaveBeenCalled();
    expect(elements.input.value).toBe('12');
  });
});
