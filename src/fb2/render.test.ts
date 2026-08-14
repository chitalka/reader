import { describe, expect, it } from 'vitest';
import { parseFb2 } from './parse';
import { renderFb2 } from './render';

const bookXml = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"
             xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <author><first-name>Автор</first-name></author>
      <book-title>Безопасная книга</book-title>
      <coverpage><image l:href="#cover" /></coverpage>
      <annotation><p>Краткое описание.</p></annotation>
      <lang>ru</lang>
    </title-info>
    <document-info><id>safe-book</id></document-info>
  </description>
  <body>
    <title><p>Глава первая</p></title>
    <section>
      <p>Обычный <strong>важный</strong> текст<a type="note" l:href="#note-1">[1]</a>.</p>
      <p><a l:href="javascript:alert(1)">опасная ссылка</a></p>
    </section>
  </body>
  <body name="notes">
    <title><p>Примечания</p></title>
    <section id="note-1"><p>Текст сноски.</p></section>
  </body>
  <binary id="cover" content-type="image/png">aGVsbG8=</binary>
</FictionBook>`;

describe('FB2 DOM renderer', () => {
  it('renders structure, embedded images and footnotes', () => {
    const rendered = renderFb2(parseFb2(bookXml));
    const article = rendered.fragment.querySelector<HTMLElement>('.book');
    const footnote = rendered.fragment.querySelector<HTMLAnchorElement>('.footnote-link');

    expect(article?.lang).toBe('ru');
    expect(article?.querySelector('strong')?.textContent).toBe('важный');
    expect(article?.querySelector<HTMLImageElement>('.book-cover img')?.src)
      .toBe('data:image/png;base64,aGVsbG8=');
    expect(article?.querySelector<HTMLImageElement>('.book-cover img')?.loading).toBe('eager');
    expect(article?.querySelectorAll('p[data-reader-anchor]')).toHaveLength(6);
    expect(footnote?.getAttribute('href')).toBe('#note-1');
    expect(footnote?.tabIndex).toBe(-1);
    expect(footnote?.dataset.noteText).toBe('Текст сноски.');
    expect(article?.querySelector('#note-1')?.textContent).toContain('Текст сноски');
    expect(rendered.wordCount).toBeGreaterThan(8);
  });

  it('does not expose executable link protocols', () => {
    const rendered = renderFb2(parseFb2(bookXml));
    const unsafeLink = Array.from(rendered.fragment.querySelectorAll('a'))
      .find((link) => link.textContent === 'опасная ссылка');

    expect(unsafeLink?.hasAttribute('href')).toBe(false);
    expect(unsafeLink?.tabIndex).toBe(-1);
  });

  it('splits oversized sections into bounded render chunks', () => {
    const paragraphs = Array.from(
      { length: 205 },
      (_, index) => `<p>Абзац ${index + 1}</p>`,
    ).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
        <description>
          <title-info><book-title>Большая книга</book-title><lang>ru</lang></title-info>
          <document-info><id>large-book</id></document-info>
        </description>
        <body><section>${paragraphs}</section></body>
      </FictionBook>`;

    const rendered = renderFb2(parseFb2(xml));
    const chunks = Array.from(
      rendered.fragment.querySelectorAll<HTMLElement>('[data-reader-chunk]'),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.querySelectorAll('[data-reader-anchor]').length <= 96))
      .toBe(true);
    expect(rendered.fragment.querySelectorAll('[data-reader-anchor]')).toHaveLength(206);
  });
});
