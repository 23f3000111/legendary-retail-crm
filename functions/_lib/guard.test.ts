import { describe, expect, it } from 'vitest'
import { FakeKV } from './fake-kv'
import { countAttempt, forgiveAttempt, lockedFor } from './guard'

const T0 = Date.parse('2026-11-19T02:00:00.000Z')
const MIN = 60_000

/** n attempts from one address, a minute apart. */
const tries = async (kv: FakeKV, ip: string, n: number, from = T0) => {
  let last
  for (let i = 0; i < n; i++) last = await countAttempt(kv as unknown as KVNamespace, ip, from + i * MIN)
  return last
}

describe('the guard on sign-in', () => {
  it('four wrong tries leave an address open; the fifth locks it for 15 minutes', async () => {
    const kv = new FakeKV()
    expect(await tries(kv, '203.0.113.7', 4)).toEqual({ lock: null })
    expect(await lockedFor(kv as unknown as KVNamespace, '203.0.113.7', T0 + 4 * MIN)).toEqual({ lock: null })

    const fifth = await countAttempt(kv as unknown as KVNamespace, '203.0.113.7', T0 + 4 * MIN)
    expect(fifth).toEqual({ lock: 'address', untilMs: T0 + 19 * MIN })
    expect(await lockedFor(kv as unknown as KVNamespace, '203.0.113.7', T0 + 18 * MIN)).toEqual({
      lock: 'address',
      untilMs: T0 + 19 * MIN,
    })
    expect(await lockedFor(kv as unknown as KVNamespace, '203.0.113.7', T0 + 19 * MIN + 1)).toEqual({ lock: null })
  })

  it('another address is not affected', async () => {
    const kv = new FakeKV()
    await tries(kv, '203.0.113.7', 5)
    expect(await lockedFor(kv as unknown as KVNamespace, '198.51.100.2', T0 + 5 * MIN)).toEqual({ lock: null })
  })

  it('twenty wrong tries in an hour from anywhere lock the page for an hour', async () => {
    const kv = new FakeKV()
    let last
    for (let i = 0; i < 20; i++) last = await countAttempt(kv as unknown as KVNamespace, `198.51.100.${i}`, T0 + i * 2 * MIN)
    expect(last).toEqual({ lock: 'page', untilMs: T0 + 38 * MIN + 60 * MIN })
    expect(await lockedFor(kv as unknown as KVNamespace, '192.0.2.1', T0 + 40 * MIN)).toEqual({
      lock: 'page',
      untilMs: T0 + 98 * MIN,
    })
  })

  it('a right password forgives the attempt, so a person who signs in often is never locked', async () => {
    const kv = new FakeKV()
    for (let i = 0; i < 8; i++) {
      expect(await countAttempt(kv as unknown as KVNamespace, '203.0.113.7', T0 + i * MIN)).toEqual({ lock: null })
      await forgiveAttempt(kv as unknown as KVNamespace, '203.0.113.7')
    }
    expect(await lockedFor(kv as unknown as KVNamespace, '203.0.113.7', T0 + 8 * MIN)).toEqual({ lock: null })
  })

  it('is unavailable when it cannot count', async () => {
    const kv = new FakeKV()
    kv.refuseWrites = true
    await expect(countAttempt(kv as unknown as KVNamespace, '203.0.113.7', T0)).rejects.toThrow()
    kv.refuseReads = true
    expect(await lockedFor(kv as unknown as KVNamespace, '203.0.113.7', T0)).toEqual({ lock: 'unavailable' })
  })
})
