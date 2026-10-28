import { useState, type FormEvent } from 'react';
import { budgetStatus, formatMoney, parseAmount, toInput, today } from '../money';
import { useStore } from '../store';
import { Icon, Modal } from './ui';

/** Monthly budget per expense category (base currency), with progress for a chosen month. */
export default function Budgets() {
  const { data } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editing, setEditing] = useState(false);
  const fmt = (c: number) => formatMoney(c, data.currency);
  const rows = budgetStatus(data, month);
  const total = rows.reduce((s, r) => ({ budget: s.budget + r.budget, spent: s.spent + r.spent }), { budget: 0, spent: 0 });
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  };
  const label = new Date(month + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="panel budgets">
      <div className="panel-head">
        <h2>
          <Icon name="target" size={16} /> Budgets
        </h2>
        <div className="month-nav">
          <button className="ghost small" aria-label="Previous month" onClick={() => shift(-1)}>
            ‹
          </button>
          <span>{label}</span>
          <button className="ghost small" aria-label="Next month" onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <button className="small" onClick={() => setEditing(true)}>
          {rows.length ? 'Edit budgets' : 'Set budgets'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="help">Set a monthly limit for your spending categories to see how much is left.</p>
      ) : (
        <>
          <p className="list-meta">
            {fmt(total.spent)} of {fmt(total.budget)} spent ·{' '}
            {total.spent > total.budget ? <span className="neg">{fmt(total.spent - total.budget)} over</span> : `${fmt(total.budget - total.spent)} left`}
          </p>
          <ul className="bars">
            {rows.map(({ category, budget, spent }) => {
              const pct = Math.round((spent / budget) * 100);
              const state = pct > 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
              return (
                <li key={category.id}>
                  <span className="bar-label">
                    <span>{category.name}</span>
                    <span className="num">
                      {fmt(spent)} / {fmt(budget)}
                      <span className={`budget-state ${state}`}>{state === 'over' ? ` · ${fmt(spent - budget)} over` : ` · ${pct}%`}</span>
                    </span>
                  </span>
                  <span className="bar-track" role="progressbar" aria-label={`${category.name} budget used`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span className={`bar-fill ${state}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {editing && <BudgetForm onClose={() => setEditing(false)} />}
    </div>
  );
}

function BudgetForm({ onClose }: { onClose: () => void }) {
  const { data, dispatch } = useStore();
  const cats = data.categories.filter((c) => c.kind === 'expense');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c.id, c.budget ? toInput(c.budget) : ''])));
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const bad = cats.find((c) => values[c.id].trim() && parseAmount(values[c.id]) === null);
    if (bad) return setError(`Budget for ${bad.name} must be a positive amount`);
    for (const c of cats) {
      const budget = values[c.id].trim() ? parseAmount(values[c.id])! : undefined;
      if (budget !== c.budget) dispatch({ type: 'upsert', coll: 'categories', item: { ...c, budget } });
    }
    onClose();
  }

  return (
    <Modal title="Monthly budgets" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <p className="help">Amounts in {data.currency} per month. Leave empty for no budget.</p>
        <div className="budget-grid">
          {cats.map((c, i) => (
            <label key={c.id}>
              {c.name}
              <input
                inputMode="decimal"
                placeholder="No budget"
                {...(i === 0 ? { 'data-autofocus': true } : {})}
                value={values[c.id]}
                onChange={(e) => setValues({ ...values, [c.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save budgets</button>
        </div>
      </form>
    </Modal>
  );
}
