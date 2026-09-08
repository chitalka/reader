import type { BookMetadata } from './book/model';

/** A bounded text-only sample cannot bring book IDs, links or layout into the settings screen. */
export function populateReadingPreview(
  preview: HTMLElement,
  fragment: DocumentFragment,
  metadata: BookMetadata,
): void {
  const title = document.createElement('p');
  title.className = 'reading-preview-title';
  title.textContent = metadata.title;
  const sample = document.createElement('div');
  sample.className = 'reading-preview-text';
  const section = fragment.querySelector('.book-section') ?? fragment;
  const heading = section.querySelector('h1, h2, h3, h4');
  if (heading?.textContent?.trim()) {
    const label = document.createElement('h3');
    label.textContent = heading.textContent.trim();
    sample.append(label);
  }
  for (const paragraph of section.querySelectorAll('p')) {
    if (sample.querySelectorAll('p').length === 3) break;
    if (paragraph.closest('h1, h2, h3, h4, h5, h6, .book-annotation, .book-notes')) continue;
    const text = paragraph.textContent?.trim();
    if (!text) continue;
    const copy = document.createElement('p');
    copy.textContent = text.length > 500 ? `${text.slice(0, 500).replace(/\s+\S*$/u, '')}…` : text;
    sample.append(copy);
  }
  preview.replaceChildren(title, sample);
}
