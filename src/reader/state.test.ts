import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import {
  bookmarkId,
  compactTombstones,
  createEmptyReaderState,
  mergeReaderStates,
  quoteId,
  type BookmarkRecord,
  type QuoteRecord,
} from './state';

describe('reader state merge', () => {
  it('merges setting fields independently and does not trust wall-clock timestamps', () => {
    const first = createEmptyReaderState('device-a');
    const second = createEmptyReaderState('device-b');
    first.logicalCounter = 3;
    second.logicalCounter = 7;
    first.settings.theme = {
      value: 'dark',
      revision: { counter: 3, deviceId: 'device-a' },
      updatedAt: '2099-01-01T00:00:00.000Z',
    };
    second.settings.fontSize = {
      value: 22,
      revision: { counter: 7, deviceId: 'device-b' },
      updatedAt: '2000-01-01T00:00:00.000Z',
    };

    const merged = mergeReaderStates(first, second);

    expect(merged.settings.theme?.value).toBe('dark');
    expect(merged.settings.fontSize?.value).toBe(22);
    expect(merged.logicalCounter).toBe(7);
    expect(merged.deviceId).toBe('device-a');
    expect(DEFAULT_SETTINGS.pageMode).toBe('auto');
  });

  it('converges concurrent edits deterministically regardless of merge order', () => {
    const first = createEmptyReaderState('device-a');
    const second = createEmptyReaderState('device-b');
    const id = bookmarkId('book', '12');
    const base = {
      id,
      kind: 'bookmark' as const,
      bookFingerprint: 'book',
      anchor: '12',
      progress: 20,
      color: 'purple' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    first.bookmarks[id] = { ...base, note: 'A', revision: { counter: 4, deviceId: 'device-a' } };
    second.bookmarks[id] = { ...base, note: 'B', revision: { counter: 4, deviceId: 'device-b' } };

    expect(mergeReaderStates(first, second).bookmarks[id]?.note).toBe('B');
    const reverse = mergeReaderStates(second, first);
    expect(reverse.bookmarks[id]?.note).toBe('B');
  });

  it('keeps a newer tombstone over an offline live record', () => {
    const first = createEmptyReaderState('device-a');
    const second = createEmptyReaderState('device-b');
    const id = quoteId('book', { anchor: '2', offset: 4 }, { anchor: '3', offset: 8 });
    const live: QuoteRecord = {
      id,
      kind: 'quote',
      bookFingerprint: 'book',
      start: { anchor: '2', offset: 4 },
      end: { anchor: '3', offset: 8 },
      exact: 'selected',
      prefix: '',
      suffix: '',
      progress: 30,
      note: '',
      color: 'purple',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: { counter: 2, deviceId: 'device-b' },
    };
    const deleted: QuoteRecord = {
      ...live,
      deletedAt: '2026-02-01T00:00:00.000Z',
      revision: { counter: 5, deviceId: 'device-a' },
    };
    first.quotes[id] = deleted;
    second.quotes[id] = live;

    expect(mergeReaderStates(first, second).quotes[id]?.deletedAt).toBeDefined();
  });

  it('uses deterministic identities for exact duplicate records', () => {
    const first: BookmarkRecord['id'] = bookmarkId('book', '18');
    const second: BookmarkRecord['id'] = bookmarkId('book', '18');
    expect(first).toBe(second);
    expect(quoteId('book', { anchor: '1', offset: 2 }, { anchor: '4', offset: 9 }))
      .toBe(quoteId('book', { anchor: '1', offset: 2 }, { anchor: '4', offset: 9 }));
  });

  it('keeps old tombstones while discarding their private payload', () => {
    const state = createEmptyReaderState('device-a');
    const id = bookmarkId('book', '18');
    state.bookmarks[id] = {
      id,
      kind: 'bookmark',
      bookFingerprint: 'book',
      anchor: '18',
      progress: 70,
      chapter: 'Chapter',
      note: 'Private note',
      color: 'orange',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: '2026-01-03T00:00:00.000Z',
      revision: { counter: 2, deviceId: 'device-a' },
    };

    const compacted = compactTombstones(state, Date.parse('2026-03-01T00:00:00.000Z'));

    expect(compacted.bookmarks[id]).toMatchObject({
      id,
      deletedAt: '2026-01-03T00:00:00.000Z',
      note: '',
      progress: 0,
      color: 'purple',
    });
    expect(compacted.bookmarks[id]?.chapter).toBeUndefined();
  });
});
