import { describe, expect, it } from 'vitest';
import { populateReadingPreview } from './settings-preview';

function fragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('reading preview', () => {
  it('copies a bounded text sample without moving book content or importing interactive markup', () => {
    const book = fragment(`<section class="book-section">
      <h2><p>Chapter</p></h2>
      <aside class="book-annotation"><p>Annotation</p></aside>
      <p id="anchor">Text with <a href="#note">a note</a>.</p>
      <p>${'Long text '.repeat(100)}</p><p>Third paragraph</p><p>Fourth paragraph</p>
    </section>`);
    const preview = document.createElement('div');
    populateReadingPreview(preview, book, { id: 'book', title: 'Book', authors: [] });
    expect(preview.querySelector('h3')?.textContent).toBe('Chapter');
    const paragraphs = preview.querySelectorAll('.reading-preview-text p');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.textContent).toBe('Text with a note.');
    expect(paragraphs[1]!.textContent!.length).toBeLessThanOrEqual(501);
    expect(paragraphs[2]?.textContent).toBe('Third paragraph');
    expect(preview.querySelector('a, [id]')).toBeNull();
    expect(book.querySelector('#anchor a')).not.toBeNull();
  });

  it('replaces the old book sample, including when the next book has no paragraphs', () => {
    const preview = document.createElement('div');
    populateReadingPreview(preview, fragment('<p>First book</p>'), { id: 'one', title: 'One', authors: [] });
    populateReadingPreview(preview, fragment(''), { id: 'two', title: 'Two', authors: [] });
    expect(preview.textContent).toBe('Two');
  });
});
