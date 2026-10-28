import { useEffect, useState } from 'react';
import { isConfigured, signIn, signOut } from './auth';
import Accounts from './components/Accounts';
import Dashboard from './components/Dashboard';
import Planned from './components/Planned';
import Settings from './components/Settings';
import Summary from './components/Summary';
import Transactions from './components/Transactions';
import TxnForm from './components/TxnForm';
import { Icon, type IconName } from './components/ui';
import { open } from './drive';
import { dueCount, today } from './money';
import { clearCache, readCache, writeCache, type Cache } from './local';
import { StoreProvider, useStore, type SyncStatus } from './store';
import type { Filter, Txn } from './types';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'home' },
  { id: 'transactions', label: 'Transactions', icon: 'list' },
  { id: 'planned', label: 'Planned', icon: 'calendar' },
  { id: 'accounts', label: 'Accounts', icon: 'wallet' },
  { id: 'summary', label: 'Monthly', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  // undefined = still reading the offline copy; null = signed out.
  const [session, setSession] = useState<Cache | null | undefined>(undefined);
  const [step, setStep] = useState<'' | 'signin' | 'loading'>('');
  const [error, setError] = useState('');

  // Open straight from this device's copy when there is one: works offline and needs no popup.
  useEffect(() => {
    readCache().then((c) => setSession(c ?? null));
  }, []);

  async function login() {
    setStep('signin');
    setError('');
    try {
      const email = await signIn('select_account');
      setStep('loading');
      const { fileId, data } = await open();
      const cache = { email, fileId, base: data, local: data };
      await writeCache(cache);
      setSession(cache);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep('');
    }
  }

  if (session === undefined) return null;

  if (!session) {
    return (
      <main className="login">
        <div className="logo" aria-hidden="true">
          <Icon name="wallet" size={28} />
        </div>
        <h1>Money Tracker</h1>
        <p className="lead">See where your money goes across cash, bank accounts and cards.</p>
        <ul className="points">
          <li>Track income, expenses and transfers</li>
          <li>Charts and monthly summaries</li>
          <li>Private: stored only in your own Google Drive</li>
        </ul>
        {!navigator.onLine ? (
          <p className="error">You're offline. Connect to the internet to sign in the first time.</p>
        ) : isConfigured() ? (
          <button className="primary big" onClick={login} disabled={!!step}>
            {step === 'signin' ? 'Waiting for Google…' : step === 'loading' ? 'Loading your data…' : 'Continue with Google'}
          </button>
        ) : (
          <p className="error">
            Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Copy <code>.env.example</code> to <code>.env.local</code> and set it.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            Sign-in failed: {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <StoreProvider cache={session}>
      <Shell
        onSignOut={async () => {
          signOut();
          await clearCache();
          setSession(null);
        }}
      />
    </StoreProvider>
  );
}

const STATUS: Record<SyncStatus, string> = {
  synced: 'All changes synced',
  pending: 'Saved on this device',
  syncing: 'Syncing…',
  offline: 'Offline — saved on this device',
  auth: 'Not connected — saved on this device',
  error: 'Sync failed — saved on this device',
};

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { data, status, error, email, connect } = useStore();
  const [tab, setTab] = useState('dashboard');
  const [filter, setFilter] = useState<Filter>({});
  const [editing, setEditing] = useState<Txn | 'new' | null>(null);
  const current = TABS.find((t) => t.id === tab)!;
  const canAdd = data.accounts.length > 0;
  const due = data.recurring.reduce((s, r) => s + dueCount(r, today()), 0);
  const onEdit = (t?: Txn) => setEditing(t ?? 'new');
  const go = (id: string) => {
    setTab(id);
    window.scrollTo(0, 0);
  };

  const nav = (cls: string) => (
    <nav className={cls} aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} className={t.id === tab ? 'active' : ''} aria-current={t.id === tab ? 'page' : undefined} onClick={() => go(t.id)}>
          <Icon name={t.icon} size={20} />
          <span>{t.label}</span>
          {t.id === 'planned' && due > 0 && (
            <span className="count" aria-label={`${due} due`}>
              {due}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo small" aria-hidden="true">
            <Icon name="wallet" size={18} />
          </span>
          Money Tracker
        </div>
        {nav('side-nav')}
        <div className="side-foot" title={email}>
          {email}
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <h1>{current.label}</h1>
          <span className={`status ${status}`} role="status" title={error || undefined}>
            {STATUS[status]}
          </span>
          {(status === 'auth' || status === 'error') && (
            <button className="warn" onClick={connect}>
              {status === 'auth' ? 'Connect' : 'Retry'}
            </button>
          )}
          {canAdd && (
            <button className="primary add-desktop" onClick={() => onEdit()}>
              <Icon name="plus" /> Add transaction
            </button>
          )}
        </header>
        {status === 'error' && error && (
          <p className="banner" role="alert">
            {error}
          </p>
        )}

        <main>
          {tab === 'dashboard' && (
            <Dashboard filter={filter} setFilter={setFilter} onEdit={onEdit} goAccounts={() => go('accounts')} goTransactions={() => go('transactions')} go={go} />
          )}
          {tab === 'transactions' && <Transactions filter={filter} setFilter={setFilter} onEdit={onEdit} />}
          {tab === 'accounts' && (
            <Accounts
              onOpen={(id) => {
                setFilter({ accountIds: [id] });
                go('transactions');
              }}
            />
          )}
          {tab === 'planned' && <Planned />}
          {tab === 'summary' && <Summary />}
          {tab === 'settings' && (
            <Settings
              onSignOut={() =>
                (status === 'synced' || confirm('Some changes are only on this device and have not reached Google Drive yet. Sign out and lose them?')) &&
                onSignOut()
              }
            />
          )}
        </main>
      </div>

      {canAdd && (
        <button className="fab" aria-label="Add transaction" onClick={() => onEdit()}>
          <Icon name="plus" size={26} />
        </button>
      )}
      {nav('bottom-nav')}

      {editing && <TxnForm txn={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
