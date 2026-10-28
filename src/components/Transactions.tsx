import { acctCurrency, filterTxns, formatMoney, totals } from '../money';
import { useStore } from '../store';
import type { Filter, Txn } from '../types';
import FilterBar from './FilterBar';
import { colorFor, Empty, Icon } from './ui';

interface Props {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onEdit: (t?: Txn) => void;
}

export default function Transactions({ filter, setFilter, onEdit }: Props) {
  const { data } = useStore();
  const rows = filterTxns(data.txns, filter);
  const t = totals(rows, data);
  const fmt = (c: number) => formatMoney(c, data.currency);

  if (data.accounts.length === 0) return <Empty title="No accounts yet" text="Add an account first, then record transactions." />;

  return (
    <section>
      <FilterBar filter={filter} setFilter={setFilter} />
      {data.txns.length === 0 ? (
        <Empty
          title="No transactions yet"
          text="Record your first income or expense."
          action={
            <button className="primary" onClick={() => onEdit()}>
              <Icon name="plus" /> Add transaction
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <Empty title="Nothing matches these filters" action={<button onClick={() => setFilter({})}>Clear filters</button>} />
      ) : (
        <>
          <p className="list-meta">
            {rows.length} transaction{rows.length === 1 ? '' : 's'} · In <span className="income">{fmt(t.income)}</span> · Out{' '}
            <span className="expense">{fmt(t.expense)}</span>
          </p>
          <TxnList txns={rows} onEdit={onEdit} />
        </>
      )}
    </section>
  );
}

/** Transactions grouped by day, newest first. Each row opens the edit dialog. */
export function TxnList({ txns, onEdit }: { txns: Txn[]; onEdit: (t: Txn) => void }) {
  const { data } = useStore();
  const account = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Unknown account';
  const category = (id?: string) => data.categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  // Txns have no time of day: reverse insertion order first so the stable sort shows same-day entries newest first.
  const sorted = [...txns].reverse().sort((a, b) => b.date.localeCompare(a.date));
  const days = [...new Set(sorted.map((t) => t.date))];
  const dayLabel = (d: string) =>
    new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="txn-days">
      {days.map((day) => (
        <div key={day}>
          <h3 className="day">{dayLabel(day)}</h3>
          <ul className="txns">
            {sorted
              .filter((t) => t.date === day)
              .map((t) => {
                const isT = t.type === 'transfer';
                const isA = t.type === 'adjust';
                const label = isT ? 'Transfer' : isA ? 'Balance adjustment' : category(t.categoryId);
                const title = t.note || label;
                const sub = isT
                  ? `${account(t.accountId)} → ${account(t.toAccountId)}`
                  : t.note && !isA
                    ? `${label} · ${account(t.accountId)}`
                    : account(t.accountId);
                const cur = acctCurrency(data, t.accountId);
                const sign = t.type === 'expense' ? '−' : t.type === 'income' || (isA && t.amount > 0) ? '+' : isA ? '−' : '';
                return (
                  <li key={t.id}>
                    <button className="txn" onClick={() => onEdit(t)} aria-label={`Edit ${title}`}>
                      <span className="badge" style={{ background: isT || isA ? 'var(--muted)' : colorFor(t.categoryId) }}>
                        {isT ? <Icon name="transfer" size={16} /> : isA ? <Icon name="settings" size={16} /> : label[0]}
                      </span>
                      <span className="txn-text">
                        <span className="txn-title">{title}</span>
                        <span className="txn-sub">
                          {t.recurringId && (
                            <span className="rec" title="Recurring">
                              <Icon name="repeat" size={12} />
                            </span>
                          )}
                          {sub}
                        </span>
                      </span>
                      <span className={`txn-amt ${t.type}`}>
                        {sign}
                        {formatMoney(Math.abs(t.amount), cur)}
                        {isT && t.toAmount !== undefined && <small> → {formatMoney(t.toAmount, acctCurrency(data, t.toAccountId!))}</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
