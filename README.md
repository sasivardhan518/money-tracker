# Money Tracker

Personal money tracker that runs entirely in the browser. You sign in with Google and all data is saved as one JSON file in your own Google Drive (the hidden app-data folder). There is no backend server.

Features:

- Multiple accounts (cash, bank, credit card, e-wallet, other), each in its own currency
- Income, expenses, transfers (including between currencies) and balance adjustments
- Edit an account's **current balance**: the difference is recorded as a dated "Balance adjustment"
- Categories with **monthly budgets** and progress bars
- **Planned payments** tab: one-time or recurring (daily / weekly / monthly / yearly, optional end date). Each plan either records itself on its date or waits under "Due" for you to confirm (with the actual amount) or skip. Shows the next 30 days.
- Dashboard with charts and filters, monthly summary
- **Import/export**: JSON backup/restore, CSV export, CSV import (our format or a bank statement with Date/Amount/Description)
- **Offline**: works without a connection; changes sync when you are back online
- **Multi-device**: edits from several devices are merged, not overwritten

## One-time Google setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External. While in "Testing" mode, add your own Gmail under **Test users**. The app only asks for `drive.appdata` (its own hidden folder) plus your email.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173` (add your hosted URL later, e.g. `https://you.github.io`).
   - No redirect URI is needed.
5. Copy `.env.example` to `.env.local` and paste the client ID:

   ```
   VITE_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # logic tests
npm run build   # static site in dist/
```

`dist/` can be hosted on any static host (GitHub Pages, Netlify, Cloudflare Pages). Add that origin to the OAuth client. The offline app shell (service worker) is only active in the built site, not in `npm run dev`.

## How it works

- `src/auth.ts` — Google Identity Services token popup. Google gives browser-only apps no refresh token: an access token lasts about 1 hour, and a new one needs a popup, which browsers only allow right after a click. So the app saves the token on the device until it expires (reloads stay connected), and renews it on your first click or keypress once it is missing or has under 5 minutes left. After the first consent that popup closes by itself. If it was blocked or closed, the header shows **Connect**; everything keeps working locally meanwhile. Only **Sign out** in Settings disconnects.
- `src/local.ts` — a copy of your data in IndexedDB. The app opens from it instantly and offline.
- `src/store.tsx` — app state and sync. Every change is saved locally at once, then synced to Drive about a second later, when you come back online, when you return to the tab, and every minute.
- `src/merge.ts` — three-way merge on sync (last synced version vs. this device vs. Drive), per item. Changes from different devices are combined. If the same item was edited on two devices, this device's edit wins. An edit always beats a delete.
- `src/drive.ts` — reads/creates/updates `money-tracker.json` in `appDataFolder`.
- `src/money.ts` — balances, currency conversion, filters, summaries, budgets and recurring schedules. Amounts are integer cents.
- `src/csv.ts` — CSV parse/export/import.
- `public/sw.js` — caches the app shell so the site loads offline.

Currencies: each account has a currency. Totals, charts and budgets use the **base currency** from Settings. Rates are entered by hand or fetched with **Fetch latest rates** (frankfurter.dev, free ECB rates; only currency codes are sent).

Credit cards: what you owe is a negative balance. Paying the card is a transfer from your bank account to the card.

Recurring: the app posts due occurrences when it opens and while it is open. Nothing is posted while it is closed; missed occurrences are caught up next time.

## Limits

- Sync checks Drive's file version just before uploading and re-merges if another device uploaded in the meantime. A few milliseconds between that check and the upload remain unguarded: if two devices hit exactly that window, one device's latest edit can be lost.
- First sign-in on a device needs internet. Sign out removes this device's copy.
- Data lives in the hidden app folder, so you won't see it in the Drive UI. It is removed if you disconnect the app under Google Account → Security → Third-party access. Use **Download backup** in Settings for your own copy.
