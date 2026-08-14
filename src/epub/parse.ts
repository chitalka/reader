import { normalizedText } from '../book/model';
import { decodeXml } from '../fb2/decode';
import type { EpubManifestItem, EpubSpineItem, ParsedEpub } from './model';
import { resolveArchivePath } from './path';

const PACKAGE_MEDIA_TYPE = 'application/oebps-package+xml';
const CONTENT_MEDIA_TYPES = new Set(['application/xhtml+xml', 'text/html']);
const FONT_EXTENSIONS = /\.(?:otf|ttf|woff2?)$/iu;

function elementsByName(parent: Element | XMLDocument, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function parseXml(bytes: Uint8Array, label: string): XMLDocument {
  const parsed = new DOMParser().parseFromString(decodeXml(bytes), 'application/xml');
  const error = parsed.querySelector('parsererror');
  if (error) {
    throw new Error(`Некорректный EPUB: не удалось прочитать ${label}`);
  }
  return parsed;
}

function normalizeFiles(files: Record<string, Uint8Array>): Map<string, Uint8Array> {
  const normalized = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(files)) {
    const path = name.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/^\/+/, '');
    if (path && !path.endsWith('/')) normalized.set(path, bytes);
  }
  return normalized;
}

function metadataFromPackage(packageDocument: XMLDocument) {
  const metadata = elementsByName(packageDocument, 'metadata')[0];
  const title = metadata
    ? normalizedText(elementsByName(metadata, 'title')[0]) || 'Без названия'
    : 'Без названия';
  const authors = metadata
    ? elementsByName(metadata, 'creator').map(normalizedText).filter(Boolean)
    : [];
  const language = metadata
    ? normalizedText(elementsByName(metadata, 'language')[0]) || undefined
    : undefined;
  const id = metadata
    ? normalizedText(elementsByName(metadata, 'identifier')[0])
    : '';

  return {
    id: id || [title, ...authors].join(':').toLocaleLowerCase(),
    title,
    authors,
    language,
  };
}

function propertyTokens(element: Element): string[] {
  return (element.getAttribute('properties') ?? '').split(/\s+/u).filter(Boolean);
}

function isFixedLayout(packageDocument: XMLDocument): boolean {
  const metadata = elementsByName(packageDocument, 'metadata')[0];
  const packageFixed = metadata && elementsByName(metadata, 'meta').some((meta) => {
    const property = meta.getAttribute('property')?.toLocaleLowerCase();
    const name = meta.getAttribute('name')?.toLocaleLowerCase();
    const value = (property ? normalizedText(meta) : meta.getAttribute('content') ?? '')
      .toLocaleLowerCase();
    return property === 'rendition:layout' && value === 'pre-paginated'
      || name === 'fixed-layout' && ['true', 'yes', 'pre-paginated'].includes(value);
  });
  const itemFixed = elementsByName(packageDocument, 'itemref')
    .some((itemref) => propertyTokens(itemref).includes('rendition:layout-pre-paginated'));
  return Boolean(packageFixed || itemFixed);
}

function coverPath(
  packageDocument: XMLDocument,
  manifest: ReadonlyMap<string, EpubManifestItem>,
): string | undefined {
  const epub3Cover = Array.from(manifest.values())
    .find((item) => item.properties.includes('cover-image'));
  if (epub3Cover) return epub3Cover.path;

  const metadata = elementsByName(packageDocument, 'metadata')[0];
  const coverId = metadata && elementsByName(metadata, 'meta')
    .find((meta) => meta.getAttribute('name')?.toLocaleLowerCase() === 'cover')
    ?.getAttribute('content');
  return coverId ? manifest.get(coverId)?.path : undefined;
}

function supportedManifestItem(
  item: EpubManifestItem,
  manifest: ReadonlyMap<string, EpubManifestItem>,
): EpubManifestItem | undefined {
  const seen = new Set<string>();
  let candidate: EpubManifestItem | undefined = item;
  while (candidate && !seen.has(candidate.id)) {
    seen.add(candidate.id);
    if (CONTENT_MEDIA_TYPES.has(candidate.mediaType)) return candidate;
    candidate = candidate.fallback ? manifest.get(candidate.fallback) : undefined;
  }
  return undefined;
}

function assertNoEncryptedContent(
  files: ReadonlyMap<string, Uint8Array>,
  manifest: ReadonlyMap<string, EpubManifestItem>,
): void {
  const encryptionBytes = files.get('META-INF/encryption.xml');
  if (!encryptionBytes) return;
  const encryption = parseXml(encryptionBytes, 'META-INF/encryption.xml');
  const encryptedData = elementsByName(encryption, 'EncryptedData');
  if (!encryptedData.length) return;

  const mediaTypeByPath = new Map(
    Array.from(manifest.values()).map((item) => [item.path, item.mediaType]),
  );
  for (const encrypted of encryptedData) {
    const uri = elementsByName(encrypted, 'CipherReference')[0]?.getAttribute('URI');
    const path = uri && resolveArchivePath('', uri);
    const mediaType = path ? mediaTypeByPath.get(path) : undefined;
    if (path && (mediaType?.startsWith('font/') || FONT_EXTENSIONS.test(path))) continue;
    throw new Error('EPUB с DRM или зашифрованным содержимым не поддерживается');
  }
}

export function parseEpubArchive(archive: Record<string, Uint8Array>): ParsedEpub {
  const files = normalizeFiles(archive);
  const containerBytes = files.get('META-INF/container.xml');
  if (!containerBytes) {
    throw new Error('Некорректный EPUB: отсутствует META-INF/container.xml');
  }

  const container = parseXml(containerBytes, 'META-INF/container.xml');
  const rootfile = elementsByName(container, 'rootfile')[0];
  const rootfilePath = rootfile?.getAttribute('full-path') ?? '';
  const packagePath = resolveArchivePath('', rootfilePath);
  if (!packagePath) {
    throw new Error('Некорректный EPUB: не указан package document');
  }
  const packageBytes = files.get(packagePath);
  if (!packageBytes) {
    throw new Error(`Некорректный EPUB: не найден package document «${packagePath}»`);
  }
  if (rootfile?.getAttribute('media-type') && rootfile.getAttribute('media-type') !== PACKAGE_MEDIA_TYPE) {
    throw new Error('Некорректный EPUB: неизвестный тип package document');
  }

  const packageDocument = parseXml(packageBytes, packagePath);
  if (packageDocument.documentElement.localName !== 'package') {
    throw new Error('Некорректный EPUB: package document не содержит package');
  }
  if (isFixedLayout(packageDocument)) {
    throw new Error('EPUB с фиксированной вёрсткой пока не поддерживается');
  }

  const manifestElement = elementsByName(packageDocument, 'manifest')[0];
  const manifest = new Map<string, EpubManifestItem>();
  if (manifestElement) {
    for (const itemElement of Array.from(manifestElement.children)) {
      if (itemElement.localName !== 'item') continue;
      const id = itemElement.getAttribute('id') ?? '';
      const href = itemElement.getAttribute('href') ?? '';
      const path = resolveArchivePath(packagePath, href);
      if (!id || !path) continue;
      manifest.set(id, {
        id,
        path,
        mediaType: itemElement.getAttribute('media-type')?.toLocaleLowerCase() ?? '',
        properties: propertyTokens(itemElement),
        fallback: itemElement.getAttribute('fallback') ?? undefined,
      });
    }
  }
  assertNoEncryptedContent(files, manifest);

  const spineElement = elementsByName(packageDocument, 'spine')[0];
  const spine: EpubSpineItem[] = [];
  if (spineElement) {
    for (const itemref of Array.from(spineElement.children)) {
      if (itemref.localName !== 'itemref') continue;
      const idref = itemref.getAttribute('idref') ?? '';
      const manifestItem = manifest.get(idref);
      const supported = manifestItem && supportedManifestItem(manifestItem, manifest);
      if (!supported) continue;
      if (!files.has(supported.path)) {
        throw new Error(`Некорректный EPUB: не найден документ «${supported.path}»`);
      }
      spine.push({ item: supported, linear: itemref.getAttribute('linear') !== 'no' });
    }
  }
  if (!spine.length) {
    throw new Error('Некорректный EPUB: порядок чтения spine пуст');
  }

  return {
    files,
    packagePath,
    metadata: metadataFromPackage(packageDocument),
    manifest,
    spine,
    coverPath: coverPath(packageDocument, manifest),
  };
}
