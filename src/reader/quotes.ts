import { quoteId, type QuoteRecord, type TextLocator } from './state';

const CONTEXT_LENGTH = 80;
const PREVIEW_HIGHLIGHT_NAME = 'reader-quote-preview';

export interface LocatedSelection {
  start: TextLocator;
  end: TextLocator;
  exact: string;
  prefix: string;
  suffix: string;
  range: Range;
  id: string;
}

function parentElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function anchorFor(node: Node, root: HTMLElement): HTMLElement | undefined {
  const anchor = parentElement(node)?.closest<HTMLElement>('[data-reader-anchor]');
  return anchor && root.contains(anchor) ? anchor : undefined;
}

function offsetInAnchor(anchor: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(anchor);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

export function locateSelection(
  root: HTMLElement,
  bookFingerprint: string,
  selection: Selection | null = window.getSelection(),
): LocatedSelection | undefined {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0).cloneRange();
  const startAnchor = anchorFor(range.startContainer, root);
  const endAnchor = anchorFor(range.endContainer, root);
  const startId = startAnchor?.dataset.readerAnchor;
  const endId = endAnchor?.dataset.readerAnchor;
  const exact = range.toString();
  if (!startAnchor || !endAnchor || startId === undefined || endId === undefined || !exact.trim()) {
    return undefined;
  }

  const start: TextLocator = {
    anchor: startId,
    offset: offsetInAnchor(startAnchor, range.startContainer, range.startOffset),
  };
  const end: TextLocator = {
    anchor: endId,
    offset: offsetInAnchor(endAnchor, range.endContainer, range.endOffset),
  };
  const startText = startAnchor.textContent ?? '';
  const endText = endAnchor.textContent ?? '';
  return {
    start,
    end,
    exact,
    prefix: startText.slice(Math.max(0, start.offset - CONTEXT_LENGTH), start.offset),
    suffix: endText.slice(end.offset, end.offset + CONTEXT_LENGTH),
    range,
    id: quoteId(bookFingerprint, start, end),
  };
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest('script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const result: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    result.push(node as Text);
    node = walker.nextNode();
  }
  return result;
}

function boundaryAt(anchor: HTMLElement, requestedOffset: number): { node: Node; offset: number } {
  const nodes = textNodes(anchor);
  if (!nodes.length) return { node: anchor, offset: 0 };
  const total = nodes.reduce((sum, node) => sum + node.data.length, 0);
  const target = Math.max(0, Math.min(total, requestedOffset));
  let consumed = 0;
  for (const node of nodes) {
    const end = consumed + node.data.length;
    if (target <= end) return { node, offset: target - consumed };
    consumed = end;
  }
  const last = nodes.at(-1)!;
  return { node: last, offset: last.data.length };
}

export function rangeForLocators(
  root: HTMLElement,
  start: TextLocator,
  end: TextLocator,
): Range | undefined {
  const startAnchor = root.querySelector<HTMLElement>(
    `[data-reader-anchor="${CSS.escape(start.anchor)}"]`,
  );
  const endAnchor = root.querySelector<HTMLElement>(
    `[data-reader-anchor="${CSS.escape(end.anchor)}"]`,
  );
  if (!startAnchor || !endAnchor) return undefined;
  const startBoundary = boundaryAt(startAnchor, start.offset);
  const endBoundary = boundaryAt(endAnchor, end.offset);
  const range = document.createRange();
  try {
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
  } catch {
    return undefined;
  }
  return range;
}

function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function rangeForQuote(root: HTMLElement, quote: QuoteRecord): Range | undefined {
  const direct = rangeForLocators(root, quote.start, quote.end);
  if (direct && normalized(direct.toString()) === normalized(quote.exact)) return direct;

  const anchors = Array.from(root.querySelectorAll<HTMLElement>('[data-reader-anchor]'));
  const expectedStart = anchors.findIndex((anchor) => anchor.dataset.readerAnchor === quote.start.anchor);
  const expectedEnd = anchors.findIndex((anchor) => anchor.dataset.readerAnchor === quote.end.anchor);
  if (expectedStart < 0 || expectedEnd < expectedStart || !quote.exact) return undefined;
  const candidates = anchors.slice(expectedStart, expectedEnd + 1);
  const combined = candidates.map((anchor) => anchor.textContent ?? '').join('');
  const matches: Array<{ index: number; contextScore: number; distance: number }> = [];
  let cursor = combined.indexOf(quote.exact);
  while (cursor >= 0) {
    const before = combined.slice(Math.max(0, cursor - quote.prefix.length), cursor);
    const afterIndex = cursor + quote.exact.length;
    const after = combined.slice(afterIndex, afterIndex + quote.suffix.length);
    const prefixMatches = !quote.prefix || normalized(before).endsWith(normalized(quote.prefix));
    const suffixMatches = !quote.suffix || normalized(after).startsWith(normalized(quote.suffix));
    matches.push({
      index: cursor,
      contextScore: Number(prefixMatches) + Number(suffixMatches),
      distance: Math.abs(cursor - quote.start.offset),
    });
    cursor = combined.indexOf(quote.exact, cursor + 1);
  }
  matches.sort((first, second) => (
    second.contextScore - first.contextScore
    || first.distance - second.distance
    || first.index - second.index
  ));
  const index = matches[0]?.index;
  if (index === undefined) return undefined;

  const boundary = (globalOffset: number): { anchor: HTMLElement; offset: number } => {
    let consumed = 0;
    for (const anchor of candidates) {
      const length = anchor.textContent?.length ?? 0;
      if (globalOffset <= consumed + length) return { anchor, offset: globalOffset - consumed };
      consumed += length;
    }
    const anchor = candidates.at(-1)!;
    return { anchor, offset: anchor.textContent?.length ?? 0 };
  };
  const start = boundary(index);
  const end = boundary(index + quote.exact.length);
  const startPoint = boundaryAt(start.anchor, start.offset);
  const endPoint = boundaryAt(end.anchor, end.offset);
  const recovered = document.createRange();
  recovered.setStart(startPoint.node, startPoint.offset);
  recovered.setEnd(endPoint.node, endPoint.offset);
  return recovered;
}

function unwrapHighlights(root: HTMLElement): void {
  for (const mark of root.querySelectorAll<HTMLElement>('mark[data-reader-quote]')) {
    mark.replaceWith(...Array.from(mark.childNodes));
  }
  root.normalize();
}

function anchorsInRange(root: HTMLElement, start: HTMLElement, end: HTMLElement): HTMLElement[] {
  const anchors = Array.from(root.querySelectorAll<HTMLElement>('[data-reader-anchor]'));
  const startIndex = anchors.indexOf(start);
  const endIndex = anchors.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) return [];
  return anchors.slice(startIndex, endIndex + 1);
}

function wrapAnchorSlice(
  anchor: HTMLElement,
  startOffset: number,
  endOffset: number,
  quote: QuoteRecord,
): void {
  const nodes = textNodes(anchor);
  let consumed = 0;
  for (const original of nodes) {
    const nodeStart = consumed;
    const nodeEnd = nodeStart + original.data.length;
    consumed = nodeEnd;
    const from = Math.max(startOffset, nodeStart);
    const to = Math.min(endOffset, nodeEnd);
    if (from >= to) continue;

    let selected = original;
    const relativeStart = from - nodeStart;
    const selectedLength = to - from;
    if (relativeStart > 0) selected = selected.splitText(relativeStart);
    if (selectedLength < selected.data.length) selected.splitText(selectedLength);
    const mark = document.createElement('mark');
    mark.className = 'reader-quote-highlight';
    mark.dataset.readerQuote = quote.id;
    mark.dataset.quoteColor = quote.color;
    selected.replaceWith(mark);
    mark.append(selected);
  }
}

function wrapPreviewAnchorSlice(
  anchor: HTMLElement,
  startOffset: number,
  endOffset: number,
  color: QuoteRecord['color'],
): void {
  const nodes = textNodes(anchor);
  let consumed = 0;
  for (const original of nodes) {
    const nodeStart = consumed;
    const nodeEnd = nodeStart + original.data.length;
    consumed = nodeEnd;
    const from = Math.max(startOffset, nodeStart);
    const to = Math.min(endOffset, nodeEnd);
    if (from >= to) continue;

    let selected = original;
    const relativeStart = from - nodeStart;
    const selectedLength = to - from;
    if (relativeStart > 0) selected = selected.splitText(relativeStart);
    if (selectedLength < selected.data.length) selected.splitText(selectedLength);
    const mark = document.createElement('mark');
    mark.className = 'reader-quote-preview';
    mark.dataset.readerQuotePreview = '';
    mark.dataset.quoteColor = color;
    selected.replaceWith(mark);
    mark.append(selected);
  }
}

interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
}

interface HighlightWindow extends Window {
  Highlight?: new (...ranges: Range[]) => unknown;
}

export class QuotePreviewHighlight {
  private color: QuoteRecord['color'] = 'purple';
  private usingCssHighlight = false;

  constructor(private readonly root: HTMLElement) {}

  show(range: Range, color: QuoteRecord['color']): void {
    this.clear();
    this.setColor(color);
    const registry = typeof CSS === 'undefined'
      ? undefined
      : (CSS as typeof CSS & { highlights?: HighlightRegistryLike }).highlights;
    const HighlightConstructor = (window as HighlightWindow).Highlight;
    if (registry && HighlightConstructor) {
      registry.set(PREVIEW_HIGHLIGHT_NAME, new HighlightConstructor(range.cloneRange()));
      this.usingCssHighlight = true;
      return;
    }

    const start = anchorFor(range.startContainer, this.root);
    const end = anchorFor(range.endContainer, this.root);
    if (!start || !end) return;
    const anchors = anchorsInRange(this.root, start, end);
    const startOffset = offsetInAnchor(start, range.startContainer, range.startOffset);
    const endOffset = offsetInAnchor(end, range.endContainer, range.endOffset);
    for (const anchor of anchors) {
      const length = anchor.textContent?.length ?? 0;
      wrapPreviewAnchorSlice(
        anchor,
        anchor === start ? startOffset : 0,
        anchor === end ? endOffset : length,
        this.color,
      );
    }
  }

  setColor(color: QuoteRecord['color']): void {
    this.color = color;
    this.root.ownerDocument.documentElement.dataset.quotePreviewColor = color;
    for (const mark of this.root.querySelectorAll<HTMLElement>('[data-reader-quote-preview]')) {
      mark.dataset.quoteColor = color;
    }
  }

  clear(): void {
    const registry = typeof CSS === 'undefined'
      ? undefined
      : (CSS as typeof CSS & { highlights?: HighlightRegistryLike }).highlights;
    if (this.usingCssHighlight) registry?.delete(PREVIEW_HIGHLIGHT_NAME);
    this.usingCssHighlight = false;
    const marks = Array.from(
      this.root.querySelectorAll<HTMLElement>('[data-reader-quote-preview]'),
    );
    for (const mark of marks) {
      mark.replaceWith(...Array.from(mark.childNodes));
    }
    if (marks.length) this.root.normalize();
    delete this.root.ownerDocument.documentElement.dataset.quotePreviewColor;
  }
}

function applyQuote(root: HTMLElement, quote: QuoteRecord): boolean {
  const range = rangeForQuote(root, quote);
  if (!range) return false;
  const start = anchorFor(range.startContainer, root);
  const end = anchorFor(range.endContainer, root);
  if (!start || !end) return false;
  const anchors = anchorsInRange(root, start, end);
  if (!anchors.length) return false;
  const resolvedStart = offsetInAnchor(start, range.startContainer, range.startOffset);
  const resolvedEnd = offsetInAnchor(end, range.endContainer, range.endOffset);
  for (const anchor of anchors) {
    const length = anchor.textContent?.length ?? 0;
    const startOffset = anchor === start ? resolvedStart : 0;
    const endOffset = anchor === end ? resolvedEnd : length;
    wrapAnchorSlice(anchor, startOffset, endOffset, quote);
  }
  return true;
}

export function applyQuoteHighlights(root: HTMLElement, quotes: readonly QuoteRecord[]): void {
  unwrapHighlights(root);
  for (const quote of quotes) applyQuote(root, quote);
}

export function restoreSelection(
  root: HTMLElement,
  quote: Pick<QuoteRecord, 'start' | 'end'> & Partial<Pick<QuoteRecord, 'exact' | 'prefix' | 'suffix'>>,
): void {
  const range = quote.exact === undefined
    ? rangeForLocators(root, quote.start, quote.end)
    : rangeForQuote(root, quote as QuoteRecord);
  if (!range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
