// Tiny IndexedDB key-value store for the offline copy of the data.
import type { Data } from './types';

/** What this device keeps between visits. */
export interface Cache {
  email: string;
  fileId: string;
  /** Last version known to match Drive: the merge base. */
  base: Data;
  /** Current data here, including edits not yet synced. */
  local: Data;
}

const KEY = 'cache';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('money-tracker', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readCache(): Promise<Cache | undefined> {
  try {
    return await run<Cache | undefined>('readonly', (s) => s.get(KEY));
  } catch {
    return undefined; // private mode / storage blocked: app still works online
  }
}

export const writeCache = (c: Cache) => run('readwrite', (s) => s.put(c, KEY)).catch((e) => console.error('cache write failed', e));
export const clearCache = () => run('readwrite', (s) => s.delete(KEY)).catch(() => {});
