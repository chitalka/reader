export const FB2_NAMESPACE = 'http://www.gribuser.ru/xml/fictionbook/2.0';
export const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

export { normalizedText, type BookMetadata, type RenderedBook } from '../book/model';

import type { BookMetadata } from '../book/model';

export interface ParsedBook {
  document: XMLDocument;
  metadata: BookMetadata;
}

export function elementChildren(parent: Element | XMLDocument): Element[] {
  return Array.from(parent.children);
}

export function childElement(parent: Element, localName: string): Element | undefined {
  return elementChildren(parent).find((element) => element.localName === localName);
}

export function childElements(parent: Element, localName: string): Element[] {
  return elementChildren(parent).filter((element) => element.localName === localName);
}

export function descendantElement(parent: Element | XMLDocument, localName: string): Element | undefined {
  return Array.from(parent.getElementsByTagNameNS('*', localName))[0];
}
