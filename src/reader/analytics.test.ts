import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  estimateMinutes,
  idleTimeout,
  medianReadingSpeed,
  nonWhitespaceCharacters,
  readingSpeed,
  ReadingSessionTracker,
  segmentWords,
  type ReadingSession,
} from './analytics';

function session(overrides: Partial<ReadingSession> = {}): ReadingSession {
  return {
    id: 'session', bookFingerprint: 'book', bookTitle: 'Book', deviceId: 'device',
    startedAt: '2026-01-01T10:00:00.000Z', endedAt: '2026-01-01T10:10:00.000Z',
    activeMs: 600_000, speedSampleMs: 600_000, screensRead: 8,
    wordsRead: 2_000, charactersRead: 12_000, startProgress: 10, endProgress: 20,
    ...overrides,
  };
}

describe('reading analytics', () => {
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  it('uses a longer idle allowance for a two-page spread', () => {
    expect(idleTimeout(1)).toBe(120_000);
    expect(idleTimeout(2)).toBe(240_000);
  });

  it('segments Russian and English words and Unicode characters', () => {
    expect(segmentWords('Анна читает — very quickly.')).toBe(4);
    expect(nonWhitespaceCharacters('а б\n🙂')).toBe(3);
  });

  it('derives session and median speeds from eligible samples', () => {
    expect(readingSpeed(session())).toEqual({ wordsPerMinute: 200, charactersPerMinute: 1200 });
    expect(medianReadingSpeed([session(), session({ id: 'two', wordsRead: 3_000 })])?.wordsPerMinute).toBe(250);
    expect(readingSpeed(session({ speedSampleMs: 60_000 }))).toBeUndefined();
  });

  it('prefers personal speed for a completion estimate', () => {
    expect(estimateMinutes(2_000, { wordsPerMinute: 200, charactersPerMinute: 1_200 }, 100)).toBe(10);
    expect(estimateMinutes(2_000, undefined, 100)).toBe(20);
  });

  it('counts normal forward pages but excludes rapid turns from speed', async () => {
    const saved: ReadingSession[] = [];
    const tracker = new ReadingSessionTracker(async (value) => { saved.push(value); });
    tracker.configure(true);
    tracker.setBook({ fingerprint: 'book', title: 'Book', deviceId: 'device', wordCount: 10_000, characterCount: 60_000 });
    const snapshot = (currentPage: number, progress: number) => ({
      currentPage, progress, totalPages: 100, pagesPerView: 1, anchorVisible: true,
      paginationExact: true, chunkIndex: 0, chunkPage: currentPage,
    });
    tracker.record(snapshot(1, 1), 0);
    tracker.record(snapshot(2, 2), 60_000);
    tracker.record(snapshot(3, 3), 61_000);
    await tracker.finish(70_000);

    expect(saved[0]).toMatchObject({ screensRead: 2, wordsRead: 100, speedSampleMs: 60_000 });
  });

  it('excludes every sample in a three-turn skim burst while retaining screens', async () => {
    const saved: ReadingSession[] = [];
    const tracker = new ReadingSessionTracker(async (value) => { saved.push(value); });
    tracker.configure(true);
    tracker.setBook({ fingerprint: 'book', title: 'Book', deviceId: 'device', wordCount: 1_000, characterCount: 6_000 });
    const snapshot = (currentPage: number, progress: number) => ({
      currentPage, progress, totalPages: 100, pagesPerView: 1, anchorVisible: true,
      paginationExact: true, chunkIndex: 0, chunkPage: currentPage,
    });
    tracker.record(snapshot(1, 1), 0);
    tracker.record(snapshot(2, 2), 2_000);
    tracker.record(snapshot(3, 3), 3_500);
    tracker.record(snapshot(4, 4), 5_000);
    await tracker.finish(35_000);

    expect(saved[0]).toMatchObject({ screensRead: 3, wordsRead: 0, speedSampleMs: 0, activeMs: 35_000 });
  });

  it('saves idle-capped active time even without a page turn', async () => {
    const saved: ReadingSession[] = [];
    const tracker = new ReadingSessionTracker(async (value) => { saved.push(value); });
    tracker.configure(true);
    tracker.setBook({ fingerprint: 'book', title: 'Book', deviceId: 'device', wordCount: 1_000, characterCount: 6_000 });
    tracker.record({
      currentPage: 1, progress: 1, totalPages: 100, pagesPerView: 1, anchorVisible: true,
      paginationExact: true, chunkIndex: 0, chunkPage: 1,
    }, 0);
    await tracker.finish(180_000);

    expect(saved[0]?.activeMs).toBe(120_000);
  });
});
