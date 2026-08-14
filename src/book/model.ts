export interface BookMetadata {
  id: string;
  title: string;
  authors: string[];
  language?: string;
}

export interface RenderedBook {
  fragment: DocumentFragment;
  metadata: BookMetadata;
  wordCount: number;
}

export function normalizedText(node: Node | null | undefined): string {
  return node?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}
