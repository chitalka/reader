import type { ReadingSession } from './analytics';

const DATABASE_NAME = 'chitalka-analytics';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB failed')), { once: true });
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB failed')), { once: true });
  });
}

export class AnalyticsRepository {
  private databasePromise?: Promise<IDBDatabase>;

  async add(session: ReadingSession): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    transaction.objectStore(SESSION_STORE).put(structuredClone(session));
    await done(transaction);
  }

  async merge(sessions: readonly ReadingSession[]): Promise<void> {
    if (!sessions.length) return;
    const database = await this.database();
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    sessions.forEach((session) => store.put(structuredClone(session)));
    await done(transaction);
  }

  async list(limit?: number): Promise<ReadingSession[]> {
    const database = await this.database();
    const transaction = database.transaction(SESSION_STORE, 'readonly');
    const sessions = await result(transaction.objectStore(SESSION_STORE).getAll()) as ReadingSession[];
    await done(transaction);
    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return limit ? sessions.slice(0, limit) : sessions;
  }

  async clear(): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    transaction.objectStore(SESSION_STORE).clear();
    await done(transaction);
  }

  async clearBefore(timestamp: string | null | undefined): Promise<void> {
    if (!timestamp) return;
    const sessions = await this.list();
    const obsolete = sessions.filter((session) => session.endedAt <= timestamp);
    if (!obsolete.length) return;
    const database = await this.database();
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    obsolete.forEach((session) => store.delete(session.id));
    await done(transaction);
  }

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SESSION_STORE)) database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB failed')), { once: true });
    });
    return this.databasePromise;
  }
}
