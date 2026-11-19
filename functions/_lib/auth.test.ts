import { describe, expect, it } from 'vitest'
import { hmacHex, newSession, passwordMatches, SESSION_COOKIE, sessionCookie, sessionValid } from './auth'
import type { Env } from './env'

const env = (secret: string, passwordHmac = '') => ({ BACKUP_SESSION_SECRET: secret, BACKUP_PASSWORD_HMAC: passwordHmac }) as Env
const T0 = Date.parse('2026-11-19T02:00:00.000Z')
const MIN = 60_000

describe('signing', () => {
  it('hmacHex matches RFC 4231 case 2', async () => {
    expect(await hmacHex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('checks a password against its HMAC under the server secret', async () => {
    const e = env('server-secret', await hmacHex('server-secret', 'password:k7qm-x2pv-9tzh-r4nd'))
    expect(await passwordMatches(e, 'k7qm-x2pv-9tzh-r4nd')).toBe(true)
    expect(await passwordMatches(e, 'k7qm-x2pv-9tzh-r4ne')).toBe(false)
    expect(await passwordMatches(e, '')).toBe(false)
  })
})

describe('the session', () => {
  it('is good for an hour and no longer', async () => {
    const e = env('server-secret')
    const cookie = `other=1; ${SESSION_COOKIE}=${await newSession(e, T0)}`
    expect(await sessionValid(e, cookie, T0 + 59 * MIN)).toBe(true)
    expect(await sessionValid(e, cookie, T0 + 60 * MIN + 1)).toBe(false)
  })

  it('a tampered session, or one signed with another secret, is not', async () => {
    const e = env('server-secret')
    const token = await newSession(e, T0)
    const [expires, sig] = token.split('.')
    expect(await sessionValid(e, `${SESSION_COOKIE}=${Number(expires) + 3_600_000}.${sig}`, T0)).toBe(false)
    expect(await sessionValid(env('another-secret'), `${SESSION_COOKIE}=${token}`, T0)).toBe(false)
    expect(await sessionValid(e, `${SESSION_COOKIE}=nonsense`, T0)).toBe(false)
    expect(await sessionValid(e, null, T0)).toBe(false)
  })

  it('is set as a one-hour __Host- cookie that scripts cannot read', () => {
    expect(sessionCookie('abc.def')).toBe('__Host-lgd_backups=abc.def; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Strict')
  })
})
