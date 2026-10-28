import { byCategory, formatMoney, monthlySummary } from '../money';
import { useStore } from '../store';
import Budgets from './Budgets';
import { colorFor } from './ui';

export default function Summary() {
  const { data } = useStore();
  const fmt = (c: number) => formatMoney(c, data.currency);
  const cat = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  const rows = monthlySummary(data.txns, data).reverse();
  const monthLabel = (m: string) => new Date(m + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <section className="summary">
      <Budgets />
      {rows.length === 0 ? (
        <p className="help">Monthly totals appear here once you record income or expenses.</p>
      ) : (
        <div className="months">
          {rows.map((r) => {
            const top = byCategory(data.txns.filter((t) => t.date.startsWith(r.month)), data).slice(0, 4);
            const rate = r.income > 0 ? Math.round((r.net / r.income) * 100) : null;
            return (
              <article key={r.month} className="panel month">
                <div className="panel-head">
                  <h2>{monthLabel(r.month)}</h2>
                  {r.net < 0 ? <span className="pill neg">Overspent</span> : rate !== null && <span className="pill pos">Saved {rate}%</span>}
                </div>
                <dl className="month-totals">
                  <div>
                    <dt>Income</dt>
                    <dd className="income">{fmt(r.income)}</dd>
                  </div>
                  <div>
                    <dt>Expenses</dt>
                    <dd className="expense">{fmt(r.expense)}</dd>
                  </div>
                  <div>
                    <dt>Net</dt>
                    <dd className={r.net < 0 ? 'neg' : ''}>{fmt(r.net)}</dd>
                  </div>
                </dl>
                {top.length > 0 && (
                  <ul className="bars" aria-label="Top expense categories">
                    {top.map((c) => (
                      <li key={c.categoryId}>
                        <span className="bar-label">
                          <span>{cat(c.categoryId)}</span>
                          <span className="num">{fmt(c.amount)}</span>
                        </span>
                        <span className="bar-track">
                          <span className="bar-fill" style={{ width: `${(c.amount / r.expense) * 100}%`, background: colorFor(c.categoryId) }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
