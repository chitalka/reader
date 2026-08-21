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

export function tocPathLabels(
  items: BookTocItem[],
  ancestors: string[] = [],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const item of items) {
    const path = [...ancestors, item.title];
    if (item.target) labels.set(item.target, path.join(' · '));
    for (const [target, label] of tocPathLabels(item.children, path)) labels.set(target, label);
  }
  return labels;
}

export function normalizedText(node: Node | null | undefined): string {
  return node?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}
