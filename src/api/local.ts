/**
 * The single-browser backend.
 *
 * Used by the tests and by anyone working on the code without a server. It
 * keeps the same rules as the shared server — who may write what, who may set
 * and see whose password — so a screen that works here works there, and the
 * tests that run against it are testing the rules the SQL mirrors.
 *
 * Nothing seeded is written to the browser: the sample history is far too big
 * for it. What is stored is only what was written through this module, and
 * that is replayed over a fresh copy of the sample data on load — exactly the
 * overlay the old single-browser build kept, now behind the same interface as
 * the server.
 */
import {
  can,
  canResetPasswordOf,
  canSeePasswordOf,
  checkPassword,
  needsTwoStep,
  maskEmail,
  newSignInCode,
  seedPeople,
  startingPassword,
  ROLE_LABEL,
  type Person,
  type Role,
} from '../data/people'
import { buildSeed, DEMO_TODAY } from '../data/seed'
import { todayInMalaysia } from '../lib/dates'
import { auditId, type AuditEntry } from '../lib/audit'
import { newId } from '../lib/ids'
import type { CrmData, DateStr } from '../data/types'
import {
  docKey,
  publicPerson,
  type Backend,
  type Doc,
  type DocKind,
  type PutDoc,
  type Result,
  type Session,
  type SignInResult,
  type Snapshot,
} from './backend'

const STORAGE_KEY = 'legendary-crm-local-v5'
/** Wrong passwords before the account is held for a minute. */
const MAX_TRIES = 5
const LOCKOUT_MS = 60_000
const CODE_TTL_MS = 10 * 60_000

interface Credential {
  password: string
  history: string[]
}

interface Stored {
  seededFor: DateStr | null
  docs: Doc[]
  people: Person[]
  credentials: Record<string, Credential>
  sessions: Record<string, { personId: string; locationId?: string }>
}

/** Which roles may write which kind of document. Mirrored in the migration. */
const WRITERS: Record<DocKind, Role[]> = {
  sale_line: ['promoter', 'ops', 'md', 'pa'],
  closing: ['promoter', 'ops', 'md', 'pa'],
  po: ['promoter', 'ops', 'md', 'finance', 'warehouse'],
  target: ['md', 'ops'],
  promotion: ['pa', 'md', 'ops'],
  audit: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'],
  alert_read: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'],
  setting: ['md', 'it'],
}

/** Documents a promoter is sent: their own store's, and nothing from the log. */
const visibleTo = (d: Doc, person: Person, locationId?: string): boolean => {
  if (d.kind === 'audit') return can(person.role).viewAudit
  if (person.role !== 'promoter') return true
  if (d.kind === 'target' || d.kind === 'promotion' || d.kind === 'setting' || d.kind === 'alert_read') return true
  return !d.locationId || d.locationId === locationId
}

/** The sample history as documents. */
export function seedToDocs(seed: CrmData): Doc[] {
  const at = `${seed.today}T00:00:00+08:00`
  const docs: Doc[] = []
  for (const c of seed.closings) {
    docs.push({ kind: 'closing', id: c.id, locationId: c.locationId, day: c.period, doc: c, updatedAt: at })
  }
  for (const p of seed.purchaseOrders) {
    docs.push({ kind: 'po', id: p.id, locationId: p.locationId, doc: p, updatedAt: at })
  }
  for (const t of seed.targets) {
    docs.push({ kind: 'target', id: `${t.locationId}::${t.month}`, locationId: t.locationId, doc: t, updatedAt: at })
  }
  for (const p of seed.promotions) {
    docs.push({ kind: 'promotion', id: p.id, doc: p, updatedAt: at })
  }
  for (const a of seed.audit) {
    docs.push({ kind: 'audit', id: a.id, locationId: a.locationId, doc: a, updatedAt: at })
  }
  for (const [locationId, lines] of Object.entries(seed.liveLines)) {
    lines.forEach((l, i) => {
      const id = `seed-${locationId}-${i}`
      // One customer per line, rung up through the morning.
      const rungAt = `${seed.today}T${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:00+08:00`
      docs.push({
        kind: 'sale_line',
        id,
        locationId,
        day: seed.today,
        doc: { ...l, id, saleId: `seed-sale-${locationId}-${i}`, day: seed.today, locationId, at: rungAt },
        updatedAt: at,
      })
    })
  }
  return docs
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const

  private docs = new Map<string, Doc>()
  /** Keys of documents written here, as opposed to generated from the seed. */
  private written = new Set<string>()
  private people: Person[] = []
  private credentials: Record<string, Credential> = {}
  private sessions: Record<string, { personId: string; locationId?: string }> = {}
  private seededFor: DateStr | null = null
  private listeners = new Set<() => void>()
  private failed: Record<string, { tries: number; until: number }> = {}
  private pendingCodes: Record<string, { personId: string; code: string; expiresAt: number }> = {}

  constructor(private readonly storage: Storage | null = localStorageOrNull()) {
    this.restore()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.restore()
          this.emit()
        }
      })
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private restore() {
    this.docs.clear()
    this.written.clear()
    this.people = seedPeople.map(publicPerson)
    this.credentials = Object.fromEntries(
      seedPeople.map((p) => [p.id, { password: startingPassword(p.username), history: [] }]),
    )
    this.sessions = {}
    this.seededFor = null

    let stored: Stored | null = null
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      stored = raw ? (JSON.parse(raw) as Stored) : null
    } catch {
      stored = null
    }
    if (stored?.seededFor) this.seed(stored.seededFor, false)
    if (!stored) return
    for (const p of stored.people ?? []) {
      const i = this.people.findIndex((x) => x.id === p.id)
      if (i >= 0) this.people[i] = p
      else this.people.push(p)
    }
    Object.assign(this.credentials, stored.credentials ?? {})
    this.sessions = stored.sessions ?? {}
    for (const d of stored.docs ?? []) {
      this.docs.set(docKey(d.kind, d.id), d)
      this.written.add(docKey(d.kind, d.id))
    }
  }

  private save() {
    if (!this.storage) return
    const docs = [...this.written]
      .map((k) => this.docs.get(k))
      .filter((d): d is Doc => Boolean(d))
    // The log is the one thing that grows without bound; keep the newest.
    const audit = docs.filter((d) => d.kind === 'audit').sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 500)
    const rest = docs.filter((d) => d.kind !== 'audit')
    const stored: Stored = {
      seededFor: this.seededFor,
      docs: [...rest, ...audit],
      people: this.people,
      credentials: this.credentials,
      sessions: this.sessions,
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // Storage full or blocked: the session still works, it just will not survive a refresh.
    }
  }

  /** Loads the sample history, ending on `today`. */
  seed(today: DateStr = DEMO_TODAY, persist = true) {
    this.docs.clear()
    this.written.clear()
    this.seededFor = today
    for (const d of seedToDocs(buildSeed(undefined, today))) this.docs.set(docKey(d.kind, d.id), d)
    if (persist) this.save()
  }

  /** Back to nothing but the people. */
  reset() {
    this.docs.clear()
    this.written.clear()
    this.seededFor = null
    this.people = seedPeople.map(publicPerson)
    this.credentials = Object.fromEntries(
      seedPeople.map((p) => [p.id, { password: startingPassword(p.username), history: [] }]),
    )
    this.sessions = {}
    this.save()
  }

  get today(): DateStr {
    return this.seededFor ?? todayInMalaysia()
  }

  // ── Sessions ──────────────────────────────────────────────────────────

  private session(token: string): Session | null {
    const s = this.sessions[token]
    if (!s) return null
    const person = this.people.find((p) => p.id === s.personId)
    if (!person || !person.active) return null
    return { token, person, locationId: s.locationId ?? person.locationId }
  }

  private audit(entry: Omit<AuditEntry, 'id' | 'at'>) {
    const at = new Date().toISOString()
    const row: AuditEntry = { id: auditId(at), at, ...entry }
    this.write({ kind: 'audit', id: row.id, locationId: row.locationId, doc: row }, row.actorId)
  }

  private write(d: PutDoc, by: string) {
    const doc: Doc = { ...d, updatedAt: new Date().toISOString(), updatedBy: by, deleted: false }
    this.docs.set(docKey(d.kind, d.id), doc)
    this.written.add(docKey(d.kind, d.id))
  }

  async signIn(username: string, password: string): Promise<SignInResult> {
    return this.signInSync(username, password)
  }

  signInSync(username: string, password: string): SignInResult {
    const key = username.trim().toLowerCase()
    const held = this.failed[key]
    if (held && held.until > Date.now()) {
      const seconds = Math.ceil((held.until - Date.now()) / 1000)
      return { ok: false, error: `Too many attempts. Try again in ${seconds} seconds.` }
    }
    const person = this.people.find((p) => p.username.toLowerCase() === key)
    const cred = person ? this.credentials[person.id] : undefined
    if (!person || !cred || cred.password !== password || !person.active) {
      this.audit({
        actorId: 'unknown',
        actorName: 'Someone signing in',
        actorRole: 'promoter',
        kind: 'session',
        action: 'session.sign_in_failed',
        summary: 'A sign-in was refused — wrong username or password',
      })
      const tries = (held?.tries ?? 0) + 1
      if (tries >= MAX_TRIES) {
        this.failed[key] = { tries: 0, until: Date.now() + LOCKOUT_MS }
        this.save()
        return { ok: false, error: 'Too many attempts. Try again in a minute.' }
      }
      this.failed[key] = { tries, until: 0 }
      this.save()
      return { ok: false, error: 'That username and password do not match.' }
    }
    delete this.failed[key]

    if (needsTwoStep(person)) {
      const token = `pending-${newId()}`
      const code = newSignInCode()
      this.pendingCodes[token] = { personId: person.id, code, expiresAt: Date.now() + CODE_TTL_MS }
      this.audit({
        actorId: person.id,
        actorName: person.name,
        actorRole: person.role,
        kind: 'session',
        action: 'session.code_sent',
        summary: `A sign-in code was sent to ${maskEmail(person.email)}`,
        entityId: person.id,
      })
      this.save()
      return { ok: true, token, needsCode: true, sentTo: maskEmail(person.email) }
    }
    return this.open(person)
  }

  /** For the walkthrough panel only: the code that would have been mailed. */
  peekCode(token: string): string | null {
    return this.pendingCodes[token]?.code ?? null
  }

  private open(person: Person): SignInResult {
    const token = `local-${newId()}`
    this.sessions[token] = { personId: person.id }
    this.audit({
      actorId: person.id,
      actorName: person.name,
      actorRole: person.role,
      kind: 'session',
      action: 'session.signed_in',
      summary: `${person.name} signed in`,
      entityId: person.id,
      locationId: person.locationId,
    })
    this.save()
    return { ok: true, token, person, locationId: person.locationId }
  }

  async submitCode(token: string, code: string): Promise<SignInResult> {
    const pending = this.pendingCodes[token]
    if (!pending) return { ok: false, error: 'Start again — that sign-in has expired.' }
    if (Date.now() > pending.expiresAt) {
      delete this.pendingCodes[token]
      return { ok: false, error: 'That code has expired. Sign in again for a new one.' }
    }
    if (code.trim() !== pending.code) return { ok: false, error: 'That code is not right.' }
    delete this.pendingCodes[token]
    const person = this.people.find((p) => p.id === pending.personId)
    if (!person || !person.active) return { ok: false, error: 'That login is no longer active.' }
    return this.open(person)
  }

  async chooseStore(token: string, locationId: string, locationName?: string): Promise<Result> {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    if (!s.person.storeChoices?.includes(locationId)) {
      return { ok: false, error: 'That is not one of your stores.' }
    }
    this.sessions[token] = { personId: s.person.id, locationId }
    this.audit({
      actorId: s.person.id,
      actorName: s.person.name,
      actorRole: s.person.role,
      kind: 'session',
      action: 'session.store_chosen',
      summary: `${s.person.name} is working at ${locationName ?? locationId} today`,
      entityId: s.person.id,
      locationId,
    })
    this.save()
    return { ok: true }
  }

  async signOut(token: string): Promise<void> {
    const s = this.session(token)
    if (s) {
      this.audit({
        actorId: s.person.id,
        actorName: s.person.name,
        actorRole: s.person.role,
        kind: 'session',
        action: 'session.signed_out',
        summary: `${s.person.name} signed out`,
        entityId: s.person.id,
      })
    }
    delete this.sessions[token]
    this.save()
  }

  async whoami(token: string): Promise<Session | null> {
    return this.session(token)
  }

  // ── Documents ─────────────────────────────────────────────────────────

  async load(token: string, since?: string): Promise<Snapshot> {
    return this.loadSync(token, since)
  }

  loadSync(token: string, since?: string): Snapshot {
    const s = this.session(token)
    const now = new Date().toISOString()
    if (!s) return { people: [], docs: [], now, today: this.today }
    const docs = [...this.docs.values()].filter(
      (d) => (!since || d.updatedAt > since) && visibleTo(d, s.person, s.locationId),
    )
    return { people: this.people.map(publicPerson), docs, now, today: this.today }
  }

  /** Every document, regardless of who is asking. For the tests. */
  allDocs(): Doc[] {
    return [...this.docs.values()]
  }

  async put(token: string, docs: PutDoc[]): Promise<Result> {
    return this.putSync(token, docs)
  }

  putSync(token: string, docs: PutDoc[]): Result {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    for (const d of docs) {
      const refused = this.refuse(s, d.kind, d.locationId ?? undefined)
      if (refused) return { ok: false, error: refused }
      if (d.kind === 'audit') {
        // Append-only: a line that exists is never rewritten. And the actor is
        // not the browser's to claim — whoever holds the session is stamped
        // over whatever was sent, so a line can never be filed against
        // somebody else.
        if (this.docs.has(docKey(d.kind, d.id))) continue
        this.write(
          {
            ...d,
            doc: {
              ...(d.doc as object),
              actorId: s.person.id,
              actorName: s.person.name,
              actorRole: s.person.role,
            },
          },
          s.person.id,
        )
        continue
      }
      this.write(d, s.person.id)
    }
    this.save()
    return { ok: true }
  }

  private refuse(s: Session, kind: DocKind, locationId?: string): string | null {
    if (!can(s.person.role).canEdit && kind !== 'alert_read' && kind !== 'audit') {
      return 'Your sign-in is read-only.'
    }
    if (!WRITERS[kind].includes(s.person.role)) return `A ${ROLE_LABEL[s.person.role]} cannot change that.`
    if (s.person.role === 'promoter' && locationId && locationId !== s.locationId) {
      return 'That belongs to another store.'
    }
    return null
  }

  async remove(token: string, kind: DocKind, ids: string[]): Promise<Result> {
    return this.removeSync(token, kind, ids)
  }

  removeSync(token: string, kind: DocKind, ids: string[]): Result {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    if (kind === 'audit') return { ok: false, error: 'The activity log cannot be edited.' }
    for (const id of ids) {
      const existing = this.docs.get(docKey(kind, id))
      if (!existing) continue
      const refused = this.refuse(s, kind, existing.locationId ?? undefined)
      if (refused) return { ok: false, error: refused }
      this.docs.set(docKey(kind, id), {
        ...existing,
        deleted: true,
        updatedAt: new Date().toISOString(),
        updatedBy: s.person.id,
      })
      this.written.add(docKey(kind, id))
    }
    this.save()
    return { ok: true }
  }

  // ── People ────────────────────────────────────────────────────────────

  async addPerson(token: string, person: Person, password: string): Promise<Result> {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    if (!can(s.person.role).manageUsers) return { ok: false, error: 'You cannot add logins.' }
    if (this.people.some((p) => p.id === person.id || p.username === person.username)) {
      return { ok: false, error: 'Somebody already has that username.' }
    }
    const check = checkPassword(password)
    if (!check.ok) return { ok: false, error: check.error }
    const clean = publicPerson({ ...person, passwordChanges: 0, passwordSetAt: new Date().toISOString(), passwordSetBy: s.person.name })
    this.people.push(clean)
    this.credentials[clean.id] = { password, history: [] }
    this.save()
    return { ok: true }
  }

  async updatePerson(token: string, id: string, patch: Partial<Person>): Promise<Result> {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    const target = this.people.find((p) => p.id === id)
    if (!target) return { ok: false, error: 'That login no longer exists.' }
    if (!can(s.person.role).manageUsers) return { ok: false, error: 'You cannot edit logins.' }
    if (!canResetPasswordOf(s.person, target) && s.person.id !== target.id) {
      return { ok: false, error: `You cannot edit the login for ${target.name}.` }
    }
    const { passwordSetAt, passwordSetBy, passwordChanges, ...safe } = patch as Partial<Person> & Record<string, unknown>
    void passwordSetAt, passwordSetBy, passwordChanges
    Object.assign(target, safe)
    this.save()
    return { ok: true }
  }

  async setPassword(token: string, targetId: string, password: string): Promise<Result> {
    return this.setPasswordSync(token, targetId, password)
  }

  setPasswordSync(token: string, targetId: string, password: string): Result {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    const target = this.people.find((p) => p.id === targetId)
    if (!target) return { ok: false, error: 'That login no longer exists.' }
    if (!canResetPasswordOf(s.person, target)) {
      return {
        ok: false,
        error:
          s.person.id === target.id
            ? 'Your role cannot change its own password. Ask a senior for a new one.'
            : `You cannot set the password for ${target.name}.`,
      }
    }
    const check = checkPassword(password)
    if (!check.ok) return { ok: false, error: check.error }
    const cred = this.credentials[targetId] ?? { password: '', history: [] }
    if (password === cred.password) return { ok: false, error: 'That is the password already in use.' }
    if (cred.history.includes(password)) {
      return { ok: false, error: 'That password has been used before. Choose a new one.' }
    }
    this.credentials[targetId] = { password, history: [...cred.history, cred.password].filter(Boolean) }
    target.passwordChanges = this.credentials[targetId].history.length
    target.passwordSetAt = new Date().toISOString()
    target.passwordSetBy = s.person.name
    this.audit({
      actorId: s.person.id,
      actorName: s.person.name,
      actorRole: s.person.role,
      kind: 'password',
      action: s.person.id === targetId ? 'password.changed' : 'password.reset',
      summary:
        s.person.id === targetId
          ? 'Changed their own password'
          : `Reset the password for ${target.name}, ${ROLE_LABEL[target.role]}`,
      entityId: targetId,
    })
    this.save()
    return { ok: true }
  }

  async revealPassword(token: string, targetId: string): Promise<Result & { password?: string }> {
    return this.revealPasswordSync(token, targetId)
  }

  revealPasswordSync(token: string, targetId: string): Result & { password?: string } {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    const target = this.people.find((p) => p.id === targetId)
    if (!target) return { ok: false, error: 'That login no longer exists.' }
    if (!canSeePasswordOf(s.person, target)) {
      return { ok: false, error: `You cannot see the password for ${target.name}.` }
    }
    this.audit({
      actorId: s.person.id,
      actorName: s.person.name,
      actorRole: s.person.role,
      kind: 'password',
      action: 'password.revealed',
      summary:
        s.person.id === targetId
          ? 'Looked at their own password'
          : `Looked at the password for ${target.name}, ${ROLE_LABEL[target.role]}`,
      entityId: targetId,
    })
    this.save()
    return { ok: true, password: this.credentials[targetId]?.password }
  }

  /** The credential store, for the tests only. */
  passwordOf(personId: string): string | undefined {
    return this.credentials[personId]?.password
  }

  /** A session without a password, for the tests only. */
  openSessionForTests(personId: string, locationId?: string): string {
    const token = `test-${newId()}`
    this.sessions[token] = { personId, ...(locationId ? { locationId } : {}) }
    return token
  }

  async clearAllData(token: string): Promise<Result> {
    const s = this.session(token)
    if (!s) return { ok: false, error: 'Sign in again.' }
    if (s.person.role !== 'it' && s.person.role !== 'md') {
      return { ok: false, error: 'Only Davy or Imran can start over.' }
    }
    this.docs.clear()
    this.written.clear()
    this.seededFor = null
    this.audit({
      actorId: s.person.id,
      actorName: s.person.name,
      actorRole: s.person.role,
      kind: 'session',
      action: 'data.cleared',
      summary: `${s.person.name} cleared every sale, closing and order to start over`,
    })
    this.save()
    return { ok: true }
  }

  // ── Change signal ─────────────────────────────────────────────────────

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify(): void {
    // Other tabs hear the storage event; this tab already has the change.
  }

  private emit() {
    for (const l of this.listeners) l()
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

