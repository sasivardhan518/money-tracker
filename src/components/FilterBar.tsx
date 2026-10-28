import { useState } from 'react';
import { monthEnd, today } from '../money';
import { useStore } from '../store';
import type { Filter, TxnType } from '../types';
import { Icon } from './ui';

function presets() {
  const t = today();
  const [y, m] = t.split('-').map(Number);
  const monthStart = (back: number) => new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
  return [
    { label: 'This month', from: monthStart(0), to: monthEnd(t.slice(0, 7)) },
    { label: 'Last month', from: monthStart(1), to: monthEnd(monthStart(1).slice(0, 7)) },
    { label: 'Last 3 months', from: monthStart(2), to: monthEnd(t.slice(0, 7)) },
    { label: 'This year', from: `${y}-01-01`, to: `${y}-12-31` },
    { label: 'All time', from: undefined, to: undefined },
  ];
}

export default function FilterBar({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filter>) => setFilter({ ...filter, ...patch });
  const one = <T,>(v: string) => (v ? [v as T] : undefined);
  const ps = presets();
  const preset = ps.find((p) => p.from === filter.from && p.to === filter.to);
  // Count of "more" filters in use, shown on the toggle so hidden filters are never a surprise.
  const extra = [filter.accountIds, filter.categoryIds, filter.types, filter.search].filter(Boolean).length + (preset ? 0 : 1);

  return (
    <div className="filters" role="search" aria-label="Filter transactions">
      <div className="filter-top">
        <div className="chips" role="group" aria-label="Date range">
          {ps.map((p) => (
            <button key={p.label} className={p === preset ? 'chip active' : 'chip'} aria-pressed={p === preset} onClick={() => set({ from: p.from, to: p.to })}>
              {p.label}
            </button>
          ))}
        </div>
        <button className={`filter-toggle ${open ? 'active' : ''}`} aria-expanded={open} aria-controls="more-filters" onClick={() => setOpen(!open)}>
          <Icon name="filter" size={16} /> Filters
          {extra > 0 && <span className="count">{extra}</span>}
        </button>
        {(extra > 0 || filter.from) && (
          <button className="ghost" onClick={() => setFilter({})}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <div id="more-filters" className="filter-more">
          <label>
            From
            <input type="date" value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          </label>
          <label>
            To
            <input type="date" value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          </label>
          <label>
            Account
            <select value={filter.accountIds?.[0] ?? ''} onChange={(e) => set({ accountIds: one(e.target.value) })}>
              <option value="">All accounts</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={filter.categoryIds?.[0] ?? ''} onChange={(e) => set({ categoryIds: one(e.target.value) })}>
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={filter.types?.[0] ?? ''} onChange={(e) => set({ types: one<TxnType>(e.target.value) })}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
              <option value="adjust">Balance adjustment</option>
            </select>
          </label>
          <label>
            Search notes
            <input type="search" placeholder="e.g. groceries" value={filter.search ?? ''} onChange={(e) => set({ search: e.target.value || undefined })} />
          </label>
        </div>
      )}
    </div>
  );
}
