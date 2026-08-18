import { unzip } from 'fflate';
import { t } from '../i18n';

export interface DecodedFb2Source {
  format: 'fb2';
  xml: string;
  /** The name selected by the reader. Used only for display and legacy migration. */
  filename: string;
  /** SHA-256 of the exact source bytes. Used as the stable local book key. */
  fingerprint: string;
  /** The actual FB2 entry name when the source is an archive. */
  contentFilename: string;
}

export interface DecodedEpubSource {
  format: 'epub';
  files: Record<string, Uint8Array>;
  /** The name selected by the reader. Used only for display and legacy migration. */
  filename: string;
  /** SHA-256 of the exact source bytes. Used as the stable local book key. */
  fingerprint: string;
}

export type DecodedBookSource = DecodedFb2Source | DecodedEpubSource;

const ZIP_SIGNATURE = [0x50, 0x4b] as const;

export async function sha256(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes[0] === ZIP_SIGNATURE[0] && bytes[1] === ZIP_SIGNATURE[1];
}

function unzipAsync(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) {
        reject(new Error(t('error.archiveUnpack', { message: error.message })));
        return;
      }

      resolve(files);
    });
  });
}

function encodingFromDeclaration(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le';
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be';
  }

  const header = Array.from(bytes.subarray(0, 512), (byte) => String.fromCharCode(byte)).join('');
  const declared = header.match(/<\?xml[^>]*encoding=["']\s*([^"']+)/iu)?.[1]?.trim().toLowerCase();

  if (!declared) {
    return 'utf-8';
  }

  const aliases: Record<string, string> = {
    cp1251: 'windows-1251',
    win1251: 'windows-1251',
    'utf8': 'utf-8',
  };

  return aliases[declared] ?? declared;
}

export function decodeXml(bytes: Uint8Array): string {
  const encoding = encodingFromDeclaration(bytes);

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    throw new Error(t('error.encodingUnsupported', { encoding }));
  }
}

export async function decodeBookBytes(bytes: Uint8Array, filename: string): Promise<DecodedBookSource> {
  const fingerprintPromise = sha256(bytes);
  const epubFilename = /\.epub$/iu.test(filename);
  if (epubFilename && !hasZipSignature(bytes)) {
    throw new Error(t('error.epubNotZip'));
  }
  const zipped = epubFilename || /\.zip$/iu.test(filename) || hasZipSignature(bytes);
  if (!zipped) {
    return {
      format: 'fb2',
      xml: decodeXml(bytes),
      filename,
      fingerprint: await fingerprintPromise,
      contentFilename: filename,
    };
  }

  const files = await unzipAsync(bytes);
  const epubContainer = Object.keys(files)
    .find((name) => name.replaceAll('\\', '/').toLocaleLowerCase() === 'meta-inf/container.xml');
  if (epubFilename || epubContainer) {
    return { format: 'epub', files, filename, fingerprint: await fingerprintPromise };
  }
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/'));
  const entry = entries.find(([name]) => /\.fb2$/iu.test(name));

  if (!entry) {
    throw new Error(t(entries.length ? 'error.archiveNoFb2' : 'error.archiveEmpty'));
  }

  const [entryName, content] = entry;
  return {
    format: 'fb2',
    xml: decodeXml(content),
    filename,
    fingerprint: await fingerprintPromise,
    contentFilename: entryName,
  };
}

export async function decodeBookFile(file: File): Promise<DecodedBookSource> {
  return decodeBookBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export async function decodeBookUrl(url: URL): Promise<DecodedBookSource> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(t('error.bookDownload', { status: response.status }));
  }

  const filename = decodeURIComponent(url.pathname.split('/').pop() || 'book.fb2');
  return decodeBookBytes(new Uint8Array(await response.arrayBuffer()), filename);
}
