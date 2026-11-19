/**
 * For the tests only: Workers KV in memory, with a switch that makes it
 * refuse, as KV does once the free plan's 1,000 writes a day are spent.
 */
export class FakeKV {
  readonly store = new Map<string, { value: string | ArrayBuffer; metadata?: unknown }>()
  refuseWrites = false
  refuseReads = false
  writes = 0

  async get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<unknown> {
    if (this.refuseReads) throw new Error('KV GET failed: 429 Too Many Requests')
    const hit = this.store.get(key)
    if (!hit) return null
    if (type === 'json') return JSON.parse(String(hit.value))
    return hit.value
  }

  async getWithMetadata(key: string, type?: 'text' | 'arrayBuffer' | 'stream') {
    if (this.refuseReads) throw new Error('KV GET failed: 429 Too Many Requests')
    const hit = this.store.get(key)
    if (!hit) return { value: null, metadata: null }
    const value =
      type === 'stream' && hit.value instanceof ArrayBuffer
        ? new Response(hit.value).body
        : hit.value
    return { value, metadata: hit.metadata ?? null }
  }

  async put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number; metadata?: unknown }) {
    if (this.refuseWrites) throw new Error('KV PUT failed: 429 Too Many Requests')
    this.writes += 1
    this.store.set(key, { value, metadata: options?.metadata })
  }

  async delete(key: string) {
    if (this.refuseWrites) throw new Error('KV DELETE failed: 429 Too Many Requests')
    this.store.delete(key)
  }

  async list({ prefix = '' }: { prefix?: string } = {}) {
    if (this.refuseReads) throw new Error('KV LIST failed: 429 Too Many Requests')
    const keys = [...this.store.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, v]) => ({ name, metadata: v.metadata }))
    return { keys, list_complete: true, cacheStatus: null }
  }
}
