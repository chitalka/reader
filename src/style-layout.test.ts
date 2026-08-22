// @ts-expect-error Vitest executes this regression test in Node; the browser bundle omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/style.css', 'utf8');

describe('reader layout styles', () => {
  it('keeps pagination geometry owned by the pager', () => {
    expect(stylesheet).toContain('padding-inline: 0;');
    expect(stylesheet).not.toContain('CH-50 reading concept');
    expect(stylesheet).not.toContain(
      'width: min(100% - 2 * var(--layout-gutter), 1060px);',
    );
    expect(stylesheet).not.toContain(
      'padding: clamp(34px, 5.5vh, 74px) clamp(28px, 7vw, 92px);',
    );
  });

  it('keeps the fast progress visible while exact pagination is pending', () => {
    expect(stylesheet).not.toContain('.progress-group.is-pending .progress-copy');
    expect(stylesheet).not.toContain('.reader-footer.is-pending .fullscreen-reader-status');
    expect(stylesheet).not.toContain('.pagination-placeholder');
  });
});
