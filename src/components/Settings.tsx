import { useState, type FormEvent } from 'react';
import { newId } from '../money';
import { useStore } from '../store';
import type { Category } from '../types';
import Currencies from './Currencies';
import DataPanel from './DataPanel';
import { colorFor, Icon } from './ui';

export default function Settings({ onSignOut }: { onSignOut: () => void }) {
  const { email } = useStore();

  return (
    <section className="settings">
      <Currencies />

      <div className="panel">
        <h2>Categories</h2>
        <div className="cols">
          <CategoryList kind="expense" />
          <CategoryList kind="income" />
        </div>
      </div>

      <DataPanel />

      <div className="panel">
        <h2>Google account</h2>
        <p>
          Signed in as <strong>{email}</strong>. Your data is stored in a private app folder in your Google Drive, with a copy on this device so the
          app works offline. Edits from other devices are merged automatically.
        </p>
        <button onClick={onSignOut}>
          <Icon name="logout" size={16} /> Sign out
        </button>
      </div>
    </section>
  );
}

function CategoryList({ kind }: { kind: Category['kind'] }) {
  const { data, dispatch } = useStore();
  const [name, setName] = useState('');
  const [editId, setEditId] = useState('');
  const list = data.categories.filter((c) => c.kind === kind);
  const label = kind === 'expense' ? 'Expense' : 'Income';

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'upsert', coll: 'categories', item: { id: newId(), name: name.trim(), kind } });
    setName('');
  }

  function rename(c: Category, value: string) {
    setEditId('');
    if (value.trim() && value.trim() !== c.name) dispatch({ type: 'upsert', coll: 'categories', item: { ...c, name: value.trim() } });
  }

  function remove(c: Category) {
    if (data.txns.some((t) => t.categoryId === c.id)) return alert(`"${c.name}" is used by transactions. Rename it, or recategorize those transactions first.`);
    if (confirm(`Delete category "${c.name}"?`)) dispatch({ type: 'remove', coll: 'categories', id: c.id });
  }

  return (
    <div>
      <h3>{label}</h3>
      <ul className="cats">
        {list.map((c) => (
          <li key={c.id}>
            <span className="dot" style={{ background: colorFor(c.id) }} />
            {editId === c.id ? (
              <input
                autoFocus
                aria-label={`Rename ${c.name}`}
                defaultValue={c.name}
                onBlur={(e) => rename(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(c, e.currentTarget.value);
                  if (e.key === 'Escape') setEditId('');
                }}
              />
            ) : (
              <span className="grow">{c.name}</span>
            )}
            <button className="ghost small" onClick={() => setEditId(c.id)} aria-label={`Rename ${c.name}`}>
              Rename
            </button>
            <button className="ghost small danger" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form className="add-cat" onSubmit={add}>
        <input aria-label={`New ${label.toLowerCase()} category`} placeholder={`New ${label.toLowerCase()} category`} value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()}>Add</button>
      </form>
    </div>
  );
}
