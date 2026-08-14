import { unzip } from 'fflate';

export interface DecodedBookSource {
  xml: string;
  /** The name selected by the reader. Used as the stable local book key. */
  filename: string;
  /** The actual FB2 entry name when the source is an archive. */
  contentFilename: string;
}

const ZIP_SIGNATURE = [0x50, 0x4b] as const;

function isZip(bytes: Uint8Array, filename: string): boolean {
  return /\.zip$/iu.test(filename) || (
    bytes[0] === ZIP_SIGNATURE[0] && bytes[1] === ZIP_SIGNATURE[1]
  );
}

function unzipAsync(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) {
        reject(new Error(`Не удалось распаковать архив: ${error.message}`));
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
    throw new Error(`Кодировка «${encoding}» не поддерживается браузером`);
  }
}

export async function decodeBookBytes(bytes: Uint8Array, filename: string): Promise<DecodedBookSource> {
  if (!isZip(bytes, filename)) {
    return { xml: decodeXml(bytes), filename, contentFilename: filename };
  }

  const files = await unzipAsync(bytes);
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/'));
  const entry = entries.find(([name]) => /\.fb2$/iu.test(name)) ?? entries[0];

  if (!entry) {
    throw new Error('Архив пуст');
  }

  const [entryName, content] = entry;
  return { xml: decodeXml(content), filename, contentFilename: entryName };
}

export async function decodeBookFile(file: File): Promise<DecodedBookSource> {
  return decodeBookBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export async function decodeBookUrl(url: URL): Promise<DecodedBookSource> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить книгу: HTTP ${response.status}`);
  }

  const filename = decodeURIComponent(url.pathname.split('/').pop() || 'book.fb2');
  return decodeBookBytes(new Uint8Array(await response.arrayBuffer()), filename);
}
