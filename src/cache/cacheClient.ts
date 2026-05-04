interface CacheEntry<T> {
  expiresAt?: number;
  value: T;
}

export interface CacheClient {
  readonly mode: string;
  delete(key: string): void;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
}

export class InMemoryCacheClient implements CacheClient {
  readonly mode = 'in-memory';

  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: ttlMs === undefined ? undefined : Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
