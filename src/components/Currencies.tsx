import { useState } from 'react';
import { useStore } from '../store';
import { CurrencySelect } from './ui';

// Free ECB-based rates, no API key. Only the currency codes are sent.
const RATES_URL = 'https://api.frankfurter.dev/v1/latest';

export default function Currencies() {
  const { data, dispatch } = useStore();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const used = [...new Set([...data.accounts.map((a) => a.currency), ...Object.keys(data.rates)])].filter((c) => c !== data.currency).sort();

  function setRate(cur: string, v: string) {
    const n = Number(v);
    const rates = { ...data.rates };
    if (v.trim() && n > 0) rates[cur] = n;
    else delete rates[cur];
    dispatch({ type: 'patch', patch: { rates } });
  }

  /** Re-expresses rates and budgets in the new base, when the old base's rate is known. */
  function changeBase(next: string) {
    const r = data.rates[next]; // value of 1 `next` in old base
    if (!r) {
      dispatch({ type: 'patch', patch: { currency: next } });
      return setMsg(`Base is now ${next}. Budgets were kept as numbers; check exchange rates below.`);
    }
    const rates: Record<string, number> = { [data.currency]: 1 / r };
    for (const [c, v] of Object.entries(data.rates)) if (c !== next) rates[c] = v / r;
    dispatch({ type: 'patch', patch: { currency: next, rates } });
    for (const c of data.categories) if (c.budget) dispatch({ type: 'upsert', coll: 'categories', item: { ...c, budget: Math.round(c.budget / r) } });
    setMsg(`Base is now ${next}. Rates and budgets were converted.`);
  }

  async function fetchRates() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${RATES_URL}?base=${data.currency}&symbols=${used.join(',')}`);
      if (!res.ok) throw new Error(res.status === 404 ? `${data.currency} is not supported by the rate service` : `HTTP ${res.status}`);
      const body: { date: string; rates: Record<string, number> } = await res.json();
      const rates = { ...data.rates };
      for (const [c, perBase] of Object.entries(body.rates)) rates[c] = Number((1 / perBase).toPrecision(6));
      dispatch({ type: 'patch', patch: { rates } });
      const miss = used.filter((c) => !body.rates[c]);
      setMsg(`Updated to rates from ${body.date}.${miss.length ? ` Not available: ${miss.join(', ')} — enter those by hand.` : ''}`);
    } catch (e) {
      setMsg(`Could not fetch rates: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Currencies</h2>
      <div className="inline-select">
        <CurrencySelect label="Base currency" value={data.currency} onChange={changeBase} />
      </div>
      <p className="help">Totals, charts and budgets are shown in the base currency. Each account keeps its own currency.</p>
      {used.length > 0 && (
        <>
          <h3>Exchange rates</h3>
          <ul className="rates">
            {used.map((c) => (
              <li key={c}>
                <label className="inline">
                  1 {c} =
                  <input
                    inputMode="decimal"
                    aria-label={`Value of 1 ${c} in ${data.currency}`}
                    defaultValue={data.rates[c] ?? ''}
                    key={data.rates[c] ?? ''}
                    placeholder="rate"
                    onBlur={(e) => setRate(c, e.target.value)}
                  />
                  {data.currency}
                </label>
                {!(data.rates[c] > 0) && <span className="neg small-text">missing</span>}
              </li>
            ))}
          </ul>
          <button onClick={fetchRates} disabled={busy || !navigator.onLine}>
            {busy ? 'Fetching…' : 'Fetch latest rates'}
          </button>
        </>
      )}
      {msg && (
        <p className="help" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
