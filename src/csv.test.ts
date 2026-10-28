import { describe, expect, it } from 'vitest';
import { importCsv, parseCsv, toCsv } from './csv';
import { emptyData } from './money';
import type { Data } from './types';

function sample(): Data {
  const d = emptyData();
  d.categories = [{ id: 'food', name: 'Food', kind: 'expense' }];
  d.accounts = [
    { id: 'bank', name: 'Bank', type: 'bank', currency: 'USD', openingBalance: 0, archived: false },
    { id: 'eur', name: 'Euro', type: 'bank', currency: 'EUR', openingBalance: 0, archived: false },
  ];
  d.txns = [
    { id: '1', date: '2026-01-02', type: 'expense', amount: 1250, accountId: 'bank', categoryId: 'food', note: 'Lunch, "big"' },
    { id: '2', date: '2026-01-03', type: 'transfer', amount: 11000, accountId: 'bank', toAccountId: 'eur', toAmount: 10000 },
  ];
  return d;
}

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n"x\ny",z\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['x\ny', 'z'],
    ]);
  });
});

describe('csv round trip', () => {
  it('exports and re-imports into an empty file', () => {
    const csv = toCsv(sample());
    expect(csv.split('\r\n')[1]).toBe('2026-01-02,expense,12.50,USD,Bank,,,Food,"Lunch, ""big"""');
    const fresh = { ...emptyData(), categories: [] };
    const r = importCsv(csv, fresh);
    expect(r.errors).toEqual([]);
    expect(r.accounts.map((a) => [a.name, a.currency])).toEqual([
      ['Bank', 'USD'],
      ['Euro', 'USD'], // created as transfer target: currency unknown, defaults to base
    ]);
    expect(r.categories.map((c) => c.name)).toEqual(['Food']);
    expect(r.txns.map((t) => [t.type, t.amount, t.toAmount, t.note])).toEqual([
      ['expense', 1250, undefined, 'Lunch, "big"'],
      ['transfer', 11000, 10000, undefined],
    ]);
  });

  it('skips rows that already exist', () => {
    const d = sample();
    const r = importCsv(toCsv(d), d);
    expect(r).toMatchObject({ txns: [], accounts: [], categories: [], skipped: 2, errors: [] });
  });
});

describe('bank statement import', () => {
  it('uses sign for type and a default account', () => {
    const r = importCsv('Date,Description,Amount\n2026-02-01,Coffee,-3.50\n2026-02-02,Refund,10\n', sample(), 'bank');
    expect(r.txns.map((t) => [t.type, t.amount, t.accountId, t.note])).toEqual([
      ['expense', 350, 'bank', 'Coffee'],
      ['income', 1000, 'bank', 'Refund'],
    ]);
  });
  it('reports bad rows and missing columns', () => {
    expect(importCsv('Date,Amount\n2026-02-01,5', sample()).errors[0]).toMatch(/Account/);
    expect(importCsv('Foo\n1', sample(), 'bank').errors[0]).toMatch(/Date/);
    const r = importCsv('Date,Amount\n01/02/2026,5\n2026-02-01,abc\n2026-02-01,5', sample(), 'bank');
    expect(r.errors).toHaveLength(2);
    expect(r.txns).toHaveLength(1);
  });
});
