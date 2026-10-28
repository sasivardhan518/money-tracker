import { describe, expect, it } from 'vitest';
import { merge } from './merge';
import { emptyData } from './money';
import type { Data, Txn } from './types';

const tx = (id: string, amount = 100, note?: string): Txn => ({ id, date: '2026-01-01', type: 'expense', amount, accountId: 'a', ...(note ? { note } : {}) });
const data = (txns: Txn[], patch: Partial<Data> = {}): Data => ({ ...emptyData(), categories: [], txns, ...patch });

describe('merge', () => {
  const base = data([tx('1'), tx('2'), tx('3')]);

  it('keeps additions from both sides', () => {
    const m = merge(base, data([...base.txns, tx('L')]), data([...base.txns, tx('R')]));
    expect(m.txns.map((t) => t.id).sort()).toEqual(['1', '2', '3', 'L', 'R']);
  });

  it('takes the edit from whichever side changed', () => {
    const m = merge(base, data([tx('1', 999), tx('2'), tx('3')]), data([tx('1'), tx('2', 555), tx('3')]));
    expect(m.txns.map((t) => t.amount)).toEqual([999, 555, 100]);
  });

  it('local wins when both edited the same item', () => {
    const m = merge(base, data([tx('1', 1), tx('2'), tx('3')]), data([tx('1', 2), tx('2'), tx('3')]));
    expect(m.txns[0].amount).toBe(1);
  });

  it('applies deletes from either side', () => {
    const m = merge(base, data([tx('2'), tx('3')]), data([tx('1'), tx('2')]));
    expect(m.txns.map((t) => t.id)).toEqual(['2']);
  });

  it('an edit beats a delete', () => {
    expect(merge(base, data([tx('2'), tx('3')]), data([tx('1', 7), tx('2'), tx('3')])).txns.map((t) => t.id)).toContain('1');
    expect(merge(base, data([tx('1', 7), tx('2'), tx('3')]), data([tx('2'), tx('3')])).txns.find((t) => t.id === '1')?.amount).toBe(7);
  });

  it('merges scalars and rates per key', () => {
    const b = data([], { currency: 'USD', rates: { EUR: 1.1, GBP: 1.3 } });
    const m = merge(b, data([], { currency: 'INR', rates: { EUR: 1.2, GBP: 1.3 } }), data([], { currency: 'USD', rates: { EUR: 1.1, GBP: 1.25, JPY: 0.007 } }));
    expect(m.currency).toBe('INR');
    expect(m.rates).toEqual({ EUR: 1.2, GBP: 1.25, JPY: 0.007 });
  });

  it('is a no-op when nothing changed remotely', () => {
    const local = data([tx('1', 5), tx('3'), tx('9')]);
    expect(merge(base, local, base)).toEqual(local);
  });
});
