import { useState, type FormEvent } from 'react';
import { acctCurrency, newId, parseAmount, parseSigned, toInput, today } from '../money';
import { useStore } from '../store';
import { FREQS, type Freq, type Recurring, type Txn, type TxnType } from '../types';
import { Icon, Modal, type IconName } from './ui';

const TYPES: { type: TxnType; label: string; icon: IconName }[] = [
  { type: 'expense', label: 'Expense', icon: 'down' },
  { type: 'income', label: 'Income', icon: 'up' },
  { type: 'transfer', label: 'Transfer', icon: 'transfer' },
];

// Remembered between dialogs for fast entry of several txns in a row.
let last = { type: 'expense' as TxnType, accountId: '' };

interface Props {
  txn?: Txn;
  /** Create ('new') or edit a planned payment instead of a transaction. */
  plan?: Recurring | 'new';
  onClose: () => void;
}

export default function TxnForm({ txn, plan, onClose }: Props) {
  const { data, dispatch } = useStore();
  const rule = typeof plan === 'object' ? plan : undefined;
  const src = txn ?? rule?.template;
  const [f, setF] = useState(() => ({
    type: src?.type ?? last.type,
    date: txn?.date ?? rule?.start ?? today(),
    amount: src ? toInput(src.amount) : '',
    toAmount: src?.toAmount !== undefined ? toInput(src.toAmount) : '',
    accountId:
      src?.accountId ??
      (data.accounts.some((a) => a.id === last.accountId && !a.archived) ? last.accountId : (data.accounts.find((a) => !a.archived)?.id ?? '')),
    toAccountId: src?.toAccountId ?? '',
    categoryId: src?.categoryId ?? '',
    note: src?.note ?? '',
    repeat: (rule?.freq ?? (plan ? 'monthly' : '')) as Freq | '',
    until: rule?.end ?? '',
    auto: rule ? rule.auto !== false : true,
  }));
  // The schedule is fixed once payments exist: occurrence numbers would no longer line up.
  const locked = !!rule && rule.posted > 0;
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  const isAdjust = f.type === 'adjust';
  // Archived accounts stay selectable only when already used by the txn being edited.
  const accounts = data.accounts.filter((a) => !a.archived || a.id === f.accountId || a.id === f.toAccountId);
  const categories = data.categories.filter((c) => c.kind === f.type);
  const fromCur = acctCurrency(data, f.accountId);
  const toCur = acctCurrency(data, f.toAccountId);
  const crossCurrency = f.type === 'transfer' && !!f.toAccountId && fromCur !== toCur;
  // Suggested received amount from the exchange rates in Settings.
  const rate = (c: string) => (c === data.currency ? 1 : data.rates[c] || 1);
  const estimate = () => {
    const a = parseAmount(f.amount);
    return a === null ? null : Math.round((a * rate(fromCur)) / rate(toCur));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = isAdjust ? parseSigned(f.amount) : parseAmount(f.amount);
    if (!amount) return setError(isAdjust ? 'Enter a non-zero amount, like -12.50' : 'Enter a positive amount, like 12.50');
    if (!f.accountId) return setError('Choose an account');
    if (!f.date) return setError('Choose a date');
    if (f.type === 'transfer' && (!f.toAccountId || f.toAccountId === f.accountId)) return setError('Choose a different account to transfer to');
    const toAmount = crossCurrency ? (f.toAmount.trim() ? parseAmount(f.toAmount) : estimate()) : undefined;
    if (crossCurrency && !toAmount) return setError(`Enter the amount received in ${toCur}`);
    if (f.repeat && f.until && f.until < f.date) return setError('"Repeat until" must be after the date');

    const fields: Omit<Txn, 'id' | 'date'> = {
      type: f.type,
      amount,
      accountId: f.accountId,
      ...(f.type === 'transfer' ? { toAccountId: f.toAccountId, ...(toAmount ? { toAmount } : {}) } : {}),
      ...(f.type === 'income' || f.type === 'expense' ? { categoryId: f.categoryId || undefined } : {}),
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
    };
    if (f.repeat) {
      // Auto plans post their first occurrence themselves (now, or on its date if that is in the future).
      dispatch({
        type: 'upsert',
        coll: 'recurring',
        item: {
          id: rule?.id ?? newId(),
          freq: f.repeat,
          start: f.date,
          ...(f.until && f.repeat !== 'once' ? { end: f.until } : {}),
          posted: rule?.posted ?? 0,
          auto: f.auto,
          template: fields,
        },
      });
    } else {
      dispatch({ type: 'upsert', coll: 'txns', item: { ...fields, id: txn?.id ?? newId(), date: f.date, ...(txn?.recurringId ? { recurringId: txn.recurringId } : {}) } });
    }
    if (!isAdjust) last = { type: f.type, accountId: f.accountId };
    onClose();
  }

  function remove() {
    if (txn && confirm('Delete this transaction?')) {
      dispatch({ type: 'remove', coll: 'txns', id: txn.id });
      onClose();
    }
  }

  const accountOptions = (exclude?: string) =>
    accounts
      .filter((a) => a.id !== exclude)
      .map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.currency !== data.currency ? ` (${a.currency})` : ''}
        </option>
      ));

  return (
    <Modal
      title={isAdjust ? 'Balance adjustment' : plan ? (rule ? 'Edit planned payment' : 'New planned payment') : txn ? 'Edit transaction' : 'New transaction'}
      onClose={onClose}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {!isAdjust && (
          <fieldset className="segmented">
            <legend className="sr-only">Type</legend>
            {TYPES.map((t) => (
              <label key={t.type} className={`${t.type} ${f.type === t.type ? 'active' : ''}`}>
                <input type="radio" name="type" checked={f.type === t.type} onChange={() => set({ type: t.type, categoryId: '' })} />
                <Icon name={t.icon} size={16} />
                {t.label}
              </label>
            ))}
          </fieldset>
        )}

        <div className={crossCurrency ? 'two' : ''}>
          <label className="amount-field">
            {crossCurrency ? 'Sent' : 'Amount'} ({fromCur})
            <input inputMode="decimal" placeholder="0.00" data-autofocus value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </label>
          {crossCurrency && (
            <label className="amount-field">
              Received ({toCur})
              <input inputMode="decimal" placeholder={estimate() !== null ? toInput(estimate()!) : '0.00'} value={f.toAmount} onChange={(e) => set({ toAmount: e.target.value })} />
            </label>
          )}
        </div>
        {isAdjust && <p className="help">Positive adds to the balance, negative subtracts. Not counted as income or expense.</p>}

        <div className="two">
          <label>
            {f.type === 'transfer' ? 'From account' : 'Account'}
            <select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              <option value="">Choose…</option>
              {accountOptions()}
            </select>
          </label>
          {f.type === 'transfer' ? (
            <label>
              To account
              <select value={f.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })}>
                <option value="">Choose…</option>
                {accountOptions(f.accountId)}
              </select>
            </label>
          ) : (
            !isAdjust && (
              <label>
                Category
                <select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
        </div>

        <div className="two">
          <label>
            {plan ? (f.repeat === 'once' ? 'Due date' : 'First payment') : 'Date'}
            <input type="date" value={f.date} disabled={locked} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label>
            <span>
              Note <span className="opt">(optional)</span>
            </span>
            <input value={f.note} placeholder={f.type === 'transfer' ? 'e.g. Card payment' : 'e.g. Groceries'} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </div>

        {!txn && !isAdjust && (
          <div className="two">
            <label>
              Repeat
              <select value={f.repeat} disabled={locked} onChange={(e) => set({ repeat: e.target.value as Freq | '' })}>
                {/* A plain transaction is "Never"; a plan is at least "Once". */}
                {!plan && <option value="">Never</option>}
                {Object.entries(FREQS)
                  .filter(([k]) => plan || k !== 'once')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            {f.repeat && f.repeat !== 'once' && (
              <label>
                <span>
                  Until <span className="opt">(optional)</span>
                </span>
                <input type="date" value={f.until} min={f.date} onChange={(e) => set({ until: e.target.value })} />
              </label>
            )}
          </div>
        )}
        {f.repeat && (
          <label className="check">
            <input type="checkbox" checked={f.auto} onChange={(e) => set({ auto: e.target.checked })} />
            <span>
              Record automatically
              <span className="help">{f.auto ? 'Added to transactions on its date.' : 'Waits under Planned › Due until you confirm or skip it.'}</span>
            </span>
          </label>
        )}
        {locked && <p className="help">Dates and frequency are fixed once payments were recorded. To change them, stop this plan and create a new one.</p>}
        {txn?.recurringId && <p className="help">Part of a planned payment. Changes apply to this one only; manage the plan in the Planned tab.</p>}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          {txn && (
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">{txn || rule ? 'Save changes' : f.repeat ? 'Add planned payment' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  );
}
