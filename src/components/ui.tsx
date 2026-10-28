import { useEffect, useRef, type ReactNode } from 'react';
import type { AccountType } from '../types';

const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  wallet: 'M3 7h15a3 3 0 013 3v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l12-4v4M16 14h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M2 20h20',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  plus: 'M12 5v14M5 12h14',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  credit: 'M2 6h20v12H2zM2 10h20M6 15h4',
  cash: 'M2 7h20v10H2zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 100-5M5 10v4M19 10v4',
  phone: 'M7 2h10v20H7zM11 18h2',
  circle: 'M12 3a9 9 0 100 18 9 9 0 100-18',
  transfer: 'M4 8h15l-4-4M20 16H5l4 4',
  close: 'M6 6l12 12M18 6L6 18',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  target: 'M12 3a9 9 0 100 18 9 9 0 100-18M12 8a4 4 0 100 8 4 4 0 100-8',
  cloud: 'M7 18h10a4 4 0 00.5-7.97A6 6 0 006.1 9.1 4.5 4.5 0 007 18z',
};
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export const ACCOUNT_ICON: Record<AccountType, IconName> = { cash: 'cash', bank: 'bank', credit: 'credit', wallet: 'phone', other: 'circle' };

export const PALETTE = ['#2f7dd6', '#e08a1e', '#1c9a6c', '#d6455d', '#7c5cd6', '#d1489a', '#139bb0', '#c7621f', '#5f7389', '#6f9a1c'];

/** Stable color per category id, so the same category looks the same everywhere. */
export function colorFor(id = '') {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** All ISO 4217 codes the browser knows. */
export const CURRENCIES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('currency');
  } catch {
    return ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'INR', 'JPY', 'SGD', 'USD'];
  }
})();

export function CurrencySelect({ value, onChange, label = 'Currency' }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {[...new Set([value, ...CURRENCIES])].sort().map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}

/** Triggers a browser download of generated text. */
export function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native <dialog> modal: focus trap, Esc to close and inert background come from the browser. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    // showModal() moves focus itself, so React's autoFocus would be lost; use data-autofocus instead.
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {/* Inner wrapper: clicks on padding must not count as backdrop clicks. */}
      <div className="modal-body">
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
