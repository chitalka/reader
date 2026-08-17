import { createEmptyReaderState, isReaderState, type ReaderState } from './state';

const DATABASE_NAME = 'chitalka-reader';
const DATABASE_VERSION = 1;
const STATE_STORE = 'state';
const STATE_KEY = 'reader';

type StateListener = (state: ReaderState, source: 'local' | 'sync') => void;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')), {
      once: true,
    });
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB aborted')), {
      once: true,
    });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB failed')), {
      once: true,
    });
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener('upgradeneeded', () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE);
  });
  return requestResult(request);
}

export class ReaderRepository {
  private readonly listeners = new Set<StateListener>();
  private databasePromise?: Promise<IDBDatabase>;
  private state?: ReaderState;
  private queue: Promise<unknown> = Promise.resolve();

  async read(): Promise<ReaderState> {
    if (this.state) return structuredClone(this.state);
    return this.enqueue(async () => {
      if (this.state) return structuredClone(this.state);
      const database = await this.database();
      const transaction = database.transaction(STATE_STORE, 'readonly');
      const value = await requestResult(transaction.objectStore(STATE_STORE).get(STATE_KEY));
      await transactionDone(transaction);
      this.state = isReaderState(value) ? value : createEmptyReaderState();
      if (!isReaderState(value)) await this.writeState(this.state);
      return structuredClone(this.state);
    });
  }

  async update(
    mutator: (draft: ReaderState) => void,
    source: 'local' | 'sync' = 'local',
  ): Promise<ReaderState> {
    return this.enqueue(async () => {
      const current = this.state ?? await this.readUnqueued();
      const draft = structuredClone(current);
      mutator(draft);
      await this.writeState(draft);
      this.state = draft;
      this.emit(source);
      return structuredClone(draft);
    });
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(source: 'local' | 'sync'): void {
    if (!this.state) return;
    const value = structuredClone(this.state);
    for (const listener of this.listeners) listener(value, source);
  }

  private async readUnqueued(): Promise<ReaderState> {
    const database = await this.database();
    const transaction = database.transaction(STATE_STORE, 'readonly');
    const value = await requestResult(transaction.objectStore(STATE_STORE).get(STATE_KEY));
    await transactionDone(transaction);
    this.state = isReaderState(value) ? value : createEmptyReaderState();
    if (!isReaderState(value)) await this.writeState(this.state);
    return this.state;
  }

  private async writeState(state: ReaderState): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(STATE_STORE, 'readwrite');
    transaction.objectStore(STATE_STORE).put(structuredClone(state), STATE_KEY);
    await transactionDone(transaction);
  }

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
