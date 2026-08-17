import type { ReaderSettings } from '../settings';
import { ReaderRepository } from './database';
import { positionStorage, type BookPosition } from './storage';
import {
  bookmarkId,
  nextRevision,
  quoteId,
  visibleBookmarks,
  visibleQuotes,
  type AnnotationColor,
  type BookmarkRecord,
  type BookRecord,
  type QuoteRecord,
  type ReaderState,
  type ReadingPosition,
  type TextLocator,
} from './state';

export interface BookRegistration {
  fingerprint: string;
  title: string;
  authors: string[];
  format: 'fb2' | 'epub';
  filename: string;
}
export interface AnnotationPresentation {
  chapter?: string;
  progress: number;
  note?: string;
  color?: AnnotationColor;
}

export interface QuoteDraft extends AnnotationPresentation {
  start: TextLocator;
  end: TextLocator;
  exact: string;
  prefix: string;
  suffix: string;
}

export class ReaderLibrary {
  constructor(readonly repository = new ReaderRepository()) {}

  async initialize(fallbackSettings: ReaderSettings): Promise<ReaderSettings> {
    let state = await this.repository.read();
    const missing = (Object.keys(fallbackSettings) as Array<keyof ReaderSettings>)
      .filter((key) => !state.settings[key]);
    if (missing.length) {
      state = await this.repository.update((draft) => {
        const now = new Date().toISOString();
        for (const key of missing) {
          const revision = nextRevision(draft);
          Object.assign(draft.settings, {
            [key]: { value: fallbackSettings[key], revision, updatedAt: now },
          });
        }
      });
    }
    return this.settingsFromState(state, fallbackSettings);
  }

  settingsFromState(state: ReaderState, fallback: ReaderSettings): ReaderSettings {
    const result = { ...fallback };
    for (const key of Object.keys(result) as Array<keyof ReaderSettings>) {
      const record = state.settings[key];
      if (record) Object.assign(result, { [key]: record.value });
    }
    return result;
  }

  async updateSetting<Key extends keyof ReaderSettings>(
    key: Key,
    value: ReaderSettings[Key],
  ): Promise<void> {
    await this.repository.update((state) => {
      state.settings[key] = {
        value,
        revision: nextRevision(state),
        updatedAt: new Date().toISOString(),
      } as ReaderState['settings'][Key];
    });
  }

  async registerBook(book: BookRegistration): Promise<BookRecord> {
    const now = new Date().toISOString();
    await this.repository.update((state) => {
      state.books[book.fingerprint] = { ...book, lastOpenedAt: now };
    });
    return { ...book, lastOpenedAt: now };
  }

  async position(bookFingerprint: string, legacyFilename: string): Promise<BookPosition> {
    const state = await this.repository.read();
    const current = state.positions[bookFingerprint];
    if (current) return structuredClone(current.value);

    const legacy = positionStorage(legacyFilename).read();
    const migrated: ReadingPosition = { ...legacy, progress: 0 };
    await this.repository.update((draft) => {
      if (draft.positions[bookFingerprint]) return;
      draft.positions[bookFingerprint] = {
        bookFingerprint,
        value: migrated,
        revision: nextRevision(draft),
        updatedAt: new Date().toISOString(),
      };
    });
    return legacy;
  }

  async savePosition(bookFingerprint: string, position: ReadingPosition): Promise<void> {
    await this.repository.update((state) => {
      state.positions[bookFingerprint] = {
        bookFingerprint,
        value: position,
        revision: nextRevision(state),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async addBookmark(
    bookFingerprint: string,
    anchor: string,
    presentation: AnnotationPresentation,
  ): Promise<BookmarkRecord> {
    const id = bookmarkId(bookFingerprint, anchor);
    let saved!: BookmarkRecord;
    await this.repository.update((state) => {
      const existing = state.bookmarks[id];
      const now = new Date().toISOString();
      saved = {
        id,
        kind: 'bookmark',
        bookFingerprint,
        anchor,
        chapter: presentation.chapter,
        progress: presentation.progress,
        note: presentation.note?.trim() ?? existing?.note ?? '',
        color: presentation.color ?? existing?.color ?? 'purple',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        revision: nextRevision(state),
      };
      state.bookmarks[id] = saved;
    });
    return saved;
  }

  async addQuote(bookFingerprint: string, draft: QuoteDraft): Promise<QuoteRecord> {
    const id = quoteId(bookFingerprint, draft.start, draft.end);
    let saved!: QuoteRecord;
    await this.repository.update((state) => {
      const existing = state.quotes[id];
      const now = new Date().toISOString();
      saved = {
        id,
        kind: 'quote',
        bookFingerprint,
        start: draft.start,
        end: draft.end,
        exact: draft.exact,
        prefix: draft.prefix,
        suffix: draft.suffix,
        chapter: draft.chapter,
        progress: draft.progress,
        note: draft.note?.trim() ?? existing?.note ?? '',
        color: draft.color ?? existing?.color ?? 'purple',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        revision: nextRevision(state),
      };
      state.quotes[id] = saved;
    });
    return saved;
  }

  async editBookmark(id: string, note: string, color: AnnotationColor): Promise<void> {
    await this.repository.update((state) => {
      const existing = state.bookmarks[id];
      if (!existing || existing.deletedAt) return;
      state.bookmarks[id] = {
        ...existing,
        note: note.trim(),
        color,
        updatedAt: new Date().toISOString(),
        revision: nextRevision(state),
      };
    });
  }

  async editQuote(id: string, note: string, color: AnnotationColor): Promise<void> {
    await this.repository.update((state) => {
      const existing = state.quotes[id];
      if (!existing || existing.deletedAt) return;
      state.quotes[id] = {
        ...existing,
        note: note.trim(),
        color,
        updatedAt: new Date().toISOString(),
        revision: nextRevision(state),
      };
    });
  }

  async deleteBookmark(id: string): Promise<void> {
    await this.repository.update((state) => {
      const existing = state.bookmarks[id];
      if (!existing || existing.deletedAt) return;
      const now = new Date().toISOString();
      state.bookmarks[id] = {
        ...existing,
        updatedAt: now,
        deletedAt: now,
        revision: nextRevision(state),
      };
    });
  }

  async deleteQuote(id: string): Promise<void> {
    await this.repository.update((state) => {
      const existing = state.quotes[id];
      if (!existing || existing.deletedAt) return;
      const now = new Date().toISOString();
      state.quotes[id] = {
        ...existing,
        updatedAt: now,
        deletedAt: now,
        revision: nextRevision(state),
      };
    });
  }

  async bookmarks(bookFingerprint: string): Promise<BookmarkRecord[]> {
    return visibleBookmarks(await this.repository.read(), bookFingerprint);
  }

  async quotes(bookFingerprint: string): Promise<QuoteRecord[]> {
    return visibleQuotes(await this.repository.read(), bookFingerprint);
  }
}
