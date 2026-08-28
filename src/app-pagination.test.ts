// @ts-expect-error Vitest executes this regression test in Node; the browser bundle omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app.ts', 'utf8');

describe('initial book pagination', () => {
  it('restarts exact pagination only after the hidden reader is revealed', () => {
    const loadDecoded = source.slice(
      source.indexOf('private async loadDecoded'),
      source.indexOf('private setLoading'),
    );
    const reveal = loadDecoded.indexOf("this.reader.classList.remove('is-preparing');");
    const repaginate = loadDecoded.indexOf('this.pager.repaginate();');

    expect(reveal).toBeGreaterThan(-1);
    expect(repaginate).toBeGreaterThan(reveal);
    expect(loadDecoded.match(/this\.pager\.repaginate\(\);/gu)).toHaveLength(1);
  });
});
