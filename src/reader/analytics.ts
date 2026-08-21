import type { PagerSnapshot } from './pager';

export const IDLE_ONE_PAGE_MS = 2 * 60_000;
export const IDLE_TWO_PAGE_MS = 4 * 60_000;
export const SESSION_BREAK_MS = 15 * 60_000;
export const MIN_SPEED_SESSION_MS = 2 * 60_000;
export const MAX_READING_WPM = 1_000;
export const RAPID_TURN_MS = 5_000 / 3;

export interface ReadingSession {
  id: string;
  bookFingerprint: string;
  bookTitle: string;
  deviceId: string;
  startedAt: string;
  endedAt: string;
  activeMs: number;
  speedSampleMs: number;
  screensRead: number;
  wordsRead: number;
  charactersRead: number;
  startProgress: number;
  endProgress: number;
}

export interface ReadingSpeed {
  wordsPerMinute: number;
  charactersPerMinute: number;
}

export function idleTimeout(pagesPerView: number): number {
  return pagesPerView >= 2 ? IDLE_TWO_PAGE_MS : IDLE_ONE_PAGE_MS;
}

export function segmentWords(text: string, locale = 'ru'): number {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    return Array.from(segmenter.segment(text)).filter((part) => part.isWordLike).length;
  }
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

export function nonWhitespaceCharacters(text: string): number {
  return Array.from(text).filter((character) => !/\s/u.test(character)).length;
}

export function readingSpeed(session: ReadingSession): ReadingSpeed | undefined {
  if (session.speedSampleMs < MIN_SPEED_SESSION_MS || session.wordsRead <= 0) return undefined;
  const minutes = session.speedSampleMs / 60_000;
  return {
    wordsPerMinute: Math.round(session.wordsRead / minutes),
    charactersPerMinute: Math.round(session.charactersRead / minutes),
  };
}

export function medianReadingSpeed(sessions: readonly ReadingSession[]): ReadingSpeed | undefined {
  const samples = sessions.map(readingSpeed).filter((value): value is ReadingSpeed => Boolean(value));
  if (!samples.length) return undefined;
  const median = (values: number[]): number => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle]! : Math.round((values[middle - 1]! + values[middle]!) / 2);
  };
  return {
    wordsPerMinute: median(samples.map((sample) => sample.wordsPerMinute)),
    charactersPerMinute: median(samples.map((sample) => sample.charactersPerMinute)),
  };
}

export function estimateMinutes(wordsLeft: number, personal?: ReadingSpeed, fallback = 220): number {
  const raw = Math.max(0, wordsLeft / Math.max(1, personal?.wordsPerMinute ?? fallback));
  if (raw === 0) return 0;
  const step = raw < 60 ? 5 : raw <= 10 * 60 ? 10 : 30;
  return Math.ceil(raw / step) * step;
}

interface TrackerBook {
  fingerprint: string;
  title: string;
  deviceId: string;
  wordCount: number;
  characterCount: number;
}

interface SpeedSample {
  at: number;
  durationMs: number;
  words: number;
  characters: number;
  accepted: boolean;
}

interface DraftSession extends Omit<ReadingSession, 'id' | 'endedAt'> {
  lastAt: number;
  lastSnapshot: PagerSnapshot;
  seenRanges: Set<string>;
  speedSamples: SpeedSample[];
}

export class ReadingSessionTracker {
  private book?: TrackerBook;
  private draft?: DraftSession;
  private enabled = false;
  private paused = false;

  constructor(private readonly save: (session: ReadingSession) => Promise<void>) {}

  configure(enabled: boolean): void {
    if (this.enabled && !enabled) void this.finish();
    this.enabled = enabled;
  }

  setBook(book: TrackerBook | undefined): void {
    if (this.book?.fingerprint !== book?.fingerprint) void this.finish();
    this.book = book;
  }

  setPaused(paused: boolean): void {
    if (!this.paused && paused) void this.finish();
    this.paused = paused;
  }

  record(snapshot: PagerSnapshot, now = Date.now()): void {
    if (!this.enabled || this.paused || !this.book || document.hidden || !document.hasFocus()) return;
    if (!this.draft) {
      this.draft = this.createDraft(snapshot, now);
      return;
    }
    const elapsed = now - this.draft.lastAt;
    if (elapsed >= SESSION_BREAK_MS) {
      void this.finish(now).then(() => { this.draft = this.createDraft(snapshot, now); });
      return;
    }
    const activeDelta = Math.min(Math.max(0, elapsed), idleTimeout(this.draft.lastSnapshot.pagesPerView));
    this.draft.activeMs += activeDelta;

    const pageDelta = snapshot.currentPage - this.draft.lastSnapshot.currentPage;
    const normalForwardTurn = pageDelta > 0 && pageDelta <= Math.max(1, snapshot.pagesPerView);
    if (normalForwardTurn) {
      const rangeKey = `${this.draft.lastSnapshot.currentPage}:${snapshot.currentPage}`;
      if (!this.draft.seenRanges.has(rangeKey)) {
        this.draft.seenRanges.add(rangeKey);
        this.draft.screensRead += pageDelta;
        const progressDelta = Math.max(0, snapshot.progress - this.draft.lastSnapshot.progress) / 100;
        const words = Math.round(this.book.wordCount * progressDelta);
        const characters = Math.round(this.book.characterCount * progressDelta);
        const impliedWpm = activeDelta > 0 ? words / (activeDelta / 60_000) : Number.POSITIVE_INFINITY;
        const sample: SpeedSample = {
          at: now,
          durationMs: activeDelta,
          words,
          characters,
          accepted: elapsed >= RAPID_TURN_MS && impliedWpm <= MAX_READING_WPM,
        };
        this.draft.speedSamples.push(sample);
        const recent = this.draft.speedSamples.slice(-3);
        if (recent.length === 3 && recent[2]!.at - recent[0]!.at <= 5_000) {
          recent.forEach((item) => { item.accepted = false; });
        }
      }
    }
    this.draft.endProgress = snapshot.progress;
    this.draft.lastAt = now;
    this.draft.lastSnapshot = snapshot;
  }

  async finish(now = Date.now()): Promise<void> {
    const draft = this.draft;
    this.draft = undefined;
    if (draft) {
      draft.activeMs += Math.min(Math.max(0, now - draft.lastAt), idleTimeout(draft.lastSnapshot.pagesPerView));
      const accepted = draft.speedSamples.filter((sample) => sample.accepted);
      draft.wordsRead = accepted.reduce((sum, sample) => sum + sample.words, 0);
      draft.charactersRead = accepted.reduce((sum, sample) => sum + sample.characters, 0);
      draft.speedSampleMs = accepted.reduce((sum, sample) => sum + sample.durationMs, 0);
    }
    if (!draft || (draft.activeMs < 30_000 && draft.screensRead === 0)) return;
    const {
      lastAt: _lastAt,
      lastSnapshot: _lastSnapshot,
      seenRanges: _seenRanges,
      speedSamples: _speedSamples,
      ...session
    } = draft;
    await this.save({ ...session, id: crypto.randomUUID(), endedAt: new Date(now).toISOString() });
  }

  private createDraft(snapshot: PagerSnapshot, now: number): DraftSession {
    const book = this.book!;
    return {
      bookFingerprint: book.fingerprint,
      bookTitle: book.title,
      deviceId: book.deviceId,
      startedAt: new Date(now).toISOString(),
      activeMs: 0,
      speedSampleMs: 0,
      screensRead: 0,
      wordsRead: 0,
      charactersRead: 0,
      startProgress: snapshot.progress,
      endProgress: snapshot.progress,
      lastAt: now,
      lastSnapshot: snapshot,
      seenRanges: new Set(),
      speedSamples: [],
    };
  }
}
