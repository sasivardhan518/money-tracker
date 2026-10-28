// CSV export/import of transactions. Import accepts our own export, and also simple bank
// statements (Date, Amount, Description): a negative amount is an expense, positive is income.
import { acctCurrency, newId, parseSigned, toInput } from './money';
import type { Account, Category, Data, Txn, TxnType } from './types';

const HEAD = ['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'To amount', 'Category', 'Note'];

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(data: Data): string {
  const acc = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const cat = (id?: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const rows = [...data.txns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      t.date,
      t.type,
      toInput(t.amount),
      acctCurrency(data, t.accountId),
      acc(t.accountId),
      acc(t.toAccountId),
      t.toAmount !== undefined ? toInput(t.toAmount) : '',
      cat(t.categoryId),
      t.note ?? '',
    ]);
  return [HEAD, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** RFC 4180 parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f), rows.push(row), (row = []), (f = '');
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

export interface CsvImport {
  txns: Txn[];
  accounts: Account[];
  categories: Category[];
  skipped: number;
  errors: string[];
}

/**
 * Builds new txns (plus any accounts/categories they reference) from CSV text.
 * Rows identical to an existing txn (date, type, amount, account, note) are skipped, so re-importing is safe.
 * `defaultAccountId` is used when the file has no Account column.
 */
export function importCsv(text: string, data: Data, defaultAccountId?: string): CsvImport {
  const [head = [], ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const c = {
    date: col('date'),
    type: col('type'),
    amount: col('amount'),
    currency: col('currency'),
    account: col('account'),
    to: col('to account'),
    toAmount: col('to amount'),
    category: col('category'),
    note: col('note', 'description', 'memo', 'payee'),
  };
  const out: CsvImport = { txns: [], accounts: [], categories: [], skipped: 0, errors: [] };
  if (c.date < 0 || c.amount < 0) return { ...out, errors: ['The file needs at least "Date" and "Amount" columns.'] };
  if (c.account < 0 && !defaultAccountId) return { ...out, errors: ['The file has no "Account" column. Choose an account to import into.'] };

  const accounts = [...data.accounts];
  const categories = [...data.categories];
  const key = (t: Txn) => [t.date, t.type, t.amount, t.accountId, t.note ?? ''].join('|');
  const seen = new Set(data.txns.map(key));
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  const account = (name: string, currency: string) => {
    let a = accounts.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!a) {
      a = { id: newId(), name, type: 'bank', currency: currency || data.currency, openingBalance: 0, archived: false };
      accounts.push(a);
      out.accounts.push(a);
    }
    return a.id;
  };
  const category = (name: string, kind: Category['kind']) => {
    let x = categories.find((y) => y.kind === kind && y.name.toLowerCase() === name.toLowerCase());
    if (!x) {
      x = { id: newId(), name, kind };
      categories.push(x);
      out.categories.push(x);
    }
    return x.id;
  };

  rows.forEach((r, i) => {
    const line = i + 2;
    const date = get(r, c.date);
    const signed = parseSigned(get(r, c.amount).replace(/[^\d.,-]/g, ''));
    let type = get(r, c.type).toLowerCase() as TxnType;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out.errors.push(`Row ${line}: date must be YYYY-MM-DD, got "${date}"`);
    if (signed === null || signed === 0) return out.errors.push(`Row ${line}: invalid amount "${get(r, c.amount)}"`);
    if (!['income', 'expense', 'transfer', 'adjust'].includes(type)) type = signed < 0 ? 'expense' : 'income';
    const accName = get(r, c.account);
    const accountId = accName ? account(accName, get(r, c.currency)) : defaultAccountId!;
    const t: Txn = { id: newId(), date, type, amount: type === 'adjust' ? signed : Math.abs(signed), accountId };
    if (type === 'transfer') {
      const to = get(r, c.to);
      if (!to) return out.errors.push(`Row ${line}: transfer needs "To account"`);
      t.toAccountId = account(to, '');
      const toAmount = parseSigned(get(r, c.toAmount));
      if (toAmount) t.toAmount = Math.abs(toAmount);
    } else if (type !== 'adjust' && get(r, c.category)) {
      t.categoryId = category(get(r, c.category), type);
    }
    if (get(r, c.note)) t.note = get(r, c.note);
    if (seen.has(key(t))) return out.skipped++;
    seen.add(key(t));
    out.txns.push(t);
  });
  return out;
}
