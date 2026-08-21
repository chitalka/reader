import { describe, expect, it } from 'vitest';
import { tocPathLabels } from './model';

describe('tocPathLabels', () => {
  it('keeps the complete hierarchy for every navigable target', () => {
    const labels = tocPathLabels([{
      title: 'Часть первая',
      target: 'part-1',
      children: [{
        title: 'I',
        target: 'chapter-1',
        children: [{ title: 'Сцена', target: 'scene-1', children: [] }],
      }],
    }]);

    expect(labels.get('part-1')).toBe('Часть первая');
    expect(labels.get('chapter-1')).toBe('Часть первая · I');
    expect(labels.get('scene-1')).toBe('Часть первая · I · Сцена');
  });

  it('includes non-navigable grouping labels in descendant paths', () => {
    const labels = tocPathLabels([{
      title: 'Книга первая',
      children: [{ title: 'Глава I', target: 'chapter-1', children: [] }],
    }]);

    expect(labels.get('chapter-1')).toBe('Книга первая · Глава I');
  });
});
