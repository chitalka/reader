import { appendBookChunks } from '../book/dom';
import { normalizedText, type RenderedBook } from '../book/model';
import { decodeXml } from '../fb2/decode';
import type { ParsedEpub } from './model';
import { resolveArchivePath, resolveEpubReference } from './path';

const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const BLOCKED_ELEMENTS = new Set([
  'audio',
  'button',
  'canvas',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'source',
  'style',
  'textarea',
  'video',
]);
const ANCHORED_ELEMENTS = new Set([
  'blockquote',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'p',
  'pre',
  'table',
]);
const DIRECT_ELEMENTS = new Set([
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'mark',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
]);
const NOTE_TOKENS = new Set(['doc-endnote', 'doc-footnote', 'endnote', 'footnote', 'note', 'rearnote']);
const NOTE_REF_TOKENS = new Set(['doc-noteref', 'noteref']);
const NOTE_CONTAINER_TOKENS = new Set(['endnotes', 'footnotes', 'notes', 'rearnotes']);
const POEM_TOKENS = new Set(['poem', 'verse']);

interface PreparedDocument {
  path: string;
  body: Element;
  index: number;
  rootId: string;
  notes: boolean;
}

interface TargetInfo {
  id: string;
  note: boolean;
  source: Element;
  text: string;
}

function parseContentDocument(bytes: Uint8Array): Document {
  const xml = new DOMParser().parseFromString(decodeXml(bytes), 'application/xml');
  if (!xml.querySelector('parsererror')) return xml;
  return new DOMParser().parseFromString(decodeXml(bytes), 'text/html');
}

function elementByName(parent: Element | Document, localName: string): Element | undefined {
  return Array.from(parent.getElementsByTagNameNS('*', localName))[0];
}

function semanticTokens(element: Element): Set<string> {
  const epubType = Array.from(element.attributes)
    .find((attribute) => attribute.name === 'epub:type' || (
      attribute.localName === 'type' && attribute.namespaceURI?.includes('idpf.org/2007/ops')
    ))?.value;
  return new Set([
    ...(epubType ?? '').split(/\s+/u),
    ...(element.getAttribute('role') ?? '').split(/\s+/u),
    ...(element.getAttribute('class') ?? '').split(/\s+/u),
  ].map((token) => token.toLocaleLowerCase()).filter(Boolean));
}

function hasToken(element: Element, tokens: ReadonlySet<string>): boolean {
  return Array.from(semanticTokens(element)).some((token) => tokens.has(token));
}

function isNoteElement(element: Element): boolean {
  return hasToken(element, NOTE_TOKENS);
}

function documentContainsNotes(body: Element): boolean {
  if (hasToken(body, NOTE_CONTAINER_TOKENS)) return true;
  return Array.from(body.children).some((child) => hasToken(child, NOTE_CONTAINER_TOKENS));
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function inferredMediaType(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLocaleLowerCase();
  return {
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  }[extension ?? ''];
}

function sanitizedSvg(bytes: Uint8Array): Uint8Array | undefined {
  const svg = new DOMParser().parseFromString(decodeXml(bytes), 'image/svg+xml');
  if (svg.querySelector('parsererror') || svg.documentElement.localName !== 'svg') return undefined;
  for (const element of Array.from(svg.getElementsByTagName('*'))) {
    if (['embed', 'foreignObject', 'iframe', 'object', 'script', 'style'].includes(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLocaleLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'style') {
        element.removeAttributeNode(attribute);
        continue;
      }
      if ((name === 'href' || name === 'src') && !value.startsWith('#')) {
        element.removeAttributeNode(attribute);
        continue;
      }
      if (/url\s*\(/iu.test(value) && !/^url\s*\(\s*#[^)]+\s*\)$/iu.test(value)) {
        element.removeAttributeNode(attribute);
      }
    }
  }
  return new TextEncoder().encode(new XMLSerializer().serializeToString(svg.documentElement));
}

function copySafeAttributes(source: Element, target: HTMLElement): void {
  const language = source.getAttribute('lang') || source.getAttribute('xml:lang');
  if (language) target.lang = language;
  const direction = source.getAttribute('dir');
  if (direction && ['auto', 'ltr', 'rtl'].includes(direction)) target.dir = direction;
  const title = source.getAttribute('title');
  if (title) target.title = title;

  for (const attribute of ['colspan', 'rowspan', 'start', 'value']) {
    const raw = source.getAttribute(attribute);
    if (raw && /^\d{1,4}$/u.test(raw)) target.setAttribute(attribute, raw);
  }
  if (source.hasAttribute('reversed')) target.setAttribute('reversed', '');
  const scope = source.getAttribute('scope');
  if (scope && ['col', 'colgroup', 'row', 'rowgroup'].includes(scope)) {
    target.setAttribute('scope', scope);
  }
  const datetime = source.getAttribute('datetime');
  if (target.localName === 'time' && datetime) target.setAttribute('datetime', datetime);
}

export function renderEpub(parsed: ParsedEpub): RenderedBook {
  const manifestByPath = new Map(
    Array.from(parsed.manifest.values()).map((item) => [item.path, item]),
  );
  const prepared: PreparedDocument[] = [];
  const targets = new Map<string, TargetInfo>();
  const targetsBySource = new WeakMap<Element, TargetInfo>();
  let targetCounter = 0;

  for (const [index, spineItem] of parsed.spine.entries()) {
    const bytes = parsed.files.get(spineItem.item.path);
    if (!bytes) continue;
    const contentDocument = parseContentDocument(bytes);
    const body = elementByName(contentDocument, 'body') ?? contentDocument.documentElement;
    const rootId = `epub-document-${index}`;
    const chapter: PreparedDocument = {
      path: spineItem.item.path,
      body,
      index,
      rootId,
      notes: documentContainsNotes(body),
    };
    prepared.push(chapter);
    targets.set(`${chapter.path}#`, {
      id: rootId,
      note: chapter.notes,
      source: body,
      text: normalizedText(body),
    });

    for (const element of Array.from(body.getElementsByTagName('*'))) {
      const originalId = element.getAttribute('id') || (
        element.localName === 'a' ? element.getAttribute('name') : ''
      );
      if (!originalId) continue;
      const info: TargetInfo = {
        id: `epub-target-${index}-${targetCounter++}`,
        note: isNoteElement(element),
        source: element,
        text: normalizedText(element),
      };
      targetsBySource.set(element, info);
      const key = `${chapter.path}#${originalId}`;
      if (!targets.has(key)) targets.set(key, info);
    }
  }

  for (const chapter of prepared) {
    for (const link of Array.from(chapter.body.getElementsByTagNameNS('*', 'a'))) {
      if (!hasToken(link, NOTE_REF_TOKENS)) continue;
      const href = link.getAttribute('href') || link.getAttributeNS(XLINK_NAMESPACE, 'href') || '';
      const reference = resolveEpubReference(chapter.path, href);
      const targetInfo = reference && targets.get(`${reference.path}#${reference.fragment}`);
      if (targetInfo) targetInfo.note = true;
    }
  }

  const imageCache = new Map<string, string>();
  let anchorCounter = 0;
  let coverRendered = false;
  const addAnchor = (element: HTMLElement): void => {
    element.dataset.readerAnchor = String(anchorCounter++);
  };

  const imageDataUrl = (path: string): string | undefined => {
    const cached = imageCache.get(path);
    if (cached) return cached;
    const bytes = parsed.files.get(path);
    if (!bytes) return undefined;
    const mediaType = manifestByPath.get(path)?.mediaType || inferredMediaType(path);
    if (!mediaType?.startsWith('image/')) return undefined;
    const safeBytes = mediaType === 'image/svg+xml' ? sanitizedSvg(bytes) : bytes;
    if (!safeBytes) return undefined;
    const dataUrl = `data:${mediaType};base64,${base64(safeBytes)}`;
    imageCache.set(path, dataUrl);
    return dataUrl;
  };

  const createImage = (path: string, alt = ''): HTMLElement | undefined => {
    const source = imageDataUrl(path);
    if (!source) return undefined;
    const figure = document.createElement('figure');
    figure.className = 'book-image';
    if (path === parsed.coverPath && !coverRendered) {
      figure.classList.add('book-cover');
      coverRendered = true;
    }
    const image = document.createElement('img');
    image.src = source;
    image.alt = alt;
    image.loading = 'eager';
    figure.append(image);
    addAnchor(figure);
    return figure;
  };

  const renderChapter = (chapter: PreparedDocument): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'book-section epub-section';
    section.id = chapter.rootId;
    section.dataset.epubPath = chapter.path;
    addAnchor(section);

    const renderNode = (source: Node): Node | undefined => {
      if (source.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(source.textContent ?? '');
      }
      if (!(source instanceof Element)) return undefined;
      const name = source.localName.toLocaleLowerCase();
      if (BLOCKED_ELEMENTS.has(name)) return undefined;

      if (name === 'img' || name === 'image') {
        const href = source.getAttribute('src')
          || source.getAttributeNS(XLINK_NAMESPACE, 'href')
          || source.getAttribute('href')
          || '';
        const path = resolveArchivePath(chapter.path, href);
        const image = path ? createImage(path, source.getAttribute('alt') ?? '') : undefined;
        const targetInfo = targetsBySource.get(source);
        if (image && targetInfo) image.id = targetInfo.id;
        return image;
      }

      let target: HTMLElement;
      if (name === 'a') {
        target = document.createElement('a');
        target.tabIndex = -1;
        const href = source.getAttribute('href')
          || source.getAttributeNS(XLINK_NAMESPACE, 'href')
          || '';
        const reference = resolveEpubReference(chapter.path, href);
        const targetInfo = reference && targets.get(`${reference.path}#${reference.fragment}`);
        if (targetInfo) {
          target.setAttribute('href', `#${targetInfo.id}`);
          if (hasToken(source, NOTE_REF_TOKENS) || targetInfo.note) {
            target.className = 'footnote-link';
            target.dataset.noteText = targetInfo.text;
          } else {
            target.className = 'book-internal-link';
          }
        }
      } else {
        const targetName = name === 'details'
          ? 'div'
          : name === 'summary'
            ? 'strong'
            : DIRECT_ELEMENTS.has(name) ? name : 'span';
        target = document.createElement(targetName);
      }

      copySafeAttributes(source, target);
      const targetInfo = targetsBySource.get(source);
      if (targetInfo) {
        target.id = targetInfo.id;
        if (targetInfo.note) target.classList.add('book-footnote');
      } else if (isNoteElement(source)) {
        target.classList.add('book-footnote');
      }

      if (name === 'section' || name === 'article') target.classList.add('book-section');
      if (['h1', 'h2'].includes(name)) target.classList.add('book-title');
      if (['h3', 'h4', 'h5', 'h6'].includes(name)) target.classList.add('book-subtitle');
      if (name === 'blockquote') target.classList.add('book-cite');
      if (hasToken(source, POEM_TOKENS)) target.classList.add('book-poem');
      if (ANCHORED_ELEMENTS.has(name)) addAnchor(target);

      if (name !== 'br' && name !== 'hr') {
        for (const child of Array.from(source.childNodes)) {
          const rendered = renderNode(child);
          if (rendered) target.append(rendered);
        }
      }
      return target;
    };

    for (const child of Array.from(chapter.body.childNodes)) {
      const rendered = renderNode(child);
      if (rendered) section.append(rendered);
    }
    return section;
  };

  const renderedChapters = prepared.map((chapter) => ({
    element: renderChapter(chapter),
    notes: chapter.notes,
  }));
  const article = document.createElement('div');
  article.className = 'book epub-book';
  article.lang = parsed.metadata.language || 'ru';

  if (parsed.coverPath && !coverRendered) {
    const cover = createImage(parsed.coverPath, parsed.metadata.title);
    if (cover) appendBookChunks(article, [cover]);
  }
  for (const chapter of renderedChapters) {
    appendBookChunks(article, [chapter.element], chapter.notes);
  }

  const fragment = document.createDocumentFragment();
  fragment.append(article);
  const wordCount = article.textContent?.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return { fragment, metadata: parsed.metadata, wordCount };
}
