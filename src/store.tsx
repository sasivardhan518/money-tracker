import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AuthError, hasToken, needsRenew, signIn } from './auth';
import { download, upload, version } from './drive';
import { writeCache, type Cache } from './local';
import { merge } from './merge';
import { postDue, today } from './money';
import type { Account, Category, Data, Recurring, Txn } from './types';

type Coll = { accounts: Account; categories: Category; txns: Txn; recurring: Recurring };
export type Action =
  | { [K in keyof Coll]: { type: 'upsert'; coll: K; item: Coll[K] } }[keyof Coll]
  | { type: 'remove'; coll: keyof Coll; id: string }
  | { type: 'patch'; patch: Partial<Pick<Data, 'currency' | 'rates'>> }
  | { type: 'add'; accounts?: Account[]; categories?: Category[]; txns?: Txn[] }
  | { type: 'replace'; data: Data }
  | { type: 'postDue' };

function reducer(d: Data, a: Action): Data {
  switch (a.type) {
    case 'upsert': {
      const list = d[a.coll] as { id: string }[];
      const exists = list.some((x) => x.id === a.item.id);
      const next = { ...d, [a.coll]: exists ? list.map((x) => (x.id === a.item.id ? a.item : x)) : [...list, a.item] };
      return a.coll === 'recurring' ? postDue(next, today()) : next;
    }
    case 'remove':
      return { ...d, [a.coll]: (d[a.coll] as { id: string }[]).filter((x) => x.id !== a.id) };
    case 'patch':
      return { ...d, ...a.patch };
    case 'add':
      return {
        ...d,
        accounts: [...d.accounts, ...(a.accounts ?? [])],
        categories: [...d.categories, ...(a.categories ?? [])],
        txns: [...d.txns, ...(a.txns ?? [])],
      };
    case 'replace':
      return a.data;
    case 'postDue':
      return postDue(d, today());
  }
}

/** synced: Drive matches this device. pending: local edits not uploaded yet. */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'auth' | 'error';

interface Store {
  data: Data;
  dispatch: (a: Action) => void;
  status: SyncStatus;
  error: string;
  email: string;
  /** Click handler: signs in again if needed, then syncs. */
  connect: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

const same = (a: Data, b: Data) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Offline-first: every change is written to IndexedDB at once, then synced to Drive in the background
 * with a three-way merge (see merge.ts), so edits made offline or on other devices are combined.
 */
export function StoreProvider({ cache, children }: { cache: Cache; children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, cache.local, (d) => postDue(d, today()));
  const [status, setStatus] = useState<SyncStatus>('pending');
  const [error, setError] = useState('');
  const dataRef = useRef(data);
  const baseRef = useRef(cache.base);
  const busy = useRef(false);
  dataRef.current = data;

  const sync = useCallback(async () => {
    if (busy.current) return;
    if (!navigator.onLine) return setStatus('offline');
    if (!hasToken()) return setStatus('auth');
    busy.current = true;
    setStatus('syncing');
    try {
      const start = dataRef.current;
      let remote: Data, merged: Data;
      for (let attempt = 0; ; attempt++) {
        const v = await version(cache.fileId);
        remote = await download(cache.fileId);
        merged = merge(baseRef.current, start, remote);
        if (same(merged, remote)) break;
        // Another device uploaded after our download: merge again instead of overwriting its edits.
        // shortcut: a few ms remain unguarded between this check and the upload; use a conditional upload if Drive offers one.
        if ((await version(cache.fileId)) !== v && attempt < 3) continue;
        await upload(cache.fileId, merged);
        break;
      }
      baseRef.current = merged;
      // Keep edits made while this sync was running.
      const now = merge(start, dataRef.current, merged);
      if (!same(now, dataRef.current)) dispatch({ type: 'replace', data: now });
      writeCache({ ...cache, base: merged, local: now });
      setError('');
      setStatus(same(now, merged) ? 'synced' : 'pending');
    } catch (e) {
      console.error(e);
      if (e instanceof AuthError) setStatus('auth');
      else if (!navigator.onLine) setStatus('offline');
      else {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      busy.current = false;
    }
  }, [cache]);

  // Save every change locally right away, then sync shortly after.
  useEffect(() => {
    writeCache({ ...cache, base: baseRef.current, local: data });
    if (same(data, baseRef.current)) return;
    setStatus((s) => (s === 'auth' || s === 'offline' ? s : 'pending'));
    const t = setTimeout(sync, 1000);
    return () => clearTimeout(t);
  }, [data, cache, sync]);

  // Initial pull (no-op without a token: the UI then offers "Connect").
  useEffect(() => {
    sync();
  }, [sync]);

  // Pull other devices' changes: when coming online, returning to the tab, every minute, and at midnight for recurring.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        dispatch({ type: 'postDue' });
        sync();
      }
    };
    const offline = () => setStatus('offline');
    window.addEventListener('online', sync);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(() => document.visibilityState === 'visible' && onVisible(), 60_000);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [sync]);

  const connect = useCallback(async () => {
    try {
      if (needsRenew()) {
        const who = await signIn('', cache.email);
        if (who && who !== cache.email) {
          setStatus('error');
          return setError(`You signed in as ${who}, but this device's data belongs to ${cache.email}. Sign out to switch accounts.`);
        }
      }
      await sync();
    } catch (e) {
      console.error(e);
      setStatus('auth');
    }
  }, [cache.email, sync]);

  // Google gives browser-only apps no refresh token, and the popup that gets a new one is only allowed
  // right after a user action. So the first click or keypress after the token is missing or about to
  // expire renews it. Once consent was given the popup closes by itself, so the user stays connected.
  useEffect(() => {
    let backoffUntil = 0;
    const onGesture = () => {
      if (!needsRenew() || !navigator.onLine || Date.now() < backoffUntil) return;
      backoffUntil = Date.now() + 10 * 60_000; // if the popup is closed or blocked, don't reopen it on every click
      connect();
    };
    window.addEventListener('click', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('click', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
  }, [connect]);

  return <Ctx.Provider value={{ data, dispatch, status, error, email: cache.email, connect }}>{children}</Ctx.Provider>;
}
