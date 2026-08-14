import {
  XLINK_NAMESPACE,
  childElement,
  descendantElement,
  normalizedText,
  type ParsedBook,
  type RenderedBook,
} from './model';

interface BinaryAsset {
  contentType: string;
  content: string;
}

const BLOCK_TAGS = new Set([
  'p',
  'subtitle',
  'title',
  'section',
  'image',
  'poem',
  'cite',
  'epigraph',
]);

const MAX_CHUNK_ANCHORS = 96;

function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function renderFb2(parsed: ParsedBook): RenderedBook {
  const htmlDocument = document;
  const binaryAssets = new Map<string, BinaryAsset>();
  const noteText = new Map<string, string>();
  let anchorCounter = 0;

  for (const binary of Array.from(parsed.document.getElementsByTagNameNS('*', 'binary'))) {
    const id = binary.getAttribute('id');
    const contentType = binary.getAttribute('content-type') || 'application/octet-stream';
    if (id) {
      binaryAssets.set(id, {
        contentType,
        content: normalizedText(binary).replace(/\s+/gu, ''),
      });
    }
  }

  const bodies = Array.from(parsed.document.getElementsByTagNameNS('*', 'body'));
  const notesBody = bodies.find((body) => body.getAttribute('name') === 'notes');
  if (notesBody) {
    for (const section of Array.from(notesBody.getElementsByTagNameNS('*', 'section'))) {
      const id = section.getAttribute('id');
      if (id) {
        noteText.set(id, normalizedText(section));
      }
    }
  }

  const addAnchor = (element: HTMLElement): void => {
    element.dataset.readerAnchor = String(anchorCounter++);
  };

  const appendChildren = (source: Node, target: Node, depth: number): void => {
    for (const child of Array.from(source.childNodes)) {
      const rendered = renderNode(child, depth);
      if (rendered) {
        target.appendChild(rendered);
      }
    }
  };

  const renderImage = (source: Element): HTMLElement | undefined => {
    const href = source.getAttributeNS(XLINK_NAMESPACE, 'href')
      || source.getAttribute('l:href')
      || source.getAttribute('href')
      || '';
    const figure = htmlDocument.createElement('figure');
    const image = htmlDocument.createElement('img');
    const asset = href.startsWith('#') ? binaryAssets.get(href.slice(1)) : undefined;

    if (asset?.contentType.startsWith('image/')) {
      image.src = `data:${asset.contentType};base64,${asset.content}`;
    } else {
      const externalUrl = safeExternalUrl(href);
      if (!externalUrl) {
        return undefined;
      }
      image.src = externalUrl;
    }

    image.alt = '';
    image.loading = 'eager';
    figure.className = 'book-image';
    figure.append(image);
    addAnchor(figure);
    return figure;
  };

  const renderNode = (source: Node, depth: number): Node | undefined => {
    if (source.nodeType === Node.TEXT_NODE) {
      return htmlDocument.createTextNode(source.textContent ?? '');
    }
    if (!(source instanceof Element)) {
      return undefined;
    }

    const name = source.localName;
    let target: HTMLElement;

    switch (name) {
      case 'section': {
        target = htmlDocument.createElement('section');
        target.className = 'book-section';
        const id = source.getAttribute('id');
        if (id) target.id = id;
        addAnchor(target);
        appendChildren(source, target, depth + 1);
        return target;
      }
      case 'title': {
        const headingLevel = Math.min(6, Math.max(1, depth + 1));
        target = htmlDocument.createElement(`h${headingLevel}`);
        target.className = 'book-title';
        addAnchor(target);
        appendChildren(source, target, depth);
        return target;
      }
      case 'subtitle':
        target = htmlDocument.createElement('h4');
        target.className = 'book-subtitle';
        break;
      case 'p':
        target = htmlDocument.createElement('p');
        break;
      case 'strong':
        target = htmlDocument.createElement('strong');
        break;
      case 'emphasis':
        target = htmlDocument.createElement('em');
        break;
      case 'sup':
        target = htmlDocument.createElement('sup');
        break;
      case 'sub':
        target = htmlDocument.createElement('sub');
        break;
      case 'style':
        target = htmlDocument.createElement('span');
        break;
      case 'empty-line':
        return htmlDocument.createElement('br');
      case 'a': {
        target = htmlDocument.createElement('a');
        const href = source.getAttributeNS(XLINK_NAMESPACE, 'href')
          || source.getAttribute('l:href')
          || source.getAttribute('href')
          || '';
        if (href.startsWith('#')) {
          const noteId = href.slice(1);
          target.setAttribute('href', href);
          target.className = 'footnote-link';
          target.dataset.noteText = noteText.get(noteId) ?? '';
        } else {
          const externalUrl = safeExternalUrl(href);
          if (externalUrl) {
            target.setAttribute('href', externalUrl);
            target.setAttribute('target', '_blank');
            target.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (source.getAttribute('type') === 'note') {
          const superscript = htmlDocument.createElement('sup');
          appendChildren(source, superscript, depth);
          target.append(superscript);
          return target;
        }
        break;
      }
      case 'image':
        return renderImage(source);
      case 'epigraph':
        target = htmlDocument.createElement('blockquote');
        target.className = 'book-epigraph';
        break;
      case 'cite':
        target = htmlDocument.createElement('blockquote');
        target.className = 'book-cite';
        break;
      case 'poem':
        target = htmlDocument.createElement('blockquote');
        target.className = 'book-poem';
        break;
      case 'stanza':
        target = htmlDocument.createElement('div');
        target.className = 'book-stanza';
        break;
      case 'v':
        target = htmlDocument.createElement('div');
        target.className = 'book-verse';
        break;
      case 'text-author':
        target = htmlDocument.createElement('cite');
        break;
      case 'date':
        target = htmlDocument.createElement('time');
        if (source.getAttribute('value')) {
          target.setAttribute('datetime', source.getAttribute('value') || '');
        }
        break;
      case 'code':
        target = htmlDocument.createElement('code');
        break;
      case 'binary':
        return undefined;
      default:
        target = htmlDocument.createElement('span');
    }

    if (BLOCK_TAGS.has(name)) {
      addAnchor(target);
    }
    appendChildren(source, target, depth);
    return target;
  };

  const anchorCount = (element: HTMLElement): number => (
    (element.dataset.readerAnchor === undefined ? 0 : 1)
    + element.querySelectorAll('[data-reader-anchor]').length
  );

  const splitOversizedNode = (element: HTMLElement): HTMLElement[] => {
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
  };

  const article = htmlDocument.createElement('div');
  article.className = 'book';
  article.lang = parsed.metadata.language || 'ru';
  const mainNodes: HTMLElement[] = [];

  const appendChunks = (nodes: HTMLElement[], notes = false): void => {
    let pending: HTMLElement[] = [];
    let pendingAnchors = 0;
    let pendingSections = 0;
    const flush = (): void => {
      if (!pending.length) return;
      const chunk = htmlDocument.createElement(notes ? 'aside' : 'div');
      chunk.className = notes ? 'book-chunk book-notes' : 'book-chunk';
      chunk.dataset.readerChunk = '';
      if (notes) {
        chunk.dataset.readerNotes = '';
        chunk.setAttribute('aria-label', 'Сноски');
      }
      chunk.append(...pending);
      article.append(chunk);
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
  };

  const titleInfo = descendantElement(parsed.document, 'title-info');
  const coverPage = titleInfo && childElement(titleInfo, 'coverpage');
  const coverImage = coverPage && childElement(coverPage, 'image');
  if (coverImage) {
    const renderedCover = renderImage(coverImage);
    if (renderedCover) {
      renderedCover.classList.add('book-cover');
      mainNodes.push(renderedCover);
    }
  }

  const annotation = titleInfo && childElement(titleInfo, 'annotation');
  if (annotation) {
    const annotationElement = htmlDocument.createElement('aside');
    annotationElement.className = 'book-annotation';
    addAnchor(annotationElement);
    appendChildren(annotation, annotationElement, 1);
    mainNodes.push(annotationElement);
  }

  for (const body of bodies.filter((candidate) => candidate !== notesBody)) {
    for (const child of Array.from(body.childNodes)) {
      const rendered = renderNode(child, 0);
      if (rendered instanceof HTMLElement) {
        mainNodes.push(rendered);
      } else if (rendered?.textContent?.trim()) {
        const wrapper = htmlDocument.createElement('p');
        addAnchor(wrapper);
        wrapper.append(rendered);
        mainNodes.push(wrapper);
      }
    }
  }
  appendChunks(mainNodes);

  if (notesBody) {
    const noteNodes: HTMLElement[] = [];
    for (const child of Array.from(notesBody.childNodes)) {
      const rendered = renderNode(child, 0);
      if (!rendered || !rendered.textContent?.trim()) continue;
      if (rendered instanceof HTMLElement) noteNodes.push(rendered);
    }
    appendChunks(noteNodes, true);
  }

  const fragment = htmlDocument.createDocumentFragment();
  fragment.append(article);
  const wordCount = article.textContent?.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;

  return {
    fragment,
    metadata: parsed.metadata,
    wordCount,
  };
}
