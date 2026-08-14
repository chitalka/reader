export class JsonStorage<T> {
  constructor(
    private readonly key: string,
    private readonly fallback: T,
  ) {}

  read(): T {
    try {
      const value = window.localStorage.getItem(this.key);
      return value ? { ...this.fallback, ...JSON.parse(value) as T } : structuredClone(this.fallback);
    } catch {
      return structuredClone(this.fallback);
    }
  }

  write(value: T): void {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(value));
    } catch {
      // Reading must continue even when storage is disabled or full.
    }
  }
}

export interface BookPosition {
  anchor?: string;
  column: number;
  chunk?: number;
  chunkColumn?: number;
}

export function normalizeBookFilename(filename: string): string {
  const basename = filename.replaceAll('\\', '/').split('/').pop()?.trim() ?? '';
  return (basename || 'book.fb2').toLocaleLowerCase('ru-RU');
}

export function positionStorage(filename: string): JsonStorage<BookPosition> {
  const bookKey = encodeURIComponent(normalizeBookFilename(filename));
  return new JsonStorage(`chitalka:position:${bookKey}`, { column: 0 });
}
