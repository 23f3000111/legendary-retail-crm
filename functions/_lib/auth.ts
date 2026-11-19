/**
 * The page's one password, and the session a right one buys.
 *
 * The password is never stored: only its HMAC under the server secret, with
 * a `password:` prefix so it can never be mistaken for a session's
 * signature. A session is `<expires-ms>.<HMAC of session:<expires-ms>>` in a
 * cookie scripts cannot read, good for an hour.
 *
 * Everything here is a few microseconds of WebCrypto: the free plan allows
 * 10 ms of CPU a request.
 */
import type { Env } from './env'

export const SESSION_COOKIE = '__Host-lgd_backups'
export const SESSION_MS = 3_600_000

const encoder = new TextEncoder()

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compares two strings in time that does not depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function passwordMatches(env: Pick<Env, 'BACKUP_SESSION_SECRET' | 'BACKUP_PASSWORD_HMAC'>, password: string) {
  if (!env.BACKUP_SESSION_SECRET || !env.BACKUP_PASSWORD_HMAC) return false
  return sameText(await hmacHex(env.BACKUP_SESSION_SECRET, `password:${password}`), env.BACKUP_PASSWORD_HMAC)
}

export async function newSession(env: Pick<Env, 'BACKUP_SESSION_SECRET'>, nowMs: number): Promise<string> {
  const expires = nowMs + SESSION_MS
  return `${expires}.${await hmacHex(env.BACKUP_SESSION_SECRET, `session:${expires}`)}`
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_MS / 1000}; Path=/; HttpOnly; Secure; SameSite=Strict`
}

const cookieValue = (header: string | null, name: string) => {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export async function sessionValid(
  env: Pick<Env, 'BACKUP_SESSION_SECRET'>,
  cookieHeader: string | null,
  nowMs: number,
): Promise<boolean> {
  const token = cookieValue(cookieHeader, SESSION_COOKIE)
  if (!token || !env.BACKUP_SESSION_SECRET) return false
  const [expiresText, signature] = token.split('.')
  const expires = Number(expiresText)
  // Never longer than an hour from now, whatever the token says.
  if (!signature || !Number.isFinite(expires) || expires <= nowMs || expires > nowMs + SESSION_MS) return false
  return sameText(await hmacHex(env.BACKUP_SESSION_SECRET, `session:${expires}`), signature)
}
