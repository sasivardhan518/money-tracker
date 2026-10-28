// Three-way merge used when two devices (or tabs) edited the data since the last sync.
// base = last version both sides agreed on; local = this device; remote = what is on Drive now.
// Per item: a side that did not change it takes the other side's version. If both changed it,
// this device wins, except that an edit always beats a delete.
import type { Data } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pick<T>(b: T | undefined, l: T | undefined, r: T | undefined): T | undefined {
  if (same(b, l)) return r;
  if (l === undefined && b !== undefined && !same(b, r)) return r; // deleted here, edited there
  return l;
}

function mergeList<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const map = (xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const [B, L, R] = [map(base), map(local), map(remote)];
  const ids = [...new Set([...remote.map((x) => x.id), ...local.map((x) => x.id)])];
  return ids.map((id) => pick(B.get(id), L.get(id), R.get(id))).filter((x): x is T => x !== undefined);
}

function mergeRecord(base: Record<string, number>, local: Record<string, number>, remote: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const v = pick(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function merge(base: Data, local: Data, remote: Data): Data {
  return {
    schemaVersion: 2,
    currency: pick(base.currency, local.currency, remote.currency)!,
    rates: mergeRecord(base.rates, local.rates, remote.rates),
    accounts: mergeList(base.accounts, local.accounts, remote.accounts),
    categories: mergeList(base.categories, local.categories, remote.categories),
    txns: mergeList(base.txns, local.txns, remote.txns),
    recurring: mergeList(base.recurring, local.recurring, remote.recurring),
  };
}
