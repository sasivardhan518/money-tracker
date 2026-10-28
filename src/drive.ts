// All app data is one JSON file in the user's hidden Drive appDataFolder.
import { AuthError, getToken } from './auth';
import { emptyData, normalize } from './money';
import type { Data } from './types';

const FILE_NAME = 'money-tracker.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function api(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) throw new AuthError('Session expired');
  if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return res;
}

async function create(data: Data): Promise<string> {
  const b = 'mt' + crypto.randomUUID();
  const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body =
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${b}--`;
  const res = await api(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body,
  });
  return (await res.json()).id;
}

/** Finds the data file, creating it with defaults on first use. */
export async function open(): Promise<{ fileId: string; data: Data }> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const list = await (await api(`${API}?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=modifiedTime desc`)).json();
  const id: string | undefined = list.files?.[0]?.id;
  if (!id) {
    const data = emptyData();
    return { fileId: await create(data), data };
  }
  return { fileId: id, data: await download(id) };
}

export async function download(fileId: string): Promise<Data> {
  return normalize(await (await api(`${API}/${fileId}?alt=media`)).json());
}

/** Drive's file version: increases on every upload. Used to detect another device syncing at the same time. */
export async function version(fileId: string): Promise<string> {
  return (await (await api(`${API}/${fileId}?fields=version`)).json()).version;
}

export async function upload(fileId: string, data: Data) {
  await api(`${UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
