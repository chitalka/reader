import { t } from '../i18n';

const MAX_CHUNK_ANCHORS = 96;

function anchorCount(element: HTMLElement): number {
  return (element.dataset.readerAnchor === undefined ? 0 : 1)
    + element.querySelectorAll('[data-reader-anchor]').length;
}

function splitOversizedNode(element: HTMLElement): HTMLElement[] {
  if (anchorCount(element) <= MAX_CHUNK_ANCHORS) return [element];

  const pieces: HTMLElement[] = [];
  let isFirstPiece = true;
  const createShell = (): HTMLElement => {
    const shell = element.cloneNode(false) as HTMLElement;
    if (!isFirstPiece) {
      shell.removeAttribute('id');
      delete shell.dataset.readerAnchor;
    }
    isFirstPiece = false;
    return shell;
  };

  let shell = createShell();
  let shellAnchors = shell.dataset.readerAnchor === undefined ? 0 : 1;
  const flush = (): void => {
    if (shell.childNodes.length) pieces.push(shell);
    shell = createShell();
    shellAnchors = 0;
  };

  for (const child of Array.from(element.childNodes)) {
    if (child instanceof HTMLElement && anchorCount(child) > MAX_CHUNK_ANCHORS) {
      for (const childPiece of splitOversizedNode(child)) {
        const childAnchors = anchorCount(childPiece);
        if (shell.childNodes.length && shellAnchors + childAnchors > MAX_CHUNK_ANCHORS) flush();
        shell.append(childPiece);
        shellAnchors += childAnchors;
        if (shellAnchors >= MAX_CHUNK_ANCHORS) flush();
      }
      continue;
    }

    const childAnchors = child instanceof HTMLElement ? anchorCount(child) : 0;
    if (shell.childNodes.length && shellAnchors + childAnchors > MAX_CHUNK_ANCHORS) flush();
    shell.append(child);
    shellAnchors += childAnchors;
  }
  if (shell.childNodes.length) pieces.push(shell);
  return pieces;
}

export function appendBookChunks(
  book: HTMLElement,
  nodes: HTMLElement[],
  notes = false,
): void {
  let pending: HTMLElement[] = [];
  let pendingAnchors = 0;
  let pendingSections = 0;
  const flush = (): void => {
    if (!pending.length) return;
    const chunk = document.createElement(notes ? 'aside' : 'div');
    chunk.className = notes ? 'book-chunk book-notes' : 'book-chunk';
    chunk.dataset.readerChunk = '';
    if (notes) {
      chunk.dataset.readerNotes = '';
      chunk.setAttribute('aria-label', t('reader.footnotes'));
    }
    chunk.append(...pending);
    book.append(chunk);
    pending = [];
    pendingAnchors = 0;
    pendingSections = 0;
  };

  for (const node of nodes.flatMap(splitOversizedNode)) {
    const nodeAnchors = anchorCount(node);
    if (pending.length && pendingAnchors + nodeAnchors > MAX_CHUNK_ANCHORS) flush();
    pending.push(node);
    pendingAnchors += nodeAnchors;
    if (node.classList.contains('book-section')) {
      pendingSections += 1;
      if (!notes || pendingSections >= 12 || pendingAnchors >= MAX_CHUNK_ANCHORS) flush();
    }
  }
  flush();
}
