import {
  isReaderState,
  compactTombstones,
  mergeReaderStates,
  READER_STATE_VERSION,
  type SyncSnapshot,
} from '../reader/state';
import { BaseCloudProvider, type CloudProvider, type ProviderStatusEvent, type RemoteDocument } from './provider';
import { t } from '../i18n';
import type { ReadingSession } from '../reader/analytics';

const SNAPSHOT_PREFIX = `chitalka-v${READER_STATE_VERSION}-`;
const SYNC_DELAY = 2500;
const SYNC_INTERVAL = 60_000;
const SNAPSHOT_RETENTION = 30 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const ANALYTICS_PREFIX = 'chitalka-analytics-v1-';
const MAX_ANALYTICS_SEGMENT_BYTES = 512 * 1024;

export interface SyncEvent {
  type: 'started' | 'completed' | 'error';
  lastSyncAt?: string;
  message?: string;
}

export interface StateRepository {
  read(): Promise<import('../reader/state').ReaderState>;
  update(
    mutator: (draft: import('../reader/state').ReaderState) => void,
    source?: 'local' | 'sync',
  ): Promise<import('../reader/state').ReaderState>;
  subscribe(
    listener: (state: import('../reader/state').ReaderState, source: 'local' | 'sync') => void,
  ): () => void;
}

export interface AnalyticsSyncRepository {
  list(): Promise<ReadingSession[]>;
  merge(sessions: readonly ReadingSession[]): Promise<void>;
  clearBefore?(timestamp: string | null | undefined): Promise<void>;
}

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : sortedJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${sortedJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function contentHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeAnalyticsSegment(session: ReadingSession): Promise<{ content: string; name: string }> {
  const content = sortedJson({ schemaVersion: 1, sessions: [session] });
  const hash = await contentHash(content);
  return {
    content,
    name: `${ANALYTICS_PREFIX}${session.deviceId}-${session.id}-${hash}.json`,
  };
}

async function parseAnalyticsSegment(document: RemoteDocument, content: string): Promise<ReadingSession[] | undefined> {
  if (!document.name.startsWith(ANALYTICS_PREFIX) || new Blob([content]).size > MAX_ANALYTICS_SEGMENT_BYTES) return undefined;
  const match = document.name.match(/^chitalka-analytics-v1-(.+)-([0-9a-f-]+)-([0-9a-f]{64})\.json$/u);
  if (!match) return undefined;
  try {
    const value = JSON.parse(content) as { schemaVersion?: number; sessions?: ReadingSession[] };
    if (value.schemaVersion !== 1 || !Array.isArray(value.sessions)) return undefined;
    if (await contentHash(content) !== match[3]) return undefined;
    return value.sessions.filter((session) => session && typeof session.id === 'string' && typeof session.deviceId === 'string');
  } catch {
    return undefined;
  }
}

function parseSnapshot(content: string): SyncSnapshot | undefined {
  try {
    const value = JSON.parse(content) as Partial<SyncSnapshot>;
    if (
      value.schemaVersion !== READER_STATE_VERSION
      || typeof value.deviceId !== 'string'
      || !Number.isSafeInteger(value.sequence)
      || typeof value.generatedAt !== 'string'
      || !isReaderState(value.state)
    ) return undefined;
    return value as SyncSnapshot;
  } catch {
    return undefined;
  }
}

export async function encodeSnapshot(snapshot: SyncSnapshot): Promise<{
  content: string;
  name: string;
}> {
  const content = sortedJson(snapshot);
  const hash = await contentHash(content);
  return {
    content,
    name: `${SNAPSHOT_PREFIX}${snapshot.deviceId}-${snapshot.sequence}-${hash}.json`,
  };
}

async function validateSnapshot(
  document: RemoteDocument,
  content: string,
): Promise<SyncSnapshot | undefined> {
  if ((document.size !== undefined && document.size > MAX_SNAPSHOT_BYTES)
    || new Blob([content]).size > MAX_SNAPSHOT_BYTES) return undefined;
  const snapshot = parseSnapshot(content);
  const match = document.name.match(/^chitalka-v1-(.+)-(\d+)-([0-9a-f]{64})\.json$/u);
  if (!snapshot || !match) return undefined;
  const [, deviceId, sequence, expectedHash] = match;
  if (snapshot.deviceId !== deviceId || snapshot.sequence !== Number(sequence)) return undefined;
  return await contentHash(content) === expectedHash ? snapshot : undefined;
}

export class SyncEngine {
  private timer?: number;
  private interval?: number;
  private running = false;
  private rerun = false;
  private readonly snapshotCache = new Map<string, SyncSnapshot>();
  private readonly listeners = new Set<(event: SyncEvent) => void>();

  constructor(
    private readonly repository: StateRepository,
    readonly providers: CloudProvider[],
    private readonly analytics?: AnalyticsSyncRepository,
  ) {
    repository.subscribe((_state, source) => {
      if (source === 'local') this.schedule();
    });
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('online', this.handleOnline);
    this.interval = window.setInterval(() => {
      if (!document.hidden) void this.syncNow();
    }, SYNC_INTERVAL);
  }

  subscribe(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  providerEvents(listener: (event: ProviderStatusEvent) => void): () => void {
    const subscriptions = this.providers.map((provider) => provider.subscribe(listener));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  schedule(): void {
    if (!this.connectedProviders().length) return;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.syncNow();
    }, SYNC_DELAY);
  }

  async syncNow(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    const providers = this.connectedProviders();
    if (!providers.length || !navigator.onLine) return;
    this.running = true;
    this.emit({ type: 'started' });
    providers.forEach((provider) => (provider as BaseCloudProvider).setSyncing?.(true));
    try {
      let merged = await this.repository.read();
      const providerDocuments = new Map<CloudProvider, RemoteDocument[]>();
      const providerValidNames = new Map<CloudProvider, Set<string>>();

      for (const provider of providers) {
        try {
          const documents = await provider.list();
          providerDocuments.set(provider, documents);
          const validNames = new Set<string>();
          providerValidNames.set(provider, validNames);
          for (const document of documents) {
            if (document.name.startsWith(ANALYTICS_PREFIX)) {
              const content = await provider.download(document);
              const sessions = await parseAnalyticsSegment(document, content);
              if (sessions) await this.analytics?.merge(sessions);
              else this.emit({ type: 'error', message: t('error.snapshotCorrupt', { provider: provider.label, name: document.name }) });
              continue;
            }
            const cached = this.snapshotCache.get(document.name);
            if (cached) {
              merged = mergeReaderStates(merged, cached.state);
              validNames.add(document.name);
              continue;
            }
            const content = await provider.download(document);
            const snapshot = await validateSnapshot(document, content);
            if (snapshot) {
              this.snapshotCache.set(document.name, snapshot);
              merged = mergeReaderStates(merged, snapshot.state);
              validNames.add(document.name);
            } else {
              this.emit({
                type: 'error',
                message: t('error.snapshotCorrupt', { provider: provider.label, name: document.name }),
              });
            }
          }
        } catch (error) {
          this.emit({ type: 'error', message: error instanceof Error ? error.message : t('error.cloud') });
        }
      }

      merged = compactTombstones(merged);
      await this.analytics?.clearBefore?.(merged.analyticsCleared?.value);

      const before = sortedJson(await this.repository.read());
      const after = sortedJson(merged);
      if (before !== after) {
        await this.repository.update((draft) => {
          const localDeviceId = draft.deviceId;
          Object.assign(draft, structuredClone(merged), { deviceId: localDeviceId });
        }, 'sync');
        merged = await this.repository.read();
      }

      const mergedJson = sortedJson(merged);
      let reusable = Array.from(this.snapshotCache.entries()).find(([, candidate]) => (
        candidate.deviceId === merged.deviceId
        && sortedJson(candidate.state) === mergedJson
      ));
      if (!reusable) {
        const snapshot: SyncSnapshot = {
          schemaVersion: READER_STATE_VERSION,
          deviceId: merged.deviceId,
          sequence: merged.logicalCounter,
          generatedAt: new Date().toISOString(),
          state: merged,
        };
        const encoded = await encodeSnapshot(snapshot);
        reusable = [encoded.name, snapshot];
      }
      const [name, snapshot] = reusable;
      const content = sortedJson(snapshot);
      this.snapshotCache.set(name, snapshot);

      let allProvidersConverged = true;
      const analyticsSegments = this.analytics
        ? await Promise.all((await this.analytics.list()).map((session) => encodeAnalyticsSegment(session)))
        : [];
      for (const provider of providers) {
        const documents = providerDocuments.get(provider);
        const validNames = providerValidNames.get(provider);
        if (!documents || !validNames) {
          allProvidersConverged = false;
          continue;
        }
        if (validNames.has(name)) continue;
        try {
          await provider.upload(name, content);
          const refreshed = await provider.list();
          const uploaded = refreshed.find((document) => document.name === name);
          if (!uploaded) throw new Error(t('error.snapshotUploadedMissing', { provider: provider.label }));
          const uploadedContent = await provider.download(uploaded);
          if (uploadedContent !== content || !(await validateSnapshot(uploaded, uploadedContent))) {
            throw new Error(t('error.snapshotVerification', { provider: provider.label }));
          }
          providerDocuments.set(provider, refreshed);
          validNames.add(name);
        } catch (error) {
          allProvidersConverged = false;
          this.emit({ type: 'error', message: error instanceof Error ? error.message : t('error.upload') });
        }
      }

      for (const provider of providers) {
        const documents = providerDocuments.get(provider);
        if (!documents) continue;
        const names = new Set(documents.map((document) => document.name));
        for (const segment of analyticsSegments) {
          if (!names.has(segment.name)) await provider.upload(segment.name, segment.content);
        }
      }

      if (allProvidersConverged) {
        for (const provider of providers) {
          const documents = providerDocuments.get(provider);
          if (documents) await this.compact(provider, documents);
        }
      }

      const lastSyncAt = new Date().toISOString();
      localStorage.setItem('chitalka:sync:last', lastSyncAt);
      this.emit({ type: 'completed', lastSyncAt });
    } catch (error) {
      this.emit({ type: 'error', message: error instanceof Error ? error.message : t('error.syncFailed') });
    } finally {
      providers.forEach((provider) => (provider as BaseCloudProvider).setSyncing?.(false));
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule();
      }
    }
  }

  destroy(): void {
    if (this.timer) window.clearTimeout(this.timer);
    if (this.interval) window.clearInterval(this.interval);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('focus', this.handleFocus);
    window.removeEventListener('online', this.handleOnline);
  }

  private connectedProviders(): CloudProvider[] {
    return this.providers.filter((provider) => provider.status === 'connected' || provider.status === 'syncing');
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async compact(provider: CloudProvider, documents: RemoteDocument[]): Promise<void> {
    const groups = new Map<string, Array<{ document: RemoteDocument; snapshot: SyncSnapshot }>>();
    for (const document of documents) {
      const snapshot = this.snapshotCache.get(document.name);
      if (!snapshot) continue;
      const entries = groups.get(snapshot.deviceId) ?? [];
      entries.push({ document, snapshot });
      groups.set(snapshot.deviceId, entries);
    }
    const cutoff = Date.now() - SNAPSHOT_RETENTION;
    for (const entries of groups.values()) {
      entries.sort((first, second) => (
        second.snapshot.sequence - first.snapshot.sequence
        || second.snapshot.generatedAt.localeCompare(first.snapshot.generatedAt)
      ));
      for (const entry of entries.slice(2)) {
        if (Date.parse(entry.snapshot.generatedAt) >= cutoff) continue;
        try {
          await provider.delete(entry.document);
          this.snapshotCache.delete(entry.document.name);
        } catch {
          // Compaction is best effort and never makes synchronization fail.
        }
      }
    }
  }

  private readonly handleVisibility = (): void => {
    if (!document.hidden) void this.syncNow();
  };
  private readonly handleFocus = (): void => void this.syncNow();
  private readonly handleOnline = (): void => void this.syncNow();
}
