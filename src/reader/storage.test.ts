import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeBookFilename, positionStorage } from './storage';

describe('book position storage', () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };

  beforeEach(() => {
    values.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
  });

  it('normalizes paths, whitespace, and letter case', () => {
    expect(normalizeBookFilename('  C:\\Books\\Anna-Karenina.FB2.ZIP  '))
      .toBe('anna-karenina.fb2.zip');
  });

  it('shares a position between equal normalized filenames', () => {
    positionStorage('/downloads/Anna-Karenina.FB2.ZIP').write({
      anchor: '471',
      column: 18,
    });

    expect(positionStorage('anna-karenina.fb2.zip').read()).toEqual({
      anchor: '471',
      column: 18,
    });
  });

  it('keeps positions for different filenames separate', () => {
    positionStorage('first.fb2').write({ anchor: '10', column: 3 });

    expect(positionStorage('second.fb2').read()).toEqual({ column: 0 });
  });
});
