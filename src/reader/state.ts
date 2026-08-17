import type { ReaderSettings } from '../settings';
import type { BookPosition } from './storage';

export const READER_STATE_VERSION = 1;
export const ANNOTATION_COLORS = ['purple', 'blue', 'green', 'yellow', 'orange', 'pink'] as const;

export type AnnotationColor = typeof ANNOTATION_COLORS[number];

export interface Revision {
  counter: number;
  deviceId: string;
}

export interface VersionedValue<T> {
  value: T;
  revision: Revision;
  updatedAt: string;
}

export type SyncedSettings = {
  [Key in keyof ReaderSettings]: VersionedValue<ReaderSettings[Key]>;
};

export interface BookRecord {
  fingerprint: string;
  title: string;
  authors: string[];
  format: 'fb2' | 'epub';
  filename: string;
  lastOpenedAt: string;
}

export interface ReadingPosition extends BookPosition {
  progress: number;
}

export interface PositionRecord extends VersionedValue<ReadingPosition> {
  bookFingerprint: string;
}

export interface TextLocator {
  anchor: string;
  offset: number;
}

export interface AnnotationBase {
  id: string;
  bookFingerprint: string;
  chapter?: string;
  progress: number;
  note: string;
  color: AnnotationColor;
  createdAt: string;
  updatedAt: string;
  revision: Revision;
  deletedAt?: string;
}

export interface BookmarkRecord extends AnnotationBase {
  kind: 'bookmark';
  anchor: string;
}

export interface QuoteRecord extends AnnotationBase {
  kind: 'quote';
  start: TextLocator;
  end: TextLocator;
  exact: string;
  prefix: string;
  suffix: string;
}

export interface ReaderState {
  schemaVersion: typeof READER_STATE_VERSION;
  deviceId: string;
  logicalCounter: number;
  settings: Partial<SyncedSettings>;
  books: Record<string, BookRecord>;
  positions: Record<string, PositionRecord>;
  bookmarks: Record<string, BookmarkRecord>;
  quotes: Record<string, QuoteRecord>;
}

export interface SyncSnapshot {
  schemaVersion: typeof READER_STATE_VERSION;
  deviceId: string;
  sequence: number;
  generatedAt: string;
  state: ReaderState;
}

export function createDeviceId(): string {
  return crypto.randomUUID();
}

export function createEmptyReaderState(deviceId = createDeviceId()): ReaderState {
  return {
    schemaVersion: READER_STATE_VERSION,
    deviceId,
    logicalCounter: 0,
    settings: {},
    books: {},
    positions: {},
    bookmarks: {},
    quotes: {},
  };
}

export function compareRevisions(first: Revision, second: Revision): number {
  return first.counter - second.counter || first.deviceId.localeCompare(second.deviceId);
}

export function nextRevision(state: ReaderState): Revision {
  state.logicalCounter += 1;
  return { counter: state.logicalCounter, deviceId: state.deviceId };
}

export function bookmarkId(bookFingerprint: string, anchor: string): string {
  return `bookmark:${bookFingerprint}:${encodeURIComponent(anchor)}`;
}

export function quoteId(
  bookFingerprint: string,
  start: TextLocator,
  end: TextLocator,
): string {
  return [
    'quote',
    bookFingerprint,
    encodeURIComponent(start.anchor),
    start.offset,
    encodeURIComponent(end.anchor),
    end.offset,
  ].join(':');
}

function latest<T extends { revision: Revision }>(
  first: T | undefined,
  second: T | undefined,
): T | undefined {
  if (!first) return second ? structuredClone(second) : undefined;
  if (!second) return structuredClone(first);
  return structuredClone(compareRevisions(first.revision, second.revision) >= 0 ? first : second);
}

function mergeVersionedMap<T extends { revision: Revision }>(
  first: Record<string, T>,
  second: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const key of new Set([...Object.keys(first), ...Object.keys(second)])) {
    const value = latest(first[key], second[key]);
    if (value) result[key] = value;
  }
  return result;
}

function bookTime(book: BookRecord): number {
  const value = Date.parse(book.lastOpenedAt);
  return Number.isFinite(value) ? value : 0;
}

export function mergeReaderStates(first: ReaderState, second: ReaderState): ReaderState {
  const settings: Partial<SyncedSettings> = {};
  const settingKeys = new Set([
    ...Object.keys(first.settings),
    ...Object.keys(second.settings),
  ] as Array<keyof ReaderSettings>);
  for (const key of settingKeys) {
    const value = latest(first.settings[key], second.settings[key]) as SyncedSettings[typeof key] | undefined;
    if (value) Object.assign(settings, { [key]: value });
  }

  const books: Record<string, BookRecord> = {};
  for (const key of new Set([...Object.keys(first.books), ...Object.keys(second.books)])) {
    const firstBook = first.books[key];
    const secondBook = second.books[key];
    const selected = !firstBook
      ? secondBook
      : !secondBook || bookTime(firstBook) >= bookTime(secondBook)
        ? firstBook
        : secondBook;
    if (selected) books[key] = structuredClone(selected);
  }

  return {
    schemaVersion: READER_STATE_VERSION,
    deviceId: first.deviceId,
    logicalCounter: Math.max(first.logicalCounter, second.logicalCounter),
    settings,
    books,
    positions: mergeVersionedMap(first.positions, second.positions),
    bookmarks: mergeVersionedMap(first.bookmarks, second.bookmarks),
    quotes: mergeVersionedMap(first.quotes, second.quotes),
  };
}

export function isReaderState(value: unknown): value is ReaderState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ReaderState>;
  return state.schemaVersion === READER_STATE_VERSION
    && typeof state.deviceId === 'string'
    && Number.isSafeInteger(state.logicalCounter)
    && Boolean(state.settings && state.books && state.positions && state.bookmarks && state.quotes);
}

export function visibleBookmarks(state: ReaderState, bookFingerprint: string): BookmarkRecord[] {
  return Object.values(state.bookmarks)
    .filter((record) => record.bookFingerprint === bookFingerprint && !record.deletedAt)
    .sort((first, second) => first.progress - second.progress || first.createdAt.localeCompare(second.createdAt));
}

export function visibleQuotes(state: ReaderState, bookFingerprint: string): QuoteRecord[] {
  return Object.values(state.quotes)
    .filter((record) => record.bookFingerprint === bookFingerprint && !record.deletedAt)
    .sort((first, second) => first.progress - second.progress || first.createdAt.localeCompare(second.createdAt));
}

export function compactTombstones(
  source: ReaderState,
  now = Date.now(),
  retentionMs = 30 * 24 * 60 * 60 * 1000,
): ReaderState {
  const state = structuredClone(source);
  const expired = (deletedAt: string | undefined): boolean => {
    if (!deletedAt) return false;
    const timestamp = Date.parse(deletedAt);
    return Number.isFinite(timestamp) && timestamp < now - retentionMs;
  };
  for (const [id, record] of Object.entries(state.bookmarks)) {
    if (!expired(record.deletedAt)) continue;
    state.bookmarks[id] = {
      ...record,
      chapter: undefined,
      progress: 0,
      note: '',
      color: 'purple',
    };
  }
  for (const [id, record] of Object.entries(state.quotes)) {
    if (!expired(record.deletedAt)) continue;
    state.quotes[id] = {
      ...record,
      exact: '',
      prefix: '',
      suffix: '',
      chapter: undefined,
      progress: 0,
      note: '',
      color: 'purple',
    };
  }
  return state;
}
