import { describe, expect, it } from 'vitest';
import { parseFb2 } from './parse';

describe('FB2 parser', () => {
  it('extracts stable book metadata', () => {
    const parsed = parseFb2(`<?xml version="1.0"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
        <description>
          <title-info>
            <author><first-name>Лев</first-name><last-name>Толстой</last-name></author>
            <book-title>Анна Каренина</book-title>
            <lang>ru</lang>
          </title-info>
          <document-info><id>book-id</id></document-info>
        </description>
        <body><section><p>Текст</p></section></body>
      </FictionBook>`);

    expect(parsed.metadata).toEqual({
      id: 'book-id',
      title: 'Анна Каренина',
      authors: ['Лев Толстой'],
      language: 'ru',
    });
  });

  it('rejects malformed XML', () => {
    expect(() => parseFb2('<FictionBook><body></FictionBook>')).toThrow('Некорректный XML');
  });

  it('derives a hierarchical table of contents and excludes notes', () => {
    const parsed = parseFb2(`<?xml version="1.0"?>
      <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
        <description><title-info><book-title>Книга</book-title></title-info></description>
        <body>
          <section id="part">
            <title><p>Часть первая</p></title>
            <section id="chapter"><title><p>Глава I</p></title><p>Текст</p></section>
          </section>
          <section><section id="promoted"><title><p>Глава II</p></title></section></section>
        </body>
        <body name="notes"><section><title><p>Примечания</p></title></section></body>
      </FictionBook>`);

    expect(parsed.toc.map((item) => ({
      title: item.title,
      children: item.children.map((child) => child.title),
    }))).toEqual([
      { title: 'Часть первая', children: ['Глава I'] },
      { title: 'Глава II', children: [] },
    ]);
  });

  it('rejects XML of another format', () => {
    expect(() => parseFb2('<catalog><book /></catalog>')).toThrow('Файл не является книгой FB2');
  });
});
