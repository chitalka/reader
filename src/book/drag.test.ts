import { describe, expect, it, vi } from 'vitest';
import { hasDraggedFiles, preventBookContentDrag } from './drag';

function dataTransfer(overrides: Partial<DataTransfer>): DataTransfer {
  return {
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    ...overrides,
  } as DataTransfer;
}

describe('book drag prevention', () => {
  it('cancels native dragging for links, images, and ordinary book content', () => {
    const root = document.createElement('article');
    root.innerHTML = '<p>Текст <a href="#note">[1]</a></p><img alt="Иллюстрация">';
    const unbind = preventBookContentDrag(root);
    const linkEvent = new Event('dragstart', { bubbles: true, cancelable: true });
    const imageEvent = new Event('dragstart', { bubbles: true, cancelable: true });

    root.querySelector('a')?.dispatchEvent(linkEvent);
    root.querySelector('img')?.dispatchEvent(imageEvent);

    expect(linkEvent.defaultPrevented).toBe(true);
    expect(imageEvent.defaultPrevented).toBe(true);
    unbind();

    const afterUnbind = new Event('dragstart', { bubbles: true, cancelable: true });
    root.querySelector('a')?.dispatchEvent(afterUnbind);
    expect(afterUnbind.defaultPrevented).toBe(false);
  });

  it('distinguishes external files from dragged text or internal links', () => {
    const file = new File(['book'], 'book.fb2', { type: 'text/xml' });
    const filePayload = dataTransfer({
      files: { 0: file, length: 1, item: vi.fn(() => file) } as unknown as FileList,
      types: ['Files'],
    });
    const linkPayload = dataTransfer({ types: ['text/uri-list', 'text/plain'] });

    expect(hasDraggedFiles(filePayload)).toBe(true);
    expect(hasDraggedFiles(linkPayload)).toBe(false);
    expect(hasDraggedFiles(null)).toBe(false);
  });
});
