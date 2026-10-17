/**
 * Çevrimdışı depo: tarayıcının IndexedDB'si. Sunucuya ulaşılamadığında son
 * görülen listeler ve sıraya alınan işlemler burada durur. IndexedDB
 * kullanılamıyorsa (gizli pencere, kapalı site verisi) bellekte tutulur —
 * uygulama yine çalışır, yalnız sayfa yenilenince kuyruk kaybolur.
 */
const DB_NAME = 'stocktrack-offline';
const VERSION = 1;
export type StoreName = 'cache' | 'outbox';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = {
  cache: new Map(),
  outbox: new Map(),
};

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('no-idb'));
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

function keyOf(store: StoreName, value: Record<string, unknown>): string {
  return String(store === 'cache' ? value.key : value.id);
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, 'readonly', (s) => s.get(key));
  } catch {
    return memory[store].get(key) as T | undefined;
  }
}

export async function idbPut<T extends Record<string, unknown>>(store: StoreName, value: T): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value));
  } catch {
    memory[store].set(keyOf(store, value), value);
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    memory[store].delete(key);
  }
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  try {
    return await run<T[]>(store, 'readonly', (s) => s.getAll());
  } catch {
    return [...memory[store].values()] as T[];
  }
}
