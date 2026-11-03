// Einfacher In-Memory-Cache mit TTL (lebt pro Server-Prozess)

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    store.delete(key);
    return null;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheStale<T>(key: string): T | null {
  // Liefert auch abgelaufene Werte als Notfall-Fallback (z.B. wenn Quelle nicht erreichbar)
  const e = store.get(key);
  return e ? (e.value as T) : null;
}
