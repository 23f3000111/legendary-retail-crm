import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeKV } from '../../_lib/fake-kv'
import { hmacHex } from '../../_lib/auth'
import type { Env } from '../../_lib/env'
import { onRequest as middleware } from './_middleware'
import { onRequestPost as signIn } from './sign-in'
import { onRequestPost as signOut } from './sign-out'
import { onRequestGet as list } from './list'
import { onRequestGet as key } from './key'
import { onRequestGet as file } from './file/[[key]]'
import { onRequestPut as put } from './upload/[[key]]'

const SITE = 'https://crm.legendary.com.my'
const PASSWORD = 'k7qm-x2pv-9tzh-r4nd'
const PASSPHRASE = 'the-backup-passphrase-itself'
/** 64 hex characters, as setup makes it. */
const UPLOAD_KEY = '5f0c'.repeat(16)

let kv: FakeKV
let env: Env
let mails: string[]

beforeEach(async () => {
  kv = new FakeKV()
  env = {
    BACKUPS: kv as unknown as KVNamespace,
    BACKUP_SESSION_SECRET: 'server-secret',
    BACKUP_PASSWORD_HMAC: await hmacHex('server-secret', `password:${PASSWORD}`),
    BACKUP_PASSPHRASE: PASSPHRASE,
    RESEND_API_KEY: 're_test',
    ALERT_EMAILS: 'dev@example.com,davy@example.com',
    ALERT_REPLY_TO: 'dev@example.com',
    BACKUP_UPLOAD_KEY: UPLOAD_KEY,
  }
  mails = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    mails.push(String(init.body))
    return new Response('{}', { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

type Handler = (c: never) => Response | Promise<Response>

/** Calls a handler the way Pages does, through the middleware, and waits for its waitUntil work. */
async function call(handler: Handler, request: Request, params: Record<string, string | string[]> = {}) {
  const waits: Promise<unknown>[] = []
  const context = (next: () => Promise<Response>) =>
    ({ request, env, params, data: {}, functionPath: '', waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {}, next }) as never
  const response = await (middleware as unknown as Handler)(context(async () => (handler as Handler)(context(async () => new Response()))))
  await Promise.all(waits)
  return response
}

const post = (password: string, ip = '203.0.113.7') =>
  new Request(`${SITE}/api/backups/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ password }),
  })
const get = (path: string, cookie?: string) =>
  new Request(`${SITE}/api/backups/${path}`, { headers: cookie ? { cookie } : {} })

const signedIn = async () => {
  const r = await call(signIn, post(PASSWORD))
  return r.headers.get('set-cookie')!.split(';')[0]
}

describe('the Backups page server', () => {
  it('refuses everything but sign-in without a session', async () => {
    const r = await call(list, get('list'))
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'Sign in again.' })
    expect((await call(key, get('key'))).status).toBe(401)
  })

  it('signs in with the right password and sets a __Host- cookie the browser forgets when it closes', async () => {
    const r = await call(signIn, post(PASSWORD))
    expect(r.status).toBe(200)
    const cookie = r.headers.get('set-cookie')!
    for (const part of ['__Host-lgd_backups=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
      expect(cookie).toContain(part)
    }
    expect(cookie).not.toContain('Max-Age')
    expect((await call(list, get('list', cookie.split(';')[0]))).status).toBe(200)
  })

  it('signs out by clearing the cookie, with or without a session', async () => {
    const cookie = await signedIn()
    const out = (cookieHeader?: string) =>
      call(signOut, new Request(`${SITE}/api/backups/sign-out`, { method: 'POST', headers: cookieHeader ? { cookie: cookieHeader } : {} }))
    for (const r of [await out(cookie), await out()]) {
      expect(r.status).toBe(200)
      expect(r.headers.get('set-cookie')).toBe('__Host-lgd_backups=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict')
    }
  })

  it('a wrong password is refused and counted; the sixth try is told to wait', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call(signIn, post('wrong-password'))
      expect(r.status).toBe(401)
      expect(await r.json()).toEqual({ error: 'That password is not right.' })
    }
    const sixth = await call(signIn, post(PASSWORD))
    expect(sixth.status).toBe(429)
    expect(await sixth.json()).toMatchObject({ lock: 'address', until: expect.any(String) })
    // Another address is still let in.
    expect((await call(signIn, post(PASSWORD, '198.51.100.2'))).status).toBe(200)
  })

  it('refuses sign-in while the guard cannot count', async () => {
    kv.refuseWrites = true
    const r = await call(signIn, post(PASSWORD))
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'Sign-in is paused. Try again later.' })
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('sends one email per sign-in, and neither the password nor the passphrase is in it', async () => {
    await call(signIn, post(PASSWORD))
    expect(mails).toHaveLength(1)
    expect(JSON.parse(mails[0]).subject).toBe('Backups page opened')
    expect(mails[0]).not.toContain(PASSWORD)
    expect(mails[0]).not.toContain(PASSPHRASE)
  })

  it('hands the passphrase only to a signed-in browser', async () => {
    const r = await call(key, get('key', await signedIn()))
    expect(await r.json()).toEqual({ passphrase: PASSPHRASE })
  })

  it("lists newest first, with the server's own time", async () => {
    const meta = (takenAt: string) => ({ metadata: { takenAt, sizeBytes: 1968927, counts: { docs: 20140 } } })
    await kv.put('nightly/2026-11-18_0906', new ArrayBuffer(1), meta('2026-11-18T01:06:00.000Z'))
    await kv.put('nightly/2026-11-19_0837', new ArrayBuffer(1), meta('2026-11-19T00:37:00.000Z'))
    await kv.put('monthly/2026-11-01', new ArrayBuffer(1), meta('2026-10-31T21:46:00.000Z'))
    await kv.put('guard/page', '{"count":1,"firstMs":0}')
    const before = Date.now()
    const body = (await (await call(list, get('list', await signedIn()))).json()) as {
      now: string
      backups: { key: string; kind: string; takenAt: string; sizeBytes: number }[]
    }
    expect(body.backups.map((b) => b.key)).toEqual(['nightly/2026-11-19_0837', 'nightly/2026-11-18_0906', 'monthly/2026-11-01'])
    expect(body.backups[2]).toMatchObject({ kind: 'monthly', sizeBytes: 1968927 })
    expect(Date.parse(body.now)).toBeGreaterThanOrEqual(before - 1000)
  })

  it('streams a backup and names the file', async () => {
    const bytes = new Uint8Array([0x8c, 0x0d, 0x04, 0x09, 0x03, 0x0a])
    await kv.put('nightly/2026-11-19_0837', bytes.buffer)
    const r = await call(file, get('file/nightly/2026-11-19_0837', await signedIn()), { key: ['nightly', '2026-11-19_0837'] })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/octet-stream')
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="legendary-crm-2026-11-19_0837.tar.gz.gpg"')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes)
  })

  it('refuses a key outside the two folders', async () => {
    const cookie = await signedIn()
    for (const parts of [['guard', 'page'], ['nightly', '..', 'guard'], ['nightly']]) {
      expect((await call(file, get(`file/${parts.join('/')}`, cookie), { key: parts })).status).toBe(400)
    }
    expect((await call(file, get('file/nightly/2026-01-01_0000', cookie), { key: ['nightly', '2026-01-01_0000'] })).status).toBe(404)
  })

  it('every response is uncached and unindexed', async () => {
    for (const r of [await call(list, get('list')), await call(signIn, post('wrong-password'))]) {
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect(r.headers.get('referrer-policy')).toBe('no-referrer')
      expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })
})

/** How every backup gpg makes begins: a password-encrypted session key packet. */
const ENCRYPTED = new Uint8Array([0x8c, 0x0d, 0x04, 0x09, 0x03, 0x0a, 0x8f, 0xaf])
/** What the job's Describe step writes. */
const META = { takenAt: '2026-11-19T18:31:07Z', counts: { people: 41, docs: 20140, locations: 12, settings: 3 } }

interface Upload {
  auth?: string | null
  body?: Uint8Array
  meta?: string | null
  cookie?: string
}

/** A PUT as the nightly job's curl sends it, through the middleware. */
const upload = (key: string, o: Upload = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream' }
  const auth = o.auth === undefined ? `Bearer ${UPLOAD_KEY}` : o.auth
  if (auth) headers.authorization = auth
  const meta = o.meta === undefined ? JSON.stringify(META) : o.meta
  if (meta) headers['x-backup-meta'] = meta
  if (o.cookie) headers.cookie = o.cookie
  const request = new Request(`${SITE}/api/backups/upload/${key}`, { method: 'PUT', headers, body: o.body ?? ENCRYPTED })
  return call(put, request, { key: key.split('/') })
}

/** The backups KV holds, leaving out the guard's counters. */
const kept = () => [...kv.store.keys()].filter((k) => /^(nightly|monthly)\//.test(k))

describe('the nightly job’s upload', () => {
  it('keeps a backup sent with the job’s key for 31 nights, and the page lists it as the job described it', async () => {
    const r = await upload('nightly/2026-11-20_0231')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ kept: 'nightly/2026-11-20_0231', sizeBytes: 8 })
    const entry = kv.store.get('nightly/2026-11-20_0231')!
    expect(new Uint8Array(entry.value as ArrayBuffer)).toEqual(ENCRYPTED)
    expect(entry.metadata).toEqual({ ...META, sizeBytes: 8 })
    expect(entry.expirationTtl).toBe(2_678_400)
    const listed = (await (await call(list, get('list', await signedIn()))).json()) as { backups: unknown[] }
    expect(listed.backups).toEqual([{ key: 'nightly/2026-11-20_0231', kind: 'nightly', ...META, sizeBytes: 8 }])
  })

  it('keeps a monthly one for good', async () => {
    expect((await upload('monthly/2026-12-01')).status).toBe(200)
    expect(kv.store.get('monthly/2026-12-01')!.expirationTtl).toBeUndefined()
  })

  it('refuses an upload without the job’s key: a wrong one, a malformed one, none, or a session instead', async () => {
    const cookie = await signedIn()
    for (const auth of [null, `Bearer ${'0'.repeat(64)}`, UPLOAD_KEY, `Bearer ${UPLOAD_KEY} extra`, `Basic ${UPLOAD_KEY}`]) {
      const r = await upload('nightly/2026-11-20_0231', { auth, cookie })
      expect(r.status, String(auth)).toBe(401)
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
    expect(kept()).toEqual([])
  })

  it('refuses everyone while the page has no proper upload key of its own', async () => {
    env.BACKUP_UPLOAD_KEY = ''
    expect((await upload('nightly/2026-11-20_0231')).status).toBe(401)
    env.BACKUP_UPLOAD_KEY = 'short'
    expect((await upload('nightly/2026-11-20_0231', { auth: 'Bearer short' })).status).toBe(401)
    expect(kept()).toEqual([])
  })

  it('opens nothing else: the list, the passphrase and the files still need a session', async () => {
    await kv.put('nightly/2026-11-19_0837', ENCRYPTED.slice().buffer)
    const withKey = (path: string) => new Request(`${SITE}/api/backups/${path}`, { headers: { authorization: `Bearer ${UPLOAD_KEY}` } })
    expect((await call(list, withKey('list'))).status).toBe(401)
    expect((await call(key, withKey('key'))).status).toBe(401)
    expect((await call(file, withKey('file/nightly/2026-11-19_0837'), { key: ['nightly', '2026-11-19_0837'] })).status).toBe(401)
  })

  it('refuses anything but an encrypted backup the job made, under a backup’s name', async () => {
    const big = new Uint8Array(24 * 1024 * 1024 + 1)
    big[0] = 0x8c
    const refused: [string, Upload, number][] = [
      ['guard/page', {}, 400],
      ['nightly/../guard', {}, 400],
      ['nightly/2026-11-20', {}, 400],
      ['monthly/2026-12-01_0230', {}, 400],
      // A gzip, as an unencrypted backup would be.
      ['nightly/2026-11-20_0231', { body: new Uint8Array([0x1f, 0x8b, 0x08, 0x00]) }, 400],
      ['nightly/2026-11-20_0231', { body: new Uint8Array(0) }, 400],
      ['nightly/2026-11-20_0231', { meta: null }, 400],
      ['nightly/2026-11-20_0231', { meta: 'not json' }, 400],
      ['nightly/2026-11-20_0231', { meta: JSON.stringify({ ...META, takenAt: 'yesterday' }) }, 400],
      ['nightly/2026-11-20_0231', { meta: JSON.stringify({ ...META, counts: { docs: -1 } }) }, 400],
      ['nightly/2026-11-20_0231', { meta: JSON.stringify({ ...META, counts: [41] }) }, 400],
      ['nightly/2026-11-20_0231', { body: big }, 413],
    ]
    for (const [k, o, status] of refused) {
      expect((await upload(k, o)).status, `${k} ${o.meta ?? ''} ${o.body?.length ?? ''}`).toBe(status)
    }
    expect(kept()).toEqual([])
  })

  it('says so when Cloudflare will not keep it, so the job fails loudly', async () => {
    kv.refuseWrites = true
    const r = await upload('nightly/2026-11-20_0231')
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'Cloudflare would not keep it. Try again later.' })
  })
})
