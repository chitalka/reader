export interface BookMetadata {
  id: string;
  title: string;
  authors: string[];
  language?: string;
}

export interface BookTocItem {
  title: string;
  target?: string;
  children: BookTocItem[];
}

export interface RenderedBook {
  fragment: DocumentFragment;
  metadata: BookMetadata;
  toc: BookTocItem[];
  wordCount: number;
}

export function normalizedText(node: Node | null | undefined): string {
  return node?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}
