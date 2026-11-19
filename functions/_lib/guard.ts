/**
 * Wrong passwords lock the page (design, 19 November):
 *
 * - five tries from one address within 15 minutes lock that address for 15;
 * - twenty within an hour from anywhere lock the page for an hour.
 *
 * Every try is counted *before* its password is looked at, and forgiven
 * afterwards when it was right. So when KV cannot count — its free plan
 * stops writes after 1,000 a day, which an attacker could spend on purpose —
 * sign-in stops for everyone, rather than letting guesses through uncounted
 * (fails closed). Counting is not atomic across Cloudflare's edge; the
 * password's 80 bits are the real defence, and this only slows guessing.
 */
export type Lock = 'address' | 'page' | 'unavailable' | null

export const LIMITS = {
  address: { tries: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  page: { tries: 20, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
} as const

interface Counter {
  count: number
  firstMs: number
  lockedUntilMs?: number
}

const PAGE_KEY = 'guard/page'
const addressKey = (ip: string) => `guard/address/${ip}`

const read = async (kv: KVNamespace, key: string): Promise<Counter | null> => {
  const text = await kv.get(key)
  return text ? (JSON.parse(text) as Counter) : null
}

const write = (kv: KVNamespace, key: string, c: Counter, limit: { windowMs: number; lockMs: number }) =>
  kv.put(key, JSON.stringify(c), { expirationTtl: Math.ceil(Math.max(limit.windowMs, limit.lockMs) / 1000) + 60 })

/** Whether this address, or the whole page, is locked now. */
export async function lockedFor(kv: KVNamespace, ip: string, nowMs: number): Promise<{ lock: Lock; untilMs?: number }> {
  try {
    const page = await read(kv, PAGE_KEY)
    if (page?.lockedUntilMs && page.lockedUntilMs > nowMs) return { lock: 'page', untilMs: page.lockedUntilMs }
    const address = await read(kv, addressKey(ip))
    if (address?.lockedUntilMs && address.lockedUntilMs > nowMs) return { lock: 'address', untilMs: address.lockedUntilMs }
    return { lock: null }
  } catch {
    return { lock: 'unavailable' }
  }
}

const bump = async (kv: KVNamespace, key: string, limit: (typeof LIMITS)[keyof typeof LIMITS], nowMs: number) => {
  const was = await read(kv, key)
  const fresh = !was || nowMs - was.firstMs > limit.windowMs
  const next: Counter = fresh ? { count: 1, firstMs: nowMs } : { ...was, count: was.count + 1 }
  if (next.count >= limit.tries && !next.lockedUntilMs) next.lockedUntilMs = nowMs + limit.lockMs
  await write(kv, key, next, limit)
  return next
}

/**
 * Counts one try. Returns the lock this try set off, if it set one off.
 * Throws when KV refuses, and the caller then turns everyone away.
 */
export async function countAttempt(kv: KVNamespace, ip: string, nowMs: number): Promise<{ lock: Lock; untilMs?: number }> {
  const page = await bump(kv, PAGE_KEY, LIMITS.page, nowMs)
  const address = await bump(kv, addressKey(ip), LIMITS.address, nowMs)
  if (page.count === LIMITS.page.tries) return { lock: 'page', untilMs: page.lockedUntilMs }
  if (address.count === LIMITS.address.tries) return { lock: 'address', untilMs: address.lockedUntilMs }
  return { lock: null }
}

/** A right password: its try no longer counts against the address or the page. */
export async function forgiveAttempt(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(addressKey(ip))
  const page = await read(kv, PAGE_KEY)
  if (page && !page.lockedUntilMs && page.count > 0) {
    await write(kv, PAGE_KEY, { ...page, count: page.count - 1 }, LIMITS.page)
  }
}
