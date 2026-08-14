import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeBookBytes } from '../fb2/decode';
import { parseEpubArchive } from './parse';
import { renderEpub } from './render';

const encoder = new TextEncoder();

function xml(value: string): Uint8Array {
  return encoder.encode(value);
}

function epub3Files(): Record<string, Uint8Array> {
  return {
    mimetype: xml('application/epub+zip'),
    'META-INF/container.xml': xml(`<?xml version="1.0"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
        </rootfiles>
      </container>`),
    'OEBPS/content.opf': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="book-id">epub-3-book</dc:identifier>
          <dc:title>Безопасный EPUB</dc:title>
          <dc:creator>Автор EPUB</dc:creator>
          <dc:language>ru</dc:language>
        </metadata>
        <manifest>
          <item id="chapter-1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
          <item id="chapter-2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml" />
          <item id="notes" href="Text/notes.xhtml" media-type="application/xhtml+xml" />
          <item id="cover" href="Images/cover.png" media-type="image/png" properties="cover-image" />
          <item id="diagram" href="Images/diagram.svg" media-type="image/svg+xml" />
        </manifest>
        <spine>
          <itemref idref="chapter-1" />
          <itemref idref="chapter-2" />
          <itemref idref="notes" />
        </spine>
      </package>`),
    'OEBPS/Text/chapter1.xhtml': xml(`<?xml version="1.0"?>
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <head>
          <title>Первая глава</title>
          <style>body { display: none }</style>
          <script>globalThis.evil = true</script>
        </head>
        <body>
          <h1>Первая глава</h1>
          <p style="position: fixed" onclick="evil()">
            Основной текст
            <a epub:type="noteref" href="notes.xhtml#note-1"><sup>1</sup></a>
          </p>
          <p id="same-document-target">Цель в этой же главе.</p>
          <p><a href="#same-document-target">Перейти внутри главы</a></p>
          <p><a href="chapter2.xhtml#destination">Перейти дальше</a></p>
          <p><a href="javascript:alert(1)">Опасная ссылка</a></p>
          <img src="../Images/cover.png" alt="Обложка" onerror="evil()" />
          <img src="../Images/diagram.svg" alt="Диаграмма" />
          <img src="https://example.com/tracker.png" alt="Трекер" />
        </body>
      </html>`),
    'OEBPS/Text/chapter2.xhtml': xml(`<?xml version="1.0"?>
      <html xmlns="http://www.w3.org/1999/xhtml">
        <head><title>Вторая глава</title></head>
        <body><h2 id="destination">Вторая глава</h2><p>Продолжение книги.</p></body>
      </html>`),
    'OEBPS/Text/notes.xhtml': xml(`<?xml version="1.0"?>
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <head><title>Сноски</title></head>
        <body epub:type="endnotes">
          <aside id="note-1"><p>Текст межглавной сноски.</p></aside>
        </body>
      </html>`),
    'OEBPS/Images/cover.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    'OEBPS/Images/diagram.svg': xml(`<svg xmlns="http://www.w3.org/2000/svg" onload="evil()">
      <script>evil()</script>
      <rect width="10" height="10" fill="url(https://example.com/paint.svg#gradient)" />
      <circle cx="5" cy="5" r="4" fill="red" />
    </svg>`),
  };
}

function minimalArchive(packageDocument: string, additions: Record<string, Uint8Array> = {}) {
  return {
    'META-INF/container.xml': xml(`<?xml version="1.0"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
        <rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml" /></rootfiles>
      </container>`),
    'OPS/book.opf': xml(packageDocument),
    'OPS/chapter.xhtml': xml(`<?xml version="1.0"?>
      <html xmlns="http://www.w3.org/1999/xhtml"><body><p>Текст</p></body></html>`),
    ...additions,
  };
}

describe('EPUB support', () => {
  it('detects an EPUB ZIP and reads EPUB 3 metadata and spine', async () => {
    const decoded = await decodeBookBytes(zipSync(epub3Files()), 'book.epub');

    expect(decoded.format).toBe('epub');
    if (decoded.format !== 'epub') throw new Error('Expected EPUB');
    const parsed = parseEpubArchive(decoded.files);

    expect(parsed.metadata).toMatchObject({
      id: 'epub-3-book',
      title: 'Безопасный EPUB',
      authors: ['Автор EPUB'],
      language: 'ru',
    });
    expect(parsed.spine.map((entry) => entry.item.path)).toEqual([
      'OEBPS/Text/chapter1.xhtml',
      'OEBPS/Text/chapter2.xhtml',
      'OEBPS/Text/notes.xhtml',
    ]);
    expect(parsed.coverPath).toBe('OEBPS/Images/cover.png');
  });

  it('renders images, cross-document links and footnotes without active content', () => {
    const rendered = renderEpub(parseEpubArchive(epub3Files()));
    const book = rendered.fragment.querySelector<HTMLElement>('.book');
    const footnote = book?.querySelector<HTMLAnchorElement>('.footnote-link');
    const internalLink = Array.from(book?.querySelectorAll('a') ?? [])
      .find((link) => link.textContent === 'Перейти дальше');
    const sameDocumentLink = Array.from(book?.querySelectorAll('a') ?? [])
      .find((link) => link.textContent === 'Перейти внутри главы');
    const unsafeLink = Array.from(book?.querySelectorAll('a') ?? [])
      .find((link) => link.textContent === 'Опасная ссылка');

    expect(book?.querySelectorAll('[data-reader-chunk]').length).toBeGreaterThanOrEqual(3);
    expect(book?.querySelectorAll('[data-reader-notes]')).toHaveLength(1);
    expect(book?.querySelector('.book-cover img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/u);
    const svgSource = book?.querySelector<HTMLImageElement>('img[alt="Диаграмма"]')?.src ?? '';
    expect(svgSource).toMatch(/^data:image\/svg\+xml;base64,/u);
    const svgText = new TextDecoder().decode(Uint8Array.from(atob(svgSource.split(',')[1] ?? ''), (char) => char.charCodeAt(0)));
    expect(svgText).not.toContain('<script');
    expect(svgText).not.toContain('onload');
    expect(svgText).not.toContain('example.com');
    expect(book?.querySelector('img[alt="Трекер"]')).toBeNull();
    expect(book?.querySelector('script, style, form, iframe')).toBeNull();
    expect(book?.querySelector('[onclick], [onerror], [style]')).toBeNull();
    expect(book?.textContent).not.toContain('globalThis.evil');
    expect(unsafeLink?.hasAttribute('href')).toBe(false);

    expect(footnote?.dataset.noteText).toContain('Текст межглавной сноски');
    expect(footnote?.getAttribute('href')).toMatch(/^#epub-target-/u);
    expect(footnote?.tabIndex).toBe(-1);
    const noteHash = footnote?.hash;
    const noteTarget = noteHash ? book?.querySelector<HTMLElement>(noteHash) : undefined;
    expect(noteTarget?.classList.contains('book-footnote')).toBe(true);
    expect(noteTarget?.textContent).toContain('Текст межглавной сноски');

    expect(internalLink?.classList.contains('book-internal-link')).toBe(true);
    expect(internalLink?.tabIndex).toBe(-1);
    expect(internalLink?.getAttribute('href')).toMatch(/^#epub-target-/u);
    expect(book?.querySelector(internalLink?.getAttribute('href') ?? 'missing')?.textContent)
      .toContain('Вторая глава');
    expect(sameDocumentLink?.getAttribute('href')).toMatch(/^#epub-target-/u);
    expect(book?.querySelector(sameDocumentLink?.getAttribute('href') ?? 'missing')?.textContent)
      .toContain('Цель в этой же главе');
    expect(rendered.wordCount).toBeGreaterThan(10);
  });

  it('reads an EPUB 2 package with an NCX manifest item', () => {
    const files = minimalArchive(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">epub-2-book</dc:identifier>
          <dc:title>EPUB второй версии</dc:title>
          <dc:creator>Старый автор</dc:creator>
        </metadata>
        <manifest>
          <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
          <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
        </manifest>
        <spine toc="ncx"><itemref idref="chapter" /></spine>
      </package>`, {
      'OPS/toc.ncx': xml('<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" />'),
    });
    const parsed = parseEpubArchive(files);

    expect(parsed.metadata.title).toBe('EPUB второй версии');
    expect(parsed.spine).toHaveLength(1);
    expect(renderEpub(parsed).fragment.textContent).toContain('Текст');
  });

  it('rejects fixed-layout EPUB publications', () => {
    const files = minimalArchive(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata><meta property="rendition:layout">pre-paginated</meta></metadata>
        <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" /></manifest>
        <spine><itemref idref="chapter" /></spine>
      </package>`);

    expect(() => parseEpubArchive(files)).toThrow('фиксированной вёрсткой');
  });

  it('rejects encrypted reading content', () => {
    const files = minimalArchive(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata />
        <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" /></manifest>
        <spine><itemref idref="chapter" /></spine>
      </package>`, {
      'META-INF/encryption.xml': xml(`<?xml version="1.0"?>
        <encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
                    xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
          <enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OPS/chapter.xhtml" /></enc:CipherData></enc:EncryptedData>
        </encryption>`),
    });

    expect(() => parseEpubArchive(files)).toThrow('DRM или зашифрованным содержимым');
  });

  it('allows obfuscated fonts because publication fonts are not loaded', () => {
    const files = minimalArchive(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata />
        <manifest>
          <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
          <item id="font" href="font.woff2" media-type="font/woff2" />
        </manifest>
        <spine><itemref idref="chapter" /></spine>
      </package>`, {
      'OPS/font.woff2': new Uint8Array([1, 2, 3]),
      'META-INF/encryption.xml': xml(`<?xml version="1.0"?>
        <encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
                    xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
          <enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OPS/font.woff2" /></enc:CipherData></enc:EncryptedData>
        </encryption>`),
    });

    expect(parseEpubArchive(files).spine).toHaveLength(1);
  });

  it('reports a missing container and an empty spine', () => {
    expect(() => parseEpubArchive({})).toThrow('отсутствует META-INF/container.xml');
    const files = minimalArchive(`<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata />
        <manifest />
        <spine />
      </package>`);
    expect(() => parseEpubArchive(files)).toThrow('порядок чтения spine пуст');
  });

  it('reports a non-ZIP EPUB file', async () => {
    await expect(decodeBookBytes(xml('not a zip'), 'broken.epub'))
      .rejects.toThrow('не является ZIP-архивом');
  });
});
