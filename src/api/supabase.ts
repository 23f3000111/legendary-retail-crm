/**
 * The shared backend: one Supabase project every phone and laptop talks to.
 *
 * The browser never touches a table. Every call is a Postgres function
 * (`supabase/migrations/0001_init.sql`) that takes the session token, works
 * out who is asking, and applies the same rules `local.ts` applies — so the
 * key that ships in this bundle can do nothing on its own.
 *
 * Other devices are told about a write over a Realtime broadcast channel,
 * carrying nothing but "something changed"; each device then asks the server
 * for what changed since it last looked. If the channel is down, the store
 * polls anyway.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { Person } from '../data/people'
import type {
  Backend,
  Doc,
  DocKind,
  PutDoc,
  Result,
  Session,
  SignInResult,
  Snapshot,
} from './backend'

interface WireDoc {
  kind: DocKind
  id: string
  location_id: string | null
  day: string | null
  doc: unknown
  updated_at: string
  updated_by: string | null
  deleted: boolean
}

const fromWire = (d: WireDoc): Doc => ({
  kind: d.kind,
  id: d.id,
  locationId: d.location_id,
  day: d.day,
  doc: d.doc,
  updatedAt: d.updated_at,
  updatedBy: d.updated_by,
  deleted: d.deleted,
})

const toWire = (d: PutDoc) => ({
  kind: d.kind,
  id: d.id,
  location_id: d.locationId ?? null,
  day: d.day ?? null,
  doc: d.doc,
})

const CHANNEL = 'crm-changes'

export class SupabaseBackend implements Backend {
  readonly mode = 'live' as const
  private client: SupabaseClient
  private channel: RealtimeChannel | null = null
  private listeners = new Set<() => void>()

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  /** Turns a thrown error into the `{ ok: false }` every caller expects. */
  private async guarded<T extends Result>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (e) {
      return { ok: false, error: describe(e) } as T
    }
  }

  signIn(username: string, password: string): Promise<SignInResult> {
    return this.guarded(() =>
      this.rpc<SignInResult>('sign_in', { p_username: username, p_password: password }),
    )
  }

  submitCode(token: string, code: string): Promise<SignInResult> {
    return this.guarded(() => this.rpc<SignInResult>('submit_code', { p_token: token, p_code: code }))
  }

  chooseStore(token: string, locationId: string, locationName?: string): Promise<Result> {
    return this.guarded(() =>
      this.rpc<Result>('choose_store', {
        p_token: token,
        p_location_id: locationId,
        p_location_name: locationName ?? null,
      }),
    )
  }

  async signOut(token: string): Promise<void> {
    try {
      await this.rpc('sign_out', { p_token: token })
    } catch {
      // The session is gone from this device either way.
    }
  }

  async whoami(token: string): Promise<Session | null> {
    try {
      const r = await this.rpc<{ ok: boolean; person?: Person; locationId?: string }>('whoami', {
        p_token: token,
      })
      return r.ok && r.person ? { token, person: r.person, locationId: r.locationId } : null
    } catch {
      return null
    }
  }

  async load(token: string, since?: string): Promise<Snapshot> {
    const r = await this.rpc<{
      ok: boolean
      error?: string
      people: Person[] | null
      docs: WireDoc[]
      now: string
      today: string
    }>('load_state', { p_token: token, p_since: since ?? null })
    if (!r.ok) throw new Error(r.error ?? 'Could not load')
    return { people: r.people, docs: (r.docs ?? []).map(fromWire), now: r.now, today: r.today }
  }

  put(token: string, docs: PutDoc[]): Promise<Result> {
    return this.guarded(() => this.rpc<Result>('put_docs', { p_token: token, p_docs: docs.map(toWire) }))
  }

  remove(token: string, kind: DocKind, ids: string[]): Promise<Result> {
    return this.guarded(() =>
      this.rpc<Result>('remove_docs', { p_token: token, p_kind: kind, p_ids: ids }),
    )
  }

  addPerson(token: string, person: Person, password: string): Promise<Result> {
    return this.guarded(() =>
      this.rpc<Result>('add_person', { p_token: token, p_person: person, p_password: password }),
    )
  }

  updatePerson(token: string, id: string, patch: Partial<Person>): Promise<Result> {
    return this.guarded(() =>
      this.rpc<Result>('update_person', { p_token: token, p_id: id, p_patch: patch }),
    )
  }

  setPassword(token: string, targetId: string, password: string): Promise<Result> {
    return this.guarded(() =>
      this.rpc<Result>('set_password', { p_token: token, p_target: targetId, p_password: password }),
    )
  }

  revealPassword(token: string, targetId: string): Promise<Result & { password?: string }> {
    return this.guarded(() =>
      this.rpc<Result & { password?: string }>('reveal_password', { p_token: token, p_target: targetId }),
    )
  }

  clearAllData(token: string): Promise<Result> {
    return this.guarded(() => this.rpc<Result>('clear_all_data', { p_token: token }))
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    this.ensureChannel()
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(): void {
    this.ensureChannel()
    void this.channel?.send({ type: 'broadcast', event: 'changed', payload: {} })
  }

  private ensureChannel() {
    if (this.channel) return
    this.channel = this.client
      .channel(CHANNEL, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, () => {
        for (const l of this.listeners) l()
      })
    this.channel.subscribe()
  }
}

const describe = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e)
  if (/fetch|network|Failed to/i.test(message)) return 'No connection. Check the internet and try again.'
  return message
}
