import { describe, expect, it } from 'vitest';
import {
  balance,
  budgetStatus,
  byCategory,
  dueCount,
  upcoming,
  emptyData,
  filterTxns,
  missingRates,
  monthEnd,
  monthlySummary,
  netWorth,
  nextDate,
  normalize,
  occurrence,
  parseAmount,
  parseSigned,
  postDue,
  totals,
} from './money';
import type { Data, Recurring } from './types';

function sample(): Data {
  const d = emptyData();
  d.accounts = [
    { id: 'bank', name: 'Bank', type: 'bank', currency: 'USD', openingBalance: 100000, archived: false },
    { id: 'card', name: 'Card', type: 'credit', currency: 'USD', openingBalance: -20000, archived: false },
    { id: 'cash', name: 'Cash', type: 'cash', currency: 'USD', openingBalance: 0, archived: false },
  ];
  d.txns = [
    { id: '1', date: '2026-01-05', type: 'income', amount: 300000, accountId: 'bank', categoryId: 'salary' },
    { id: '2', date: '2026-01-10', type: 'expense', amount: 5000, accountId: 'card', categoryId: 'food', note: 'Pizza night' },
    { id: '3', date: '2026-02-01', type: 'transfer', amount: 25000, accountId: 'bank', toAccountId: 'card' },
    { id: '4', date: '2026-02-03', type: 'expense', amount: 2000, accountId: 'cash', categoryId: 'food' },
    { id: '5', date: '2026-02-20', type: 'expense', amount: 80000, accountId: 'bank', categoryId: 'rent' },
  ];
  return d;
}

/** Sample plus a EUR account at 1 EUR = 1.10 USD. */
function multi(): Data {
  const d = sample();
  d.rates = { EUR: 1.1 };
  d.accounts.push({ id: 'eur', name: 'Euro', type: 'bank', currency: 'EUR', openingBalance: 10000, archived: false });
  d.txns.push(
    { id: '6', date: '2026-02-21', type: 'expense', amount: 1000, accountId: 'eur', categoryId: 'food' },
    { id: '7', date: '2026-02-22', type: 'transfer', amount: 11000, accountId: 'bank', toAccountId: 'eur', toAmount: 10000 },
  );
  return d;
}

describe('balances', () => {
  it('applies opening balance, income, expense and transfers', () => {
    const d = sample();
    expect(balance('bank', d)).toBe(100000 + 300000 - 25000 - 80000);
    expect(balance('card', d)).toBe(-20000 - 5000 + 25000);
    expect(balance('cash', d)).toBe(-2000);
  });
  it('transfers do not change net worth', () => {
    expect(netWorth(sample())).toBe(80000 + 300000 - 5000 - 2000 - 80000);
  });
  it('respects upTo date', () => {
    expect(balance('bank', sample(), '2026-01-31')).toBe(400000);
  });
  it('adjustments change balance but not income/expense', () => {
    const d = sample();
    d.txns.push({ id: 'a', date: '2026-03-01', type: 'adjust', amount: -1500, accountId: 'cash' });
    expect(balance('cash', d)).toBe(-3500);
    expect(totals(d.txns, d)).toEqual(totals(sample().txns, sample()));
  });
});

describe('multi-currency', () => {
  it('keeps balances in account currency and uses toAmount for cross-currency transfers', () => {
    const d = multi();
    expect(balance('eur', d)).toBe(10000 - 1000 + 10000);
    expect(balance('bank', d)).toBe(295000 - 11000);
  });
  it('converts net worth and totals to base', () => {
    const d = multi();
    expect(netWorth(d)).toBe(netWorth(sample()) - 11000 + Math.round(19000 * 1.1));
    expect(totals(d.txns, d).expense).toBe(87000 + 1100);
    expect(byCategory(d.txns, d).find((c) => c.categoryId === 'food')!.amount).toBe(7000 + 1100);
  });
  it('reports missing rates and treats them as 1', () => {
    const d = multi();
    d.rates = {};
    expect(missingRates(d)).toEqual(['EUR']);
    expect(totals(d.txns, d).expense).toBe(88000);
  });
});

describe('totals and summaries', () => {
  it('excludes transfers from income/expense', () => {
    expect(totals(sample().txns, sample())).toEqual({ income: 300000, expense: 87000, net: 213000 });
  });
  it('groups by month', () => {
    expect(monthlySummary(sample().txns, sample())).toEqual([
      { month: '2026-01', income: 300000, expense: 5000, net: 295000 },
      { month: '2026-02', income: 0, expense: 82000, net: -82000 },
    ]);
  });
  it('groups by category, largest first', () => {
    expect(byCategory(sample().txns, sample())).toEqual([
      { categoryId: 'rent', amount: 80000 },
      { categoryId: 'food', amount: 7000 },
    ]);
  });
  it('budget status per month', () => {
    const d = sample();
    d.categories.push({ id: 'food', name: 'Food', kind: 'expense', budget: 5000 }, { id: 'rent', name: 'Rent', kind: 'expense' });
    expect(budgetStatus(d, '2026-02')).toEqual([{ category: d.categories.at(-2), budget: 5000, spent: 2000 }]);
  });
  it('monthEnd handles month lengths', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
});

describe('filterTxns', () => {
  const t = sample().txns;
  const ids = (f: Parameters<typeof filterTxns>[1]) => filterTxns(t, f).map((x) => x.id);
  it('filters by date range', () => expect(ids({ from: '2026-02-01', to: '2026-02-03' })).toEqual(['3', '4']));
  it('matches transfers on either side', () => expect(ids({ accountIds: ['card'] })).toEqual(['2', '3']));
  it('filters by category and type', () => {
    expect(ids({ categoryIds: ['food'] })).toEqual(['2', '4']);
    expect(ids({ types: ['transfer'] })).toEqual(['3']);
  });
  it('searches notes case-insensitively', () => expect(ids({ search: 'pizza' })).toEqual(['2']));
  it('combines filters', () => expect(ids({ categoryIds: ['food'], from: '2026-02-01' })).toEqual(['4']));
});

describe('recurring', () => {
  const rule = (freq: Recurring['freq'], start: string, extra: Partial<Recurring> = {}): Recurring => ({
    id: 'r',
    freq,
    start,
    posted: 0,
    template: { type: 'expense', amount: 1000, accountId: 'bank', categoryId: 'rent' },
    ...extra,
  });
  it('computes occurrences without month-end drift', () => {
    const r = rule('monthly', '2026-01-31');
    expect([0, 1, 2, 3].map((n) => occurrence(r, n))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrence(rule('weekly', '2026-12-28'), 1)).toBe('2027-01-04');
    expect(occurrence(rule('yearly', '2024-02-29'), 1)).toBe('2025-02-28');
    expect(occurrence(rule('daily', '2026-02-28'), 1)).toBe('2026-03-01');
  });
  it('posts due occurrences once, with stable ids', () => {
    const d = sample();
    d.recurring = [rule('monthly', '2026-01-15')];
    const after = postDue(d, '2026-03-20');
    expect(after.txns.filter((t) => t.recurringId).map((t) => [t.id, t.date])).toEqual([
      ['r:0', '2026-01-15'],
      ['r:1', '2026-02-15'],
      ['r:2', '2026-03-15'],
    ]);
    expect(after.recurring[0].posted).toBe(3);
    expect(postDue(after, '2026-03-20')).toBe(after);
    expect(nextDate(after.recurring[0])).toBe('2026-04-15');
  });
  it('one-time plans post once and then end', () => {
    const d = sample();
    d.recurring = [rule('once', '2026-02-10')];
    const after = postDue(d, '2026-12-31');
    expect(after.txns.filter((t) => t.recurringId).map((t) => t.date)).toEqual(['2026-02-10']);
    expect(nextDate(after.recurring[0])).toBeNull();
    expect(postDue(after, '2027-12-31')).toBe(after);
  });
  it('manual plans are not posted, only counted as due', () => {
    const d = sample();
    d.recurring = [rule('weekly', '2026-03-01', { auto: false })];
    expect(postDue(d, '2026-03-20')).toBe(d);
    expect(dueCount(d.recurring[0], '2026-03-20')).toBe(3);
    expect(dueCount(rule('weekly', '2026-03-01'), '2026-03-20')).toBe(0);
  });
  it('lists upcoming occurrences in date order, after the given day', () => {
    const d = sample();
    d.recurring = [rule('weekly', '2026-03-01', { id: 'w' }), rule('monthly', '2026-02-15', { id: 'm', posted: 1 }), rule('once', '2026-03-03', { id: 'o' })];
    expect(upcoming(d, '2026-03-01', '2026-03-16').map((u) => `${u.rule.id}${u.n}@${u.date}`)).toEqual(['o0@2026-03-03', 'w1@2026-03-08', 'w2@2026-03-15', 'm1@2026-03-15']);
  });
  it('stops at end date', () => {
    const d = sample();
    d.recurring = [rule('monthly', '2026-01-15', { end: '2026-02-20' })];
    const after = postDue(d, '2026-12-31');
    expect(after.txns.filter((t) => t.recurringId)).toHaveLength(2);
    expect(nextDate(after.recurring[0])).toBeNull();
  });
});

describe('parseAmount', () => {
  it.each([
    ['12.34', 1234],
    ['12', 1200],
    ['12.5', 1250],
    ['1,234.56', 123456],
    [' 0.01 ', 1],
  ])('%s -> %i', (s, v) => expect(parseAmount(s)).toBe(v));
  it.each(['', '0', '-5', 'abc', '1.234', '1e3', '.5'])('rejects %j', (s) => expect(parseAmount(s)).toBeNull());
  it('parseSigned allows zero and negatives', () => {
    expect(parseSigned('')).toBe(0);
    expect(parseSigned('0.00')).toBe(0);
    expect(parseSigned('-0')).toBe(0);
    expect(parseSigned('1200')).toBe(120000);
    expect(parseSigned('-200.50')).toBe(-20050);
    expect(parseSigned('x')).toBeNull();
  });
});

describe('normalize', () => {
  it('accepts current data and rejects junk', () => {
    expect(normalize(emptyData()).schemaVersion).toBe(2);
    expect(() => normalize({ foo: 1 })).toThrow();
    expect(() => normalize(null)).toThrow();
    expect(() => normalize({ schemaVersion: 2, currency: 'USD', accounts: 'x', categories: [], txns: [] })).toThrow();
  });
  it('upgrades v1 data', () => {
    const v1 = { schemaVersion: 1, currency: 'INR', accounts: [{ id: 'a', name: 'A', type: 'bank', openingBalance: 0, archived: false }], categories: [], txns: [] };
    const d = normalize(v1);
    expect(d).toMatchObject({ schemaVersion: 2, rates: {}, recurring: [] });
    expect(d.accounts[0].currency).toBe('INR');
  });
});
