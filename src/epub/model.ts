import type { BookMetadata } from '../book/model';

export interface EpubManifestItem {
  id: string;
  path: string;
  mediaType: string;
  properties: string[];
  fallback?: string;
}

export interface EpubSpineItem {
  item: EpubManifestItem;
  linear: boolean;
}

export interface EpubTocItem {
  title: string;
  path?: string;
  fragment?: string;
  children: EpubTocItem[];
}

export interface ParsedEpub {
  files: ReadonlyMap<string, Uint8Array>;
  packagePath: string;
  metadata: BookMetadata;
  manifest: ReadonlyMap<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  toc: EpubTocItem[];
  coverPath?: string;
}
