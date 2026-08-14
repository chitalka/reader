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

  it('rejects XML of another format', () => {
    expect(() => parseFb2('<catalog><book /></catalog>')).toThrow('Файл не является книгой FB2');
  });
});
