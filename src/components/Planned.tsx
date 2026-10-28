import { useState, type FormEvent } from 'react';
import { acctCurrency, dueCount, formatMoney, nextDate, occurrence, parseAmount, planTxn, toInput, today, upcoming } from '../money';
import { useStore } from '../store';
import { FREQS, type Recurring } from '../types';
import TxnForm from './TxnForm';
import { colorFor, Empty, Icon, Modal } from './ui';

const DAYS_AHEAD = 30;

export default function Planned() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [confirming, setConfirming] = useState<Recurring | null>(null);
  const t = today();
  const horizon = new Date(Date.parse(t) + DAYS_AHEAD * 864e5).toISOString().slice(0, 10);
  const due = data.recurring.map((r) => ({ r, count: dueCount(r, t) })).filter((x) => x.count > 0);
  const soon = upcoming(data, t, horizon);
  const active = data.recurring.filter((r) => nextDate(r));
  const ended = data.recurring.filter((r) => !nextDate(r));

  const name = (r: Recurring) =>
    r.template.note || (r.template.type === 'transfer' ? 'Transfer' : (data.categories.find((c) => c.id === r.template.categoryId)?.name ?? 'Uncategorized'));
  const money = (r: Recurring) => formatMoney(r.template.amount, acctCurrency(data, r.template.accountId));
  const account = (r: Recurring) => data.accounts.find((a) => a.id === r.template.accountId)?.name ?? 'Unknown account';
  const dayLabel = (d: string) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const advance = (r: Recurring) => dispatch({ type: 'upsert', coll: 'recurring', item: { ...r, posted: r.posted + 1 } });

  function skip(r: Recurring) {
    if (confirm(`Skip the ${occurrence(r, r.posted)} payment of "${name(r)}"? Nothing is recorded for it.`)) advance(r);
  }
  function stop(r: Recurring) {
    if (confirm(`Stop "${name(r)}"? No more payments will be planned. Recorded transactions stay.`)) {
      dispatch({ type: 'upsert', coll: 'recurring', item: { ...r, end: t } });
    }
  }
  function remove(r: Recurring) {
    if (confirm(`Delete the plan "${name(r)}"? Recorded transactions stay.`)) dispatch({ type: 'remove', coll: 'recurring', id: r.id });
  }

  const badge = (r: Recurring) => (
    <span className="badge" style={{ background: r.template.type === 'transfer' ? 'var(--muted)' : colorFor(r.template.categoryId) }}>
      {r.template.type === 'transfer' ? <Icon name="transfer" size={16} /> : name(r)[0]}
    </span>
  );
  const mode = (r: Recurring) => <span className={`tag ${r.auto === false ? 'manual' : ''}`}>{r.auto === false ? 'Confirm' : 'Auto'}</span>;

  if (data.accounts.length === 0) return <Empty title="No accounts yet" text="Add an account first, then plan payments." />;

  return (
    <section className="planned">
      <div className="section-head">
        <p className="list-meta">Bills, salaries and other payments you expect. Auto plans record themselves; the others wait for you.</p>
        <button className="primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add planned payment
        </button>
      </div>

      {data.recurring.length === 0 ? (
        <Empty title="No planned payments" text="Add rent, subscriptions, salary or a one-time bill to see what's coming up." />
      ) : (
        <>
          {due.length > 0 && (
            <div className="panel due">
              <h2>Due — needs your confirmation</h2>
              <ul className="txns">
                {due.map(({ r, count }) => (
                  <li key={r.id} className="plan-row">
                    {badge(r)}
                    <span className="txn-text">
                      <span className="txn-title">{name(r)}</span>
                      <span className="txn-sub">
                        Due {dayLabel(occurrence(r, r.posted))} · {account(r)}
                        {count > 1 && ` · ${count - 1} more overdue`}
                      </span>
                    </span>
                    <span className={`txn-amt ${r.template.type}`}>{money(r)}</span>
                    <span className="row-actions">
                      <button className="primary small" onClick={() => setConfirming(r)}>
                        Confirm
                      </button>
                      <button className="ghost small" onClick={() => skip(r)}>
                        Skip
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <h2>Next {DAYS_AHEAD} days</h2>
            {soon.length === 0 ? (
              <p className="help">Nothing planned in the next {DAYS_AHEAD} days.</p>
            ) : (
              <ul className="txns">
                {soon.map(({ rule: r, n, date }) => (
                  <li key={`${r.id}:${n}`} className="plan-row">
                    <span className="date-chip">{dayLabel(date)}</span>
                    <span className="txn-text">
                      <span className="txn-title">{name(r)}</span>
                      <span className="txn-sub">{account(r)}</span>
                    </span>
                    {mode(r)}
                    <span className={`txn-amt ${r.template.type}`}>{money(r)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h2>All plans</h2>
            <ul className="txns">
              {[...active, ...ended].map((r) => {
                const next = nextDate(r);
                return (
                  <li key={r.id} className={`plan-row ${next ? '' : 'ended'}`}>
                    {badge(r)}
                    <span className="txn-text">
                      <span className="txn-title">{name(r)}</span>
                      <span className="txn-sub">
                        {FREQS[r.freq]} · {next ? `next ${next}` : 'ended'}
                        {r.end && next && r.freq !== 'once' ? ` · until ${r.end}` : ''}
                      </span>
                    </span>
                    {mode(r)}
                    <span className={`txn-amt ${r.template.type}`}>{money(r)}</span>
                    <span className="row-actions">
                      <button className="ghost small" onClick={() => setEditing(r)} aria-label={`Edit ${name(r)}`}>
                        Edit
                      </button>
                      {next && (
                        <button className="ghost small" onClick={() => stop(r)}>
                          Stop
                        </button>
                      )}
                      <button className="ghost small danger" onClick={() => remove(r)}>
                        Delete
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {editing && <TxnForm plan={editing} onClose={() => setEditing(null)} />}
      {confirming && <ConfirmPayment rule={confirming} name={name(confirming)} onClose={() => setConfirming(null)} />}
    </section>
  );
}

/** Records the next due occurrence of a manual plan, with the actual amount and date. */
function ConfirmPayment({ rule, name, onClose }: { rule: Recurring; name: string; onClose: () => void }) {
  const { data, dispatch } = useStore();
  const [amount, setAmount] = useState(toInput(rule.template.amount));
  const [date, setDate] = useState(occurrence(rule, rule.posted));
  const [error, setError] = useState('');
  const cur = acctCurrency(data, rule.template.accountId);

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseAmount(amount);
    if (cents === null) return setError('Enter a positive amount, like 12.50');
    if (!date) return setError('Choose a date');
    const txn = planTxn(rule, rule.posted, date);
    // A transfer's received amount only stays valid if the sent amount did not change.
    const toAmount = txn.toAmount !== undefined && cents !== rule.template.amount ? Math.round((txn.toAmount * cents) / rule.template.amount) : txn.toAmount;
    dispatch({ type: 'upsert', coll: 'txns', item: { ...txn, amount: cents, ...(toAmount !== undefined ? { toAmount } : {}) } });
    dispatch({ type: 'upsert', coll: 'recurring', item: { ...rule, posted: rule.posted + 1 } });
    onClose();
  }

  return (
    <Modal title={`Confirm ${name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <p className="help">Due {occurrence(rule, rule.posted)}. Change the amount or date if the actual payment differed.</p>
        <div className="two">
          <label className="amount-field">
            Amount ({cur})
            <input inputMode="decimal" data-autofocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Paid on
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
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
          <button className="primary">Record payment</button>
        </div>
      </form>
    </Modal>
  );
}
