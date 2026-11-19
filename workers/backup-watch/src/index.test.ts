import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeKV } from '../../../functions/_lib/fake-kv'
import { check, hoursSince, newestTakenAt } from './index'

const HOUR = 3_600_000
const TAKEN = '2026-11-19T01:06:00.000Z'

let kv: FakeKV
let mails: { subject: string; text: string }[]

const env = () => ({
  BACKUPS: kv as unknown as KVNamespace,
  RESEND_API_KEY: 're_test',
  ALERT_EMAILS: 'dev@example.com,davy@example.com',
  ALERT_REPLY_TO: 'dev@example.com',
})

beforeEach(() => {
  kv = new FakeKV()
  mails = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    mails.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const backup = (key: string, takenAt: string) => kv.put(key, new ArrayBuffer(1), { metadata: { takenAt, sizeBytes: 1 } })

describe('the morning check', () => {
  it('finds the newest across nightly and monthly', () => {
    expect(
      newestTakenAt([
        { name: 'nightly/2026-11-18_0906', metadata: { takenAt: '2026-11-18T01:06:00.000Z' } },
        { name: 'monthly/2026-11-01', metadata: { takenAt: '2026-10-31T21:46:00.000Z' } },
        { name: 'nightly/2026-11-19_0906', metadata: { takenAt: TAKEN } },
        { name: 'nightly/odd' },
      ]),
    ).toBe(TAKEN)
    expect(newestTakenAt([])).toBeNull()
    expect(hoursSince(TAKEN, Date.parse(TAKEN) + 30.5 * HOUR)).toBe(30.5)
  })

  it('stays quiet at 29 h 59 m and speaks at 30 h 01 m', async () => {
    await backup('nightly/2026-11-19_0906', TAKEN)
    expect(await check(env(), Date.parse(TAKEN) + 30 * HOUR - 60_000)).toBe('fresh')
    expect(mails).toHaveLength(0)
    expect(await check(env(), Date.parse(TAKEN) + 30 * HOUR + 60_000)).toBe('stale')
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe('No CRM backup for 30 hours')
    expect(mails[0].text).toContain('09:06 on 19 Nov 2026')
    expect(mails[0].text).toContain('https://github.com/23f3000111/legendary-crm-backups/actions')
  })

  it('treats an empty store as stale', async () => {
    expect(await check(env(), Date.parse(TAKEN))).toBe('stale')
    expect(mails).toEqual([expect.objectContaining({ subject: 'No CRM backup in Cloudflare' })])
  })
})
