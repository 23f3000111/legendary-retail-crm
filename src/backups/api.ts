/**
 * The Backups page's calls to its own server code (`functions/api/backups`).
 * Relative to the page, so it works wherever the CRM is published; only
 * Cloudflare runs the server code, and anywhere else `list` says so.
 */
const BASE = '../api/backups'

export type Lock = 'address' | 'page'

export type SignIn =
  | { ok: true }
  | { ok: false; status: number; error: string; lock?: Lock; until?: string }

export interface BackupEntry {
  key: string
  kind: 'nightly' | 'monthly'
  takenAt?: string
  sizeBytes?: number
  counts?: Record<string, number>
}

const isJson = (r: Response) => (r.headers.get('content-type') ?? '').includes('application/json')

export async function signIn(password: string): Promise<SignIn> {
  const r = await fetch(`${BASE}/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (r.ok) return { ok: true }
  const body = isJson(r) ? ((await r.json()) as { error?: string; lock?: Lock; until?: string }) : {}
  return { ok: false, status: r.status, error: body.error ?? 'Something went wrong.', lock: body.lock, until: body.until }
}

/** The backups, or why there are none to show: signed out, or not on Cloudflare at all. */
export async function listBackups(): Promise<{ now: string; backups: BackupEntry[] } | 'signed-out' | 'not-here'> {
  const r = await fetch(`${BASE}/list`)
  if (!isJson(r)) return 'not-here'
  if (r.status === 401) return 'signed-out'
  if (!r.ok) throw new Error(`The list did not load (${r.status}).`)
  return (await r.json()) as { now: string; backups: BackupEntry[] }
}

export const fileUrl = (key: string) => `${BASE}/file/${key}`

export async function fetchBackup(key: string): Promise<Uint8Array> {
  const r = await fetch(fileUrl(key))
  if (r.status === 401) throw new SignedOut()
  if (!r.ok) throw new Error(`That backup did not download (${r.status}).`)
  return new Uint8Array(await r.arrayBuffer())
}

export async function fetchKey(): Promise<string> {
  const r = await fetch(`${BASE}/key`)
  if (r.status === 401) throw new SignedOut()
  if (!r.ok) throw new Error(`The key did not load (${r.status}).`)
  return ((await r.json()) as { passphrase: string }).passphrase
}

/** The hour is up: sign in again. */
export class SignedOut extends Error {
  constructor() {
    super('Sign in again.')
  }
}
