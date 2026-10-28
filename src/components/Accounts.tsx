import { useState, type FormEvent } from 'react';
import { balance, formatMoney, netWorth, newId, parseSigned, toBase, toInput, today } from '../money';
import { useStore } from '../store';
import { ACCOUNT_TYPES, type Account, type AccountType } from '../types';
import { ACCOUNT_ICON, CurrencySelect, Empty, Icon, Modal } from './ui';

export default function Accounts({ onOpen }: { onOpen: (accountId: string) => void }) {
  const { data } = useStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const fmt = (c: number, cur = data.currency) => formatMoney(c, cur);
  const active = data.accounts.filter((a) => !a.archived);
  const archived = data.accounts.filter((a) => a.archived);
  const baseBal = (a: Account) => toBase(data, balance(a.id, data), a.currency);
  const assets = active.reduce((s, a) => s + Math.max(0, baseBal(a)), 0);
  const debts = active.reduce((s, a) => s + Math.min(0, baseBal(a)), 0);

  const card = (a: Account) => {
    const b = balance(a.id, data);
    return (
      <li key={a.id} className={`acct ${a.archived ? 'archived' : ''}`}>
        <span className={`acct-icon t-${a.type}`}>
          <Icon name={ACCOUNT_ICON[a.type]} size={20} />
        </span>
        <button className="acct-main" onClick={() => onOpen(a.id)} title="Show transactions">
          <span className="acct-name">{a.name}</span>
          <span className="acct-type">
            {ACCOUNT_TYPES[a.type]}
            {a.currency !== data.currency && ` · ${a.currency}`}
            {a.archived && ' · archived'}
          </span>
        </button>
        <span className="acct-bal">
          <span className={b < 0 ? 'neg' : ''}>{fmt(b, a.currency)}</span>
          {a.currency !== data.currency && <small>≈ {fmt(baseBal(a))}</small>}
        </span>
        <button className="ghost small" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
          Edit
        </button>
      </li>
    );
  };

  return (
    <section>
      {data.accounts.length === 0 ? (
        <Empty
          title="Add your first account"
          text="Cash, bank accounts, credit cards — anything that holds or owes money."
          action={
            <button className="primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Add account
            </button>
          }
        />
      ) : (
        <>
          <div className="section-head">
            <p className="list-meta">
              Net worth <strong>{fmt(netWorth(data))}</strong> · Assets {fmt(assets)} · Debts <span className={debts < 0 ? 'neg' : ''}>{fmt(debts)}</span>
            </p>
            <button className="primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Add account
            </button>
          </div>
          <ul className="accts">{active.map(card)}</ul>
          <p className="help hint-below">Tap an account name to see its transactions.</p>
          {archived.length > 0 && (
            <details className="archived-list">
              <summary>Archived ({archived.length})</summary>
              <ul className="accts">{archived.map(card)}</ul>
            </details>
          )}
        </>
      )}
      {editing && <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { data, dispatch } = useStore();
  const current = account ? balance(account.id, data) : 0;
  const [f, setF] = useState({
    name: account?.name ?? '',
    type: account?.type ?? ('bank' as AccountType),
    currency: account?.currency ?? data.currency,
    opening: account ? toInput(account.openingBalance) : '',
    current: toInput(current),
  });
  const [error, setError] = useState('');
  const used = !!account && data.txns.some((t) => t.accountId === account.id || t.toAccountId === account.id);

  function submit(e: FormEvent) {
    e.preventDefault();
    const openingBalance = parseSigned(f.opening);
    const target = parseSigned(f.current);
    if (!f.name.trim()) return setError('Give the account a name');
    if (openingBalance === null) return setError('Opening balance must be a number like 1200.50 or -300');
    if (target === null) return setError('Current balance must be a number like 1200.50 or -300');
    const id = account?.id ?? newId();
    dispatch({
      type: 'upsert',
      coll: 'accounts',
      item: { id, name: f.name.trim(), type: f.type, currency: f.currency, openingBalance, archived: account?.archived ?? false },
    });
    // New balance = what history says (with the new opening balance) + an adjustment for the rest.
    // Only when the user actually edited the field, so changing just the opening balance still works.
    const touched = f.current !== toInput(current);
    const diff = account && touched ? target - (current - account.openingBalance + openingBalance) : 0;
    if (diff !== 0) {
      dispatch({ type: 'upsert', coll: 'txns', item: { id: newId(), date: today(), type: 'adjust', amount: diff, accountId: id, note: 'Balance adjustment' } });
    }
    onClose();
  }

  function act(kind: 'archive' | 'delete') {
    if (!account) return;
    if (kind === 'archive') dispatch({ type: 'upsert', coll: 'accounts', item: { ...account, archived: !account.archived } });
    else if (confirm(`Delete "${account.name}"? This cannot be undone.`)) dispatch({ type: 'remove', coll: 'accounts', id: account.id });
    else return;
    onClose();
  }

  return (
    <Modal title={account ? 'Edit account' : 'New account'} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <label>
          Name
          <input data-autofocus placeholder="e.g. Everyday checking" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <fieldset className="type-grid">
          <legend>Type</legend>
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
            <label key={t} className={f.type === t ? 'active' : ''}>
              <input type="radio" name="acct-type" checked={f.type === t} onChange={() => setF({ ...f, type: t })} />
              <Icon name={ACCOUNT_ICON[t]} />
              {ACCOUNT_TYPES[t]}
            </label>
          ))}
        </fieldset>
        <div className="two">
          <CurrencySelect value={f.currency} onChange={(currency) => setF({ ...f, currency })} />
          <label>
            Opening balance
            <input inputMode="decimal" placeholder="0.00" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} />
          </label>
        </div>
        {account && (
          <label>
            Current balance ({f.currency})
            <input inputMode="decimal" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
            <span className="help">Change this to match your real balance. The difference is recorded today as a “Balance adjustment”.</span>
          </label>
        )}
        <p className="help">
          {f.type === 'credit' ? 'For a credit card, enter what you owe as a negative number, e.g. -350.00. ' : ''}
          {account && used && f.currency !== account.currency ? 'Changing the currency relabels existing amounts; it does not convert them.' : ''}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {account && (
            <>
              <button type="button" onClick={() => act('archive')}>
                {account.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button type="button" className="danger" disabled={used} title={used ? 'Has transactions — archive it instead' : undefined} onClick={() => act('delete')}>
                Delete
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">{account ? 'Save changes' : 'Add account'}</button>
        </div>
      </form>
    </Modal>
  );
}
