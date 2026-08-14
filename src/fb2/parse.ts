import {
  childElement,
  childElements,
  descendantElement,
  normalizedText,
  type BookMetadata,
  type Fb2TocItem,
  type ParsedBook,
} from './model';

function authorName(author: Element): string {
  const parts = [
    normalizedText(childElement(author, 'first-name')),
    normalizedText(childElement(author, 'middle-name')),
    normalizedText(childElement(author, 'last-name')),
  ].filter(Boolean);

  return parts.join(' ') || normalizedText(childElement(author, 'nickname'));
}

function metadataFromDocument(document: XMLDocument): BookMetadata {
  const description = descendantElement(document, 'description');
  const titleInfo = description && childElement(description, 'title-info');
  const documentInfo = description && childElement(description, 'document-info');
  const publishInfo = description && childElement(description, 'publish-info');

  const title = normalizedText(titleInfo && childElement(titleInfo, 'book-title')) || 'Без названия';
  const authors = titleInfo
    ? childElements(titleInfo, 'author').map(authorName).filter(Boolean)
    : [];
  const documentId = normalizedText(documentInfo && childElement(documentInfo, 'id'));
  const isbn = normalizedText(publishInfo && childElement(publishInfo, 'isbn'));
  const language = normalizedText(titleInfo && childElement(titleInfo, 'lang')) || undefined;

  return {
    id: documentId || isbn || [title, ...authors].join(':').toLowerCase(),
    title,
    authors,
    language,
  };
}

function tocFromParent(parent: Element): Fb2TocItem[] {
  return childElements(parent, 'section').flatMap((section) => {
    const children = tocFromParent(section);
    const title = normalizedText(childElement(section, 'title'));
    return title ? [{ title, source: section, children }] : children;
  });
}

function tocFromDocument(document: XMLDocument): Fb2TocItem[] {
  return Array.from(document.getElementsByTagNameNS('*', 'body'))
    .filter((body) => body.getAttribute('name')?.toLocaleLowerCase() !== 'notes')
    .flatMap(tocFromParent);
}

export function parseFb2(xml: string): ParsedBook {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');

  if (parserError) {
    throw new Error(`Некорректный XML: ${normalizedText(parserError).slice(0, 180)}`);
  }

  if (document.documentElement.localName !== 'FictionBook') {
    throw new Error('Файл не является книгой FB2');
  }

  return {
    document,
    metadata: metadataFromDocument(document),
    toc: tocFromDocument(document),
  };
}
