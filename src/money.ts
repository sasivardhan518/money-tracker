import type { Data, Filter, Recurring, Txn } from './types';

export const newId = () => crypto.randomUUID();

export function emptyData(currency = 'USD'): Data {
  const cat = (name: string, kind: 'income' | 'expense') => ({ id: newId(), name, kind });
  return {
    schemaVersion: 2,
    currency,
    rates: {},
    accounts: [],
    categories: [
      cat('Salary', 'income'),
      cat('Other income', 'income'),
      cat('Food', 'expense'),
      cat('Rent', 'expense'),
      cat('Transport', 'expense'),
      cat('Shopping', 'expense'),
      cat('Bills', 'expense'),
      cat('Other', 'expense'),
    ],
    txns: [],
    recurring: [],
  };
}

/**
 * Validates data read from Drive, a backup file or the local cache, and upgrades
 * older schema versions. Throws if it is not usable money tracker data.
 */
export function normalize(v: unknown): Data {
  const d = v as Partial<Data> & { schemaVersion?: number };
  if (!d || typeof d !== 'object' || ![1, 2].includes(d.schemaVersion as number)) throw new Error('Not a money tracker data file');
  if (!Array.isArray(d.accounts) || !Array.isArray(d.categories) || !Array.isArray(d.txns) || typeof d.currency !== 'string') {
    throw new Error('Money tracker data file is damaged');
  }
  const base = d.currency;
  return {
    schemaVersion: 2,
    currency: base,
    rates: d.rates && typeof d.rates === 'object' ? d.rates : {},
    accounts: d.accounts.map((a) => ({ ...a, currency: a.currency || base })),
    categories: d.categories,
    txns: d.txns,
    recurring: Array.isArray(d.recurring) ? d.recurring : [],
  };
}

/** "12.34" -> 1234. Returns null for anything that is not a positive amount with at most 2 decimals. */
export function parseAmount(s: string): number | null {
  const m = s.trim().replace(/,/g, '').match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Like parseAmount but allows 0 and a leading minus (opening balances, adjustments). */
export function parseSigned(s: string): number | null {
  const t = s.trim();
  if (t === '' || /^-?0*(\.0*)?$/.test(t)) return 0;
  const neg = t.startsWith('-');
  const v = parseAmount(neg ? t.slice(1) : t);
  return v === null ? null : neg ? -v : v;
}

export const toInput = (cents: number) => (cents / 100).toFixed(2);

export function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`; // unknown code typed by the user
  }
}

// ---- Currency -------------------------------------------------------------

export const acctCurrency = (data: Data, accountId: string) => data.accounts.find((a) => a.id === accountId)?.currency ?? data.currency;

/** Currencies used by accounts that have no exchange rate set. */
export function missingRates(data: Data): string[] {
  return [...new Set(data.accounts.map((a) => a.currency))].filter((c) => c !== data.currency && !(data.rates[c] > 0));
}

/** Converts minor units of `currency` to base currency. A missing rate counts as 1 (UI warns via missingRates). */
export function toBase(data: Data, cents: number, currency: string): number {
  if (currency === data.currency) return cents;
  return Math.round(cents * (data.rates[currency] > 0 ? data.rates[currency] : 1));
}

// ---- Balances -------------------------------------------------------------

/** Effect of one txn on one account's balance, in that account's currency. */
function delta(t: Txn, accountId: string): number {
  if (t.type === 'income' || t.type === 'adjust') return t.accountId === accountId ? t.amount : 0;
  if (t.type === 'expense') return t.accountId === accountId ? -t.amount : 0;
  return (t.toAccountId === accountId ? (t.toAmount ?? t.amount) : 0) - (t.accountId === accountId ? t.amount : 0);
}

/** Balance in the account's own currency. */
export function balance(accountId: string, data: Data, upTo?: string): number {
  const acc = data.accounts.find((a) => a.id === accountId);
  let sum = acc?.openingBalance ?? 0;
  for (const t of data.txns) if (!upTo || t.date <= upTo) sum += delta(t, accountId);
  return sum;
}

/** Sum of balances in base currency (all accounts, or the given ones). */
export function netWorth(data: Data, upTo?: string, accountIds = data.accounts.map((a) => a.id)): number {
  return accountIds.reduce((s, id) => s + toBase(data, balance(id, data, upTo), acctCurrency(data, id)), 0);
}

// ---- Reports (all in base currency) ---------------------------------------

export function filterTxns(txns: Txn[], f: Filter): Txn[] {
  const q = f.search?.trim().toLowerCase();
  return txns.filter(
    (t) =>
      (!f.from || t.date >= f.from) &&
      (!f.to || t.date <= f.to) &&
      (!f.types?.length || f.types.includes(t.type)) &&
      (!f.accountIds?.length || f.accountIds.includes(t.accountId) || (!!t.toAccountId && f.accountIds.includes(t.toAccountId))) &&
      (!f.categoryIds?.length || (!!t.categoryId && f.categoryIds.includes(t.categoryId))) &&
      (!q || (t.note ?? '').toLowerCase().includes(q)),
  );
}

const baseAmount = (data: Data, t: Txn) => toBase(data, t.amount, acctCurrency(data, t.accountId));

/** Income/expense totals in base currency. Transfers and adjustments are excluded. */
export function totals(txns: Txn[], data: Data) {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += baseAmount(data, t);
    else if (t.type === 'expense') expense += baseAmount(data, t);
  }
  return { income, expense, net: income - expense };
}

export interface MonthRow {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number;
}

/** Per-month income/expense in base currency, oldest first. */
export function monthlySummary(txns: Txn[], data: Data): MonthRow[] {
  const map = new Map<string, Txn[]>();
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), t]);
  }
  return [...map.keys()].sort().map((month) => ({ month, ...totals(map.get(month)!, data) }));
}

/** Totals per categoryId in base currency, largest first. */
export function byCategory(txns: Txn[], data: Data, kind: 'income' | 'expense' = 'expense') {
  const map = new Map<string, number>();
  for (const t of txns) if (t.type === kind) map.set(t.categoryId ?? '', (map.get(t.categoryId ?? '') ?? 0) + baseAmount(data, t));
  return [...map].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
}

/** Budget vs spent for one month (YYYY-MM), for expense categories that have a budget. */
export function budgetStatus(data: Data, month: string) {
  const spent = new Map(byCategory(data.txns.filter((t) => t.date.startsWith(month)), data).map((c) => [c.categoryId, c.amount]));
  return data.categories
    .filter((c) => c.kind === 'expense' && c.budget)
    .map((c) => ({ category: c, budget: c.budget!, spent: spent.get(c.id) ?? 0 }));
}

// ---- Dates ----------------------------------------------------------------

/** Last day (YYYY-MM-DD) of a YYYY-MM month. */
export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Local-date YYYY-MM-DD. */
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// ---- Recurring ------------------------------------------------------------

const NEVER = '9999-12-31';

/** Date of the n-th occurrence (0 = start). Monthly/yearly clamp to month end: Jan 31 -> Feb 28 -> Mar 31. */
export function occurrence(r: Pick<Recurring, 'freq' | 'start'>, n: number): string {
  if (r.freq === 'once') return n === 0 ? r.start : NEVER;
  const [y, m, d] = r.start.split('-').map(Number);
  if (r.freq === 'daily' || r.freq === 'weekly') {
    return new Date(Date.UTC(y, m - 1, d + n * (r.freq === 'daily' ? 1 : 7))).toISOString().slice(0, 10);
  }
  const months = (m - 1) + n * (r.freq === 'monthly' ? 1 : 12);
  const last = new Date(Date.UTC(y, months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The txn an occurrence becomes. Stable id `${ruleId}:${n}`, so two devices posting it merge into one txn. */
export const planTxn = (r: Recurring, n: number, date = occurrence(r, n)): Txn => ({ ...r.template, id: `${r.id}:${n}`, date, recurringId: r.id });

/** Posts every auto-record occurrence due on or before `upTo`. Returns the same object when nothing is due. */
export function postDue(data: Data, upTo: string): Data {
  const add: Txn[] = [];
  const recurring = data.recurring.map((r) => {
    if (r.auto === false) return r;
    let n = r.posted;
    for (let date = occurrence(r, n); date <= upTo && (!r.end || date <= r.end) && n - r.posted < 1000; date = occurrence(r, ++n)) {
      add.push(planTxn(r, n, date));
    }
    return n === r.posted ? r : { ...r, posted: n };
  });
  if (!add.length) return data;
  const have = new Set(data.txns.map((t) => t.id));
  return { ...data, recurring, txns: [...data.txns, ...add.filter((t) => !have.has(t.id))] };
}

/** Next date a rule will post, or null when it has ended. */
export function nextDate(r: Recurring): string | null {
  const d = occurrence(r, r.posted);
  return d === NEVER || (r.end && d > r.end) ? null : d;
}

/** Number of occurrences of a manual (confirm-each) plan that are due on or before `upTo`. */
export function dueCount(r: Recurring, upTo: string): number {
  if (r.auto !== false) return 0;
  let n = r.posted;
  while (n - r.posted < 1000 && occurrence(r, n) <= upTo && (!r.end || occurrence(r, n) <= r.end)) n++;
  return n - r.posted;
}

/** Occurrences after `after` up to and including `to`, oldest first. Manual plans' due items are excluded (see dueCount). */
export function upcoming(data: Data, after: string, to: string) {
  const out: { rule: Recurring; n: number; date: string }[] = [];
  for (const r of data.recurring) {
    for (let n = r.posted, date = occurrence(r, n); date <= to && (!r.end || date <= r.end) && n - r.posted < 400; date = occurrence(r, ++n)) {
      if (date > after) out.push({ rule: r, n, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
