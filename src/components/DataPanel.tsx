import { useRef, useState } from 'react';
import { importCsv, toCsv, type CsvImport } from '../csv';
import { normalize, today } from '../money';
import { useStore } from '../store';
import type { Data } from '../types';
import { Modal, saveFile } from './ui';

type Pending =
  | { kind: 'json'; data: Data; name: string }
  | { kind: 'csv'; text: string; name: string; accountId: string; needsAccount: boolean; result: CsvImport };

/** Backup/restore (JSON) and transaction import/export (CSV). */
export default function DataPanel() {
  const { data, dispatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [msg, setMsg] = useState('');

  async function pick(file: File) {
    setMsg('');
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        setPending({ kind: 'json', data: normalize(JSON.parse(text)), name: file.name });
      } else {
        const result = importCsv(text, data);
        const needsAccount = result.errors.some((e) => e.includes('no "Account" column'));
        setPending({ kind: 'csv', text, name: file.name, accountId: '', needsAccount, result });
      }
    } catch (e) {
      setMsg(`Could not read ${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  function apply() {
    if (!pending) return;
    if (pending.kind === 'json') {
      dispatch({ type: 'replace', data: pending.data });
      setMsg(`Restored ${pending.data.txns.length} transactions from ${pending.name}.`);
    } else {
      const r = pending.result;
      dispatch({ type: 'add', accounts: r.accounts, categories: r.categories, txns: r.txns });
      setMsg(`Imported ${r.txns.length} transactions${r.skipped ? `, skipped ${r.skipped} already present` : ''}.`);
    }
    setPending(null);
  }

  // Hide the "no Account column" error while the user still has to pick one.
  const needsAccount = pending?.kind === 'csv' && pending.needsAccount;
  const accountMissing = pending?.kind === 'csv' && pending.needsAccount && !pending.accountId;

  return (
    <div className="panel">
      <h2>Import & export</h2>
      <div className="btn-row">
        <button onClick={() => saveFile(`money-tracker-${today()}.json`, JSON.stringify(data, null, 1), 'application/json')}>Download backup (JSON)</button>
        <button onClick={() => saveFile(`transactions-${today()}.csv`, toCsv(data), 'text/csv')}>Export transactions (CSV)</button>
        <button onClick={() => input.current?.click()}>Import file…</button>
        <input
          ref={input}
          type="file"
          accept=".json,.csv,text/csv,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) pick(f);
          }}
        />
      </div>
      <p className="help">
        Import a JSON backup to restore everything, or a CSV with at least Date and Amount columns (Account, Type, Category, Note optional). Negative amounts
        are expenses. Rows already present are skipped.
      </p>
      {msg && (
        <p className="help" role="status">
          {msg}
        </p>
      )}

      {pending && (
        <Modal title={`Import ${pending.name}`} onClose={() => setPending(null)}>
          <div className="stack">
            {pending.kind === 'json' ? (
              <p>
                This backup has <strong>{pending.data.accounts.length}</strong> accounts and <strong>{pending.data.txns.length}</strong> transactions. Restoring{' '}
                <strong>replaces all current data</strong>, on every device.
              </p>
            ) : (
              <>
                {needsAccount && (
                  <label>
                    Import into account
                    <select
                      value={pending.accountId}
                      onChange={(e) => setPending({ ...pending, accountId: e.target.value, result: importCsv(pending.text, data, e.target.value || undefined) })}
                    >
                      <option value="">Choose…</option>
                      {data.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p>
                  Ready to add <strong>{pending.result.txns.length}</strong> transactions
                  {pending.result.accounts.length > 0 && `, ${pending.result.accounts.length} new accounts (${pending.result.accounts.map((a) => a.name).join(', ')})`}
                  {pending.result.categories.length > 0 && `, ${pending.result.categories.length} new categories`}.
                  {pending.result.skipped > 0 && ` ${pending.result.skipped} rows are already present and will be skipped.`}
                </p>
                {pending.result.errors.length > 0 && !accountMissing && (
                  <div className="error" role="alert">
                    {pending.result.errors.length} rows can't be imported:
                    <ul>
                      {pending.result.errors.slice(0, 5).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                      {pending.result.errors.length > 5 && <li>…and {pending.result.errors.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </>
            )}
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className={pending.kind === 'json' ? 'primary danger-fill' : 'primary'} disabled={pending.kind === 'csv' && !pending.result.txns.length} onClick={apply}>
                {pending.kind === 'json' ? 'Replace all data' : 'Import'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
