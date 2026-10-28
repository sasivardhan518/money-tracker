import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { budgetStatus, byCategory, dueCount, filterTxns, formatMoney, missingRates, monthEnd, monthlySummary, netWorth, today, totals } from '../money';
import { useStore } from '../store';
import type { Filter, Txn } from '../types';
import FilterBar from './FilterBar';
import { TxnList } from './Transactions';
import { colorFor, Empty, Icon } from './ui';

const INCOME = '#1c9a6c';
const EXPENSE = '#d6455d';
const LINE = '#2f7dd6';
const AXIS = { fontSize: 12, fill: '#8a94a6' };

interface Props {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onEdit: (t?: Txn) => void;
  goAccounts: () => void;
  goTransactions: () => void;
  go: (tab: string) => void;
}

export default function Dashboard({ filter, setFilter, onEdit, goAccounts, goTransactions, go }: Props) {
  const { data } = useStore();
  const fmt = (c: number) => formatMoney(c, data.currency);
  const compact = (c: number) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(c / 100);
  const tip = (v: unknown) => fmt(Number(v));
  const monthLabel = (m: string) => new Date(m + '-01T00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

  if (data.accounts.length === 0) {
    return (
      <Empty
        title="Welcome to Money Tracker"
        text="Start by adding the accounts you use — cash, bank, credit cards. Then record income, expenses and transfers."
        action={
          <button className="primary" onClick={goAccounts}>
            <Icon name="plus" /> Add your first account
          </button>
        }
      />
    );
  }

  const txns = filterTxns(data.txns, filter);
  const t = totals(txns, data);
  const months = monthlySummary(txns, data);
  const cats = byCategory(txns, data).map((c) => ({ ...c, name: data.categories.find((x) => x.id === c.categoryId)?.name ?? 'Uncategorized' }));
  const catTotal = cats.reduce((s, c) => s + c.amount, 0);
  const accountIds = filter.accountIds?.length ? filter.accountIds : data.accounts.map((a) => a.id);
  const worthOf = (upTo?: string) => netWorth(data, upTo, accountIds);
  const missing = missingRates(data);
  const over = budgetStatus(data, today().slice(0, 7)).filter((b) => b.spent > b.budget);
  const due = data.recurring.reduce((s, r) => s + dueCount(r, today()), 0);
  const worth = months.map((m) => ({ month: m.month, value: worthOf(monthEnd(m.month)) }));
  const recent = [...txns].reverse().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const pickMonth = (month: string) => setFilter({ ...filter, from: `${month}-01`, to: monthEnd(month) });

  return (
    <section>
      <FilterBar filter={filter} setFilter={setFilter} />

      {missing.length > 0 && (
        <p className="notice">
          No exchange rate for {missing.join(', ')} — totals count them 1:1.{' '}
          <button className="link" onClick={() => go('settings')}>
            Set rates
          </button>
        </p>
      )}
      {due > 0 && (
        <p className="notice">
          {due} planned payment{due === 1 ? ' is' : 's are'} due and waiting for confirmation.{' '}
          <button className="link" onClick={() => go('planned')}>
            Review
          </button>
        </p>
      )}
      {over.length > 0 && (
        <p className="notice">
          Over budget this month: {over.map((b) => `${b.category.name} (${fmt(b.spent - b.budget)} over)`).join(', ')}.{' '}
          <button className="link" onClick={() => go('summary')}>
            See budgets
          </button>
        </p>
      )}

      <div className="kpis">
        <div className="kpi main">
          <span className="label">{filter.accountIds?.length ? 'Balance (selected)' : 'Net worth'}</span>
          <span className={`value ${worthOf() < 0 ? 'neg' : ''}`}>{fmt(worthOf())}</span>
        </div>
        <div className="kpi">
          <span className="label">
            <Icon name="up" size={14} /> Income
          </span>
          <span className="value income">{fmt(t.income)}</span>
        </div>
        <div className="kpi">
          <span className="label">
            <Icon name="down" size={14} /> Expenses
          </span>
          <span className="value expense">{fmt(t.expense)}</span>
        </div>
        <div className="kpi">
          <span className="label">Net savings</span>
          <span className={`value ${t.net < 0 ? 'neg' : ''}`}>
            {t.net > 0 ? '+' : ''}
            {fmt(t.net)}
          </span>
        </div>
      </div>

      {txns.length === 0 ? (
        <Empty title="No transactions in this range" action={<button onClick={() => setFilter({})}>Show all time</button>} />
      ) : (
        <div className="grid">
          <div className="panel wide">
            <div className="panel-head">
              <h2>Income vs expenses</h2>
              <span className="help">Click a month to zoom in</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={months} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={AXIS} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={tip} labelFormatter={(m) => monthLabel(String(m))} cursor={{ fill: 'var(--hover)' }} />
                <Bar dataKey="income" name="Income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={36} cursor="pointer" onClick={(_d, i) => pickMonth(months[i].month)} />
                <Bar dataKey="expense" name="Expenses" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={36} cursor="pointer" onClick={(_d, i) => pickMonth(months[i].month)} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Spending by category</h2>
              <span className="help">Click to filter</span>
            </div>
            {cats.length === 0 ? (
              <p className="help">No expenses in this range.</p>
            ) : (
              <div className="donut">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={cats}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={1}
                      stroke="none"
                      cursor="pointer"
                      onClick={(_d, i) => cats[i].categoryId && setFilter({ ...filter, categoryIds: [cats[i].categoryId] })}
                    >
                      {cats.map((c) => (
                        <Cell key={c.categoryId} fill={colorFor(c.categoryId)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={tip} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="legend">
                  {cats.slice(0, 6).map((c) => (
                    <li key={c.categoryId}>
                      <button className="link" onClick={() => c.categoryId && setFilter({ ...filter, categoryIds: [c.categoryId] })}>
                        <span className="dot" style={{ background: colorFor(c.categoryId) }} />
                        <span className="grow">{c.name}</span>
                        <span className="pct">{Math.round((c.amount / catTotal) * 100)}%</span>
                        <span className="num">{fmt(c.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{filter.accountIds?.length ? 'Balance' : 'Net worth'} over time</h2>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={worth}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={AXIS} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={tip} labelFormatter={(m) => monthLabel(String(m))} />
                <Line type="monotone" dataKey="value" name="Net worth" stroke={LINE} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="panel wide">
            <div className="panel-head">
              <h2>Recent transactions</h2>
              <button className="ghost small" onClick={goTransactions}>
                See all
              </button>
            </div>
            <TxnList txns={recent} onEdit={onEdit} />
          </div>
        </div>
      )}
    </section>
  );
}
