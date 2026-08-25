// @ts-expect-error Vitest executes this regression test in Node; the browser bundle omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('src/app.ts', 'utf8');

describe('reader controls visibility policy', () => {
  it('lets reading-area taps toggle chrome without page turns overriding that choice', () => {
    expect(appSource).toContain(
      'bindMouseReadingClick(this.viewport, () => this.headerVisibility.toggle());',
    );
    expect(appSource).toContain(
      'bindTouchTap(this.viewport, () => this.headerVisibility.toggle());',
    );
    expect(appSource).not.toContain('this.headerVisibility.hide();');
  });

  it('keeps an exact return position for appendix footnotes and enables a back swipe', () => {
    expect(appSource).toContain(
      'if (returnPosition) this.setReturnPosition(returnPosition, true);',
    );
    expect(appSource).toContain(
      'if (direction < 0 && this.backPosition && this.backSwipeEnabled)',
    );
    expect(appSource).toContain(
      "if (footnote && this.settings.footnoteMode === 'inline') return;",
    );
  });
});
