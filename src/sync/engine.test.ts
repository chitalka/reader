import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyReaderState, type ReaderState, type SyncSnapshot } from '../reader/state';
import { encodeAnalyticsSegment, encodeSnapshot, SyncEngine, type AnalyticsSyncRepository, type StateRepository } from './engine';
import type { ReadingSession } from '../reader/analytics';
import type {
  CloudProvider,
  ProviderId,
  ProviderStatus,
  ProviderStatusEvent,
  RemoteDocument,
} from './provider';

class MemoryRepository implements StateRepository {
  private readonly listeners = new Set<(state: ReaderState, source: 'local' | 'sync') => void>();
  constructor(private state: ReaderState) {}

  async read(): Promise<ReaderState> {
    return structuredClone(this.state);
  }

  async update(
    mutator: (draft: ReaderState) => void,
    source: 'local' | 'sync' = 'local',
  ): Promise<ReaderState> {
    const draft = structuredClone(this.state);
    mutator(draft);
    this.state = draft;
    for (const listener of this.listeners) listener(structuredClone(draft), source);
    return structuredClone(draft);
  }

  subscribe(listener: (state: ReaderState, source: 'local' | 'sync') => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class MemoryProvider implements CloudProvider {
  status: ProviderStatus = 'connected';
  readonly documents = new Map<string, string>();

  constructor(
    readonly id: ProviderId = 'google',
    readonly label = 'Memory',
  ) {}

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(): Promise<RemoteDocument[]> {
    return Array.from(this.documents.keys(), (name) => ({ id: name, name }));
  }
  async download(document: RemoteDocument): Promise<string> {
    return this.documents.get(document.id)!;
  }
  async upload(name: string, content: string): Promise<void> {
    this.documents.set(name, content);
  }
  async delete(document: RemoteDocument): Promise<void> {
    this.documents.delete(document.id);
  }
  subscribe(listener: (event: ProviderStatusEvent) => void): () => void {
    listener({ provider: this.id, status: this.status });
    return () => undefined;
  }
}

class MemoryAnalytics implements AnalyticsSyncRepository {
  constructor(readonly sessions = new Map<string, ReadingSession>()) {}
  async list(): Promise<ReadingSession[]> { return Array.from(this.sessions.values()); }
  async merge(values: readonly ReadingSession[]): Promise<void> {
    values.forEach((value) => this.sessions.set(value.id, structuredClone(value)));
  }
}

function readingSession(id: string, deviceId: string): ReadingSession {
  return {
    id, deviceId, bookFingerprint: 'book', bookTitle: 'Book',
    startedAt: '2026-01-01T10:00:00.000Z', endedAt: '2026-01-01T10:10:00.000Z',
    activeMs: 600_000, speedSampleMs: 600_000, screensRead: 8, wordsRead: 2_000,
    charactersRead: 12_000, startProgress: 10, endProgress: 20,
  };
}

describe('SyncEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  it('pulls, merges per-field state and uploads a converged immutable snapshot', async () => {
    const local = createEmptyReaderState('local-device');
    local.logicalCounter = 2;
    local.settings.theme = {
      value: 'dark',
      revision: { counter: 2, deviceId: local.deviceId },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const remote = createEmptyReaderState('remote-device');
    remote.logicalCounter = 4;
    remote.settings.fontSize = {
      value: 24,
      revision: { counter: 4, deviceId: remote.deviceId },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const snapshot: SyncSnapshot = {
      schemaVersion: 1,
      deviceId: remote.deviceId,
      sequence: remote.logicalCounter,
      generatedAt: '2026-01-02T00:00:00.000Z',
      state: remote,
    };
    const provider = new MemoryProvider();
    const encoded = await encodeSnapshot(snapshot);
    provider.documents.set(encoded.name, encoded.content);
    const repository = new MemoryRepository(local);
    const engine = new SyncEngine(repository, [provider]);

    await engine.syncNow();

    const result = await repository.read();
    expect(result.deviceId).toBe('local-device');
    expect(result.settings.theme?.value).toBe('dark');
    expect(result.settings.fontSize?.value).toBe(24);
    expect(Array.from(provider.documents.keys()).some((name) => name.includes('local-device'))).toBe(true);
    engine.destroy();
  });

  it('does not create a new immutable snapshot when state has not changed', async () => {
    const repository = new MemoryRepository(createEmptyReaderState('local-device'));
    const provider = new MemoryProvider();
    const engine = new SyncEngine(repository, [provider]);

    await engine.syncNow();
    const firstNames = Array.from(provider.documents.keys());
    await engine.syncNow();

    expect(Array.from(provider.documents.keys())).toEqual(firstNames);
    engine.destroy();
  });

  it('mirrors the same verified snapshot to both connected providers', async () => {
    const repository = new MemoryRepository(createEmptyReaderState('local-device'));
    const google = new MemoryProvider('google', 'Google');
    const yandex = new MemoryProvider('yandex', 'Yandex');
    const engine = new SyncEngine(repository, [google, yandex]);

    await engine.syncNow();

    expect(Array.from(google.documents.entries())).toEqual(Array.from(yandex.documents.entries()));
    engine.destroy();
  });

  it('pulls and uploads immutable analytics segments without duplicates', async () => {
    const repository = new MemoryRepository(createEmptyReaderState('local-device'));
    const provider = new MemoryProvider();
    const remote = readingSession('11111111-1111-4111-8111-111111111111', 'remote-device');
    const encoded = await encodeAnalyticsSegment(remote);
    provider.documents.set(encoded.name, encoded.content);
    const analytics = new MemoryAnalytics(new Map([
      ['22222222-2222-4222-8222-222222222222', readingSession('22222222-2222-4222-8222-222222222222', 'local-device')],
    ]));
    const engine = new SyncEngine(repository, [provider], analytics);

    await engine.syncNow();

    expect(analytics.sessions.has(remote.id)).toBe(true);
    expect(Array.from(provider.documents.keys()).filter((name) => name.startsWith('chitalka-analytics-v1-'))).toHaveLength(2);
    engine.destroy();
  });

  it('rejects a cloud document whose content does not match its filename hash', async () => {
    const local = createEmptyReaderState('local-device');
    local.settings.theme = {
      value: 'dark',
      revision: { counter: 1, deviceId: local.deviceId },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    local.logicalCounter = 1;
    const repository = new MemoryRepository(local);
    const provider = new MemoryProvider();
    provider.documents.set(
      `chitalka-v1-remote-device-10-${'0'.repeat(64)}.json`,
      JSON.stringify({ schemaVersion: 1 }),
    );
    const engine = new SyncEngine(repository, [provider]);
    const errors: string[] = [];
    engine.subscribe((event) => {
      if (event.type === 'error' && event.message) errors.push(event.message);
    });

    await engine.syncNow();

    expect((await repository.read()).settings.theme?.value).toBe('dark');
    expect(errors.some((message) => message.includes('corrupt snapshot'))).toBe(true);
    engine.destroy();
  });
});
