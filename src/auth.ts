// Google Identity Services token flow. No backend, so no refresh token:
// the access token lives in memory and expires after ~1 hour.

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  callback: (r: TokenResponse) => void;
  error_callback: (e: { type: string }) => void;
  requestAccessToken: (o?: { prompt?: string; login_hint?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: object) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const STORE_KEY = 'mt:token';

let client: TokenClient | null = null;
let token: string | null = null;
let expiresAt = 0;
let email = '';
let inFlight: Promise<string> | null = null;

// Keep the token across reloads until it expires, so reopening the app doesn't ask again.
// It only grants access to this app's own hidden Drive folder.
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  if (saved && saved.expiresAt > Date.now() + 60_000) ({ token, expiresAt, email } = saved);
} catch {
  /* storage blocked: token stays in memory only */
}

function persist() {
  try {
    if (token) localStorage.setItem(STORE_KEY, JSON.stringify({ token, expiresAt, email }));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

export class AuthError extends Error {}

export const isConfigured = () => !!CLIENT_ID && !CLIENT_ID.startsWith('your-');

async function gis() {
  for (let i = 0; i < 100 && !window.google?.accounts?.oauth2; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.google?.accounts?.oauth2) throw new Error('Google sign-in script failed to load');
  return window.google.accounts.oauth2;
}

/**
 * Opens the Google popup. Must be called from a user click, or browsers block the popup.
 * `hint` pre-selects the account this device's offline copy belongs to.
 */
export function signIn(prompt: '' | 'consent' | 'select_account' = '', hint = ''): Promise<string> {
  // One popup at a time: a second call (e.g. Connect button + auto-renew) shares the first.
  inFlight ??= request(prompt, hint).finally(() => (inFlight = null));
  return inFlight;
}

async function request(prompt: '' | 'consent' | 'select_account', hint: string): Promise<string> {
  email ||= hint;
  const oauth2 = await gis();
  client ??= oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
  const c = client;
  await new Promise<void>((resolve, reject) => {
    c.callback = (r) => {
      if (r.error || !r.access_token) return reject(new AuthError(r.error ?? 'No access token'));
      token = r.access_token;
      expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000;
      resolve();
    };
    c.error_callback = (e) => reject(new AuthError(e.type));
    c.requestAccessToken({ prompt, login_hint: email || undefined });
  });
  const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (me.ok) email = (await me.json()).email ?? '';
  persist();
  return email;
}

export const hasToken = () => !!token && Date.now() < expiresAt - 60_000;

/** True when the token is missing or expires within 5 minutes: time to renew on the next click. */
export const needsRenew = () => !token || Date.now() > expiresAt - 5 * 60_000;

/** Current token, or AuthError if missing/expired (caller shows a "sign in again" button). */
export function getToken(): string {
  if (!token || Date.now() > expiresAt - 60_000) throw new AuthError('Session expired');
  return token;
}

export function signOut() {
  if (token) window.google?.accounts.oauth2.revoke(token);
  token = null;
  email = '';
  persist();
}
