import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeBookBytes, decodeXml } from './decode';

const validBook = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>Тест</book-title></title-info></description>
  <body><section><p>Текст</p></section></body>
</FictionBook>`;

describe('FB2 source decoder', () => {
  it('decodes a plain UTF-8 FB2 file', async () => {
    const result = await decodeBookBytes(new TextEncoder().encode(validBook), 'book.fb2');

    expect(result.format).toBe('fb2');
    if (result.format !== 'fb2') throw new Error('Expected FB2');
    expect(result.filename).toBe('book.fb2');
    expect(result.contentFilename).toBe('book.fb2');
    expect(result.xml).toContain('<book-title>Тест</book-title>');
  });

  it('extracts an FB2 file from ZIP', async () => {
    const archive = zipSync({
      'readme.txt': new TextEncoder().encode('not a book'),
      'library/book.fb2': new TextEncoder().encode(validBook),
    });

    const result = await decodeBookBytes(archive, 'book.fb2.zip');

    expect(result.format).toBe('fb2');
    if (result.format !== 'fb2') throw new Error('Expected FB2');
    expect(result.filename).toBe('book.fb2.zip');
    expect(result.contentFilename).toBe('library/book.fb2');
    expect(result.xml).toContain('<FictionBook');
  });

  it('identifies exact source bytes independently of the filename', async () => {
    const bytes = new TextEncoder().encode(validBook);
    const first = await decodeBookBytes(bytes, 'first-name.fb2');
    const renamed = await decodeBookBytes(bytes, 'renamed.fb2');
    const changed = await decodeBookBytes(new TextEncoder().encode(`${validBook} `), 'first-name.fb2');

    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(renamed.fingerprint).toBe(first.fingerprint);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
  });

  it('respects a windows-1251 XML declaration', () => {
    const prefix = new TextEncoder().encode(
      '<?xml version="1.0" encoding="windows-1251"?><FictionBook><book-title>',
    );
    const title = new Uint8Array([0xd2, 0xe5, 0xf1, 0xf2]); // «Тест» in windows-1251
    const suffix = new TextEncoder().encode('</book-title></FictionBook>');
    const bytes = new Uint8Array(prefix.length + title.length + suffix.length);
    bytes.set(prefix);
    bytes.set(title, prefix.length);
    bytes.set(suffix, prefix.length + title.length);

    expect(decodeXml(bytes)).toContain('<book-title>Тест</book-title>');
  });

  it('reports an empty ZIP archive', async () => {
    const archive = zipSync({});

    await expect(decodeBookBytes(archive, 'empty.zip')).rejects.toThrow('Архив пуст');
  });
});
