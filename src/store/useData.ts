/**
 * The single source of truth. Everything the system knows lives here, and every
 * figure on screen is derived from it by a pure selector — so two screens can
 * never disagree about a number.
 *
 * **Where it comes from.** The server (`api/`) holds everything as documents —
 * sale lines, closings, orders, targets, promotions, lines of the activity
 * log. This store keeps a copy of the ones this person may see and rebuilds
 * the working set from them. Every action changes the copy at once, so the
 * screen never waits, and sends the same document to the server; if the
 * server refuses, the copy is reloaded so nothing false is left on screen.
 *
 * **How it stays current.** Another device's write arrives as a signal; this
 * store then asks for everything since it last looked. It also asks on a timer
 * and whenever the tab comes back to the front, so a promoter's RM 188 shows
 * on her colleague's phone within seconds either way.
 */
import { create } from 'zustand'
import { backend, localBackend } from '../api'
import { docKey, type Doc, type DocKind, type PutDoc, type Result, type Snapshot } from '../api/backend'
import { canClearAccounts, canTransition } from '../lib/po-machine'
import { can, seedPeople, ROLE_LABEL, type Person, type Role } from '../data/people'
import { daysBetween, formatDate, todayInMalaysia } from '../lib/dates'
import { skuLabel, TIER_LABEL } from '../data/products'
import { countryName, MALAYSIA_SEGMENT_LABEL, type MalaysiaSegment } from '../data/countries'
import { locationName } from '../data/locations'
import { rm } from '../lib/format'
import { getSession, getSessionToken } from '../lib/session'
import { auditId, getAuditActor, newestFirst, type AuditEntry, type AuditKind } from '../lib/audit'
import { newId } from '../lib/ids'
import { deriveAlerts } from './selectors'
import type {
  Alert,
  Closing,
  CrmData,
  DateStr,
  PoStatus,
  PurchaseOrder,
  SaleLine,
  Target,
} from '../data/types'
import type { Promotion } from '../data/promotions'
import { DEMO_TODAY } from '../data/seed'

/** Corrections are allowed for three days after the period (Q19). */
export const CORRECTION_WINDOW_DAYS = 3

/** How often to ask the server for changes, on top of the change signal. */
const POLL_MS = 20_000
/** How far back an incremental load overlaps, so a write in flight is never missed. */
const OVERLAP_MS = 3_000

/** The verb for each move, so the log reads as a sentence. */
const PO_ACTION_WORD: Record<PoStatus, string> = {
  draft: 'Started',
  submitted: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  accounts_cleared: 'Cleared',
  packed: 'Packed',
  in_transit: 'Dispatched',
  received: 'Confirmed the arrival of',
}

/** Login fields, named the way the Logins screen names them. */
const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  role: 'Job',
  title: 'Title',
  locationId: 'Store',
  storeChoices: 'Stores',
  initials: 'Initials',
  accent: 'Colour',
  home: 'Home screen',
  blurb: 'Description',
  active: 'Can sign in',
}

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'offline'

export interface DataState extends CrmData {
  /** Everyone who can sign in. Editable at runtime by the MD, Kelly, Chloe or IT. */
  users: Person[]
  /**
   * Sales from earlier days that were never closed, by store and day. The
   * promoter is shown these so a missed night can still be filed.
   */
  unfiledLines: Record<string, Record<DateStr, SaleLine[]>>
  syncStatus: SyncStatus
  lastSyncAt: string | null
  /** The last thing the server refused or the last time it could not be reached. */
  lastError: string | null
  errorSeq: number

  /**
   * One customer, everything they bought.
   *
   * A person who buys three bottles is one sale, not three — so the counter
   * builds the basket first and answers "where are they from?" once. Every line
   * carries the same country and sale id, and the log gets one entry.
   */
  recordSale: (args: {
    locationId: string
    lines: SaleLine[]
    countryCode?: string
    segment?: MalaysiaSegment
  }) => void
  removeSaleLine: (lineId: string) => void
  /** Takes back a whole basket — the client's "delete sales option". */
  removeSale: (saleId: string) => void

  submitClosing: (closing: Closing) => void
  requestCorrection: (args: {
    closingId: string
    requestedBy: string
    reason: string
    revenueMYR: number
  }) => Result
  resolveCorrection: (args: {
    closingId: string
    approvedBy: string
    role: Role
    approve: boolean
  }) => Result

  createPurchaseOrder: (po: PurchaseOrder) => void
  transitionPo: (args: {
    poId: string
    to: PoStatus
    actor: string
    role: Role
    note?: string
    approvedQty?: Record<string, number>
  }) => Result
  /** Finance's acknowledgement, beside the chain. */
  clearAccounts: (args: { poId: string; actor: string; role: Role; note?: string }) => Result

  addUser: (person: Person, password: string) => Promise<Result>
  /**
   * `silent` is for the callers that write their own, better, log entry.
   * Everything else logs itself here so no edit can slip through unrecorded.
   */
  updateUser: (id: string, changes: Partial<Person>, opts?: { silent?: boolean }) => void
  setUserActive: (id: string, active: boolean) => void
  /**
   * Sets somebody's password. The server checks authority and the rules; the
   * result is whatever it said.
   */
  setPassword: (args: { actor: Person; targetId: string; password: string }) => Promise<Result>
  /**
   * Reads somebody's password back, and the server writes down that it
   * happened. Screens never hold a password otherwise.
   */
  revealPassword: (args: { actor: Person; targetId: string }) => Promise<Result & { password?: string }>

  addPromotion: (promotion: Promotion) => void
  updatePromotion: (id: string, changes: Partial<Promotion>) => void

  /** Writes one line in the activity log. Anything may call it. */
  record: (entry: {
    kind: AuditKind
    action: string
    summary: string
    entityId?: string
    locationId?: string
    detail?: string
    /** Used when the actor is not the signed-in person, or nobody is signed in. */
    actor?: { id: string; name: string; role: Role }
  }) => void

  markAlertRead: (id: string) => void
  markAllAlertsRead: () => void
  setTarget: (locationId: string, month: string, amountMYR: number) => void

  /** Wipes every sale, closing and order on the server. Davy and Imran only. */
  clearAllData: () => Promise<Result>

  /** Pulls what changed since the last look, or everything. */
  sync: (full?: boolean) => Promise<void>
  /** Starts the change signal, the timer and the focus check. Returns the stop. */
  startSync: () => () => void
  /** Forgets everything on sign-out. */
  clearSession: () => void
  /** Loads the sample history into the local backend. Local builds only. */
  resetDemo: (today?: DateStr) => void
  /** Replaces the working set from a snapshot. Used by the sync and by the tests. */
  applySnapshot: (snapshot: Snapshot, full: boolean) => void
}

// ── The documents ──────────────────────────────────────────────────────────

const docs = new Map<string, Doc>()
let people: Person[] = seedPeople
let since: string | undefined
let inflight: Promise<void> | null = null

const live = <T>(kind: DocKind): T[] => {
  const out: T[] = []
  for (const d of docs.values()) if (d.kind === kind && !d.deleted) out.push(d.doc as T)
  return out
}

/** The working set, from the documents. */
function rebuild(today: DateStr): CrmData & { users: Person[]; unfiledLines: DataState['unfiledLines'] } {
  const closings = live<Closing>('closing').sort((a, b) => (a.period < b.period ? -1 : 1))
  const purchaseOrders = live<PurchaseOrder>('po').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const targets = live<Target>('target')
  const promotions = live<Promotion>('promotion')
  const audit = live<AuditEntry>('audit').sort(newestFirst)
  const readIds = new Set(live<{ id: string }>('alert_read').map((r) => r.id))

  const liveLines: Record<string, SaleLine[]> = {}
  const unfiledLines: DataState['unfiledLines'] = {}
  const filed = new Set(closings.map((c) => `${c.locationId}::${c.period}`))
  const lines = live<SaleLine>('sale_line').sort((a, b) => ((a.at ?? a.id ?? '') < (b.at ?? b.id ?? '') ? -1 : 1))
  for (const l of lines) {
    if (!l.locationId || !l.day) continue
    if (l.day === today) {
      ;(liveLines[l.locationId] ??= []).push(l)
    } else if (l.day < today && !filed.has(`${l.locationId}::${l.day}`)) {
      ;((unfiledLines[l.locationId] ??= {})[l.day] ??= []).push(l)
    }
  }

  const base: CrmData = {
    today,
    closings,
    purchaseOrders,
    alerts: [],
    targets,
    promotions,
    audit,
    liveLines,
    users: people,
  }
  const alerts: Alert[] = deriveAlerts(base, readIds)
  return { ...base, alerts, users: people, unfiledLines }
}

/**
 * Who is acting.
 *
 * Normally the signed-in person. An explicit actor wins — a purchase order
 * carries the name of whoever moved it — and if there is genuinely nobody,
 * the row says so rather than guessing.
 */
const resolveActor = (
  users: Person[],
  explicit?: { id: string; name: string; role: Role },
): { id: string; name: string; role: Role } => {
  if (explicit) return explicit
  const id = getAuditActor()
  const user = id ? users.find((u) => u.id === id) : undefined
  if (user) return { id: user.id, name: user.name, role: user.role }
  return { id: 'unknown', name: 'Someone not signed in', role: 'promoter' }
}

const empty = (): CrmData => ({
  today: todayInMalaysia(),
  closings: [],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  liveLines: {},
  users: seedPeople,
})

export const useData = create<DataState>()((set, get) => {
  /** Changes the copy at once and sends the documents on. */
  const write = (put: PutDoc[]) => {
    const now = new Date().toISOString()
    for (const d of put) {
      docs.set(docKey(d.kind, d.id), { ...d, updatedAt: now, updatedBy: getSession()?.personId, deleted: false })
    }
    set(rebuild(get().today))
    void backend()
      .put(getSessionToken(), put)
      .then((r) => {
        if (!r.ok) {
          fail(r.error ?? 'The server refused that change.')
          void get().sync(true)
        } else {
          backend().notify()
        }
      })
  }

  const remove = (kind: DocKind, ids: string[]) => {
    const now = new Date().toISOString()
    for (const id of ids) {
      const existing = docs.get(docKey(kind, id))
      if (existing) docs.set(docKey(kind, id), { ...existing, deleted: true, updatedAt: now })
    }
    set(rebuild(get().today))
    void backend()
      .remove(getSessionToken(), kind, ids)
      .then((r) => {
        if (!r.ok) {
          fail(r.error ?? 'The server refused that change.')
          void get().sync(true)
        } else {
          backend().notify()
        }
      })
  }

  const fail = (message: string) =>
    set((s) => ({ lastError: message, errorSeq: s.errorSeq + 1 }))

  const patchDoc = <T>(kind: DocKind, id: string, next: T, extra: Partial<PutDoc> = {}) =>
    write([{ kind, id, doc: next, ...extra }])

  return {
    ...empty(),
    unfiledLines: {},
    syncStatus: 'idle',
    lastSyncAt: null,
    lastError: null,
    errorSeq: 0,

    // ── The activity log ─────────────────────────────────────────────
    record: ({ actor, ...rest }) => {
      const who = resolveActor(get().users, actor)
      const at = new Date().toISOString()
      const entry: AuditEntry = {
        id: auditId(at),
        at,
        actorId: who.id,
        actorName: who.name,
        actorRole: who.role,
        ...rest,
      }
      write([{ kind: 'audit', id: entry.id, locationId: entry.locationId, doc: entry }])
    },

    // ── Counter ──────────────────────────────────────────────────────
    recordSale: ({ locationId, lines, countryCode, segment }) => {
      if (lines.length === 0) return
      const session = getSession()
      const me = get().users.find((u) => u.id === session?.personId)
      const saleId = newId()
      const at = new Date().toISOString()
      const day = get().today
      const stamped: SaleLine[] = lines.map((l) => ({
        ...l,
        id: newId(),
        saleId,
        day,
        locationId,
        at,
        by: me?.id,
        byName: me?.name,
        ...(countryCode ? { countryCode } : {}),
        ...(segment ? { segment } : {}),
      }))
      write(
        stamped.map((l) => ({ kind: 'sale_line' as const, id: l.id!, locationId, day, doc: l })),
      )
      const units = stamped.reduce((a, l) => a + l.qty, 0)
      // The same bottle at two prices is two lines but one product.
      const distinct = new Set(stamped.map((l) => l.skuId)).size
      const what =
        stamped.length === 1
          ? `${stamped[0].qty} × ${skuLabel(stamped[0].skuId)}${
              stamped[0].priceTier ? ` at the ${TIER_LABEL[stamped[0].priceTier].toLowerCase()} price` : ''
            }`
          : `${units} units across ${distinct} ${distinct === 1 ? 'product' : 'products'}`
      get().record({
        kind: 'sale',
        action: 'sale.recorded',
        summary: `Recorded a sale — ${what} at ${locationName(locationId)}`,
        entityId: saleId,
        locationId,
        detail: countryCode
          ? `Customer from ${countryName(countryCode)}${segment ? ` · ${MALAYSIA_SEGMENT_LABEL[segment]}` : ''}`
          : undefined,
      })
    },

    removeSaleLine: (lineId) => {
      const removed = docs.get(docKey('sale_line', lineId))?.doc as SaleLine | undefined
      if (!removed) return
      remove('sale_line', [lineId])
      get().record({
        kind: 'sale',
        action: 'sale.removed',
        summary: `Took back ${removed.qty} × ${skuLabel(removed.skuId)} at ${locationName(removed.locationId ?? '')}`,
        entityId: removed.saleId ?? lineId,
        locationId: removed.locationId,
      })
    },

    removeSale: (saleId) => {
      const lines = live<SaleLine>('sale_line').filter((l) => l.saleId === saleId)
      if (lines.length === 0) return
      remove(
        'sale_line',
        lines.map((l) => l.id!),
      )
      const units = lines.reduce((a, l) => a + l.qty, 0)
      get().record({
        kind: 'sale',
        action: 'sale.removed',
        summary: `Took back a whole sale — ${units} ${units === 1 ? 'unit' : 'units'} at ${locationName(lines[0].locationId ?? '')}`,
        entityId: saleId,
        locationId: lines[0].locationId,
        detail: lines[0].countryCode ? `Customer from ${countryName(lines[0].countryCode)}` : undefined,
      })
    },

    // ── Closing ──────────────────────────────────────────────────────
    submitClosing: (closing) => {
      patchDoc('closing', closing.id, closing, { locationId: closing.locationId, day: closing.period })
      const units = closing.lines.reduce((a, l) => a + l.qty, 0)
      get().record({
        kind: 'closing',
        action: 'closing.filed',
        summary: `Filed the ${formatDate(closing.period)} closing for ${locationName(closing.locationId)} — ${rm(closing.revenueMYR)}`,
        entityId: closing.id,
        locationId: closing.locationId,
        detail: `${units} units${closing.writeOffs.length ? `, ${closing.writeOffs.length} written off` : ''}`,
      })
    },

    requestCorrection: ({ closingId, requestedBy, reason, revenueMYR }) => {
      const state = get()
      const closing = state.closings.find((c) => c.id === closingId)
      if (!closing) return { ok: false, error: 'That closing no longer exists.' }
      if (!reason.trim()) return { ok: false, error: 'Say what needs correcting.' }

      const age = daysBetween(closing.period, state.today)
      if (age > CORRECTION_WINDOW_DAYS) {
        return {
          ok: false,
          error: `Corrections are only allowed for ${CORRECTION_WINDOW_DAYS} days. This one is ${age} days old — ask Kelly to reopen it.`,
        }
      }

      const corrected: Closing = {
        ...closing,
        revenueMYR,
        correction: {
          requestedBy,
          requestedAt: new Date().toISOString(),
          reason: reason.trim(),
          previousRevenueMYR: closing.revenueMYR,
          status: 'pending',
        },
      }
      patchDoc('closing', corrected.id, corrected, { locationId: corrected.locationId, day: corrected.period })
      get().record({
        kind: 'correction',
        action: 'correction.requested',
        summary: `Asked to correct the ${formatDate(closing.period)} closing for ${locationName(closing.locationId)}`,
        entityId: closingId,
        locationId: closing.locationId,
        detail: `${rm(closing.revenueMYR)} → ${rm(revenueMYR)} · ${reason.trim()}`,
      })
      return { ok: true }
    },

    resolveCorrection: ({ closingId, approvedBy, role, approve }) => {
      if (!can(role).approveCorrections) {
        return { ok: false, error: 'Only Kelly or Davy can approve a correction.' }
      }
      const closing = get().closings.find((c) => c.id === closingId)
      if (!closing?.correction) return { ok: false, error: 'There is nothing to decide.' }

      const resolved: Closing = {
        ...closing,
        // A rejected correction puts the original figure back.
        revenueMYR: approve ? closing.revenueMYR : closing.correction.previousRevenueMYR,
        correction: {
          ...closing.correction,
          approvedBy,
          approvedAt: new Date().toISOString(),
          status: approve ? 'approved' : 'rejected',
        },
      }
      patchDoc('closing', resolved.id, resolved, { locationId: resolved.locationId, day: resolved.period })
      get().record({
        kind: 'correction',
        action: approve ? 'correction.approved' : 'correction.rejected',
        summary: `${approve ? 'Approved' : 'Rejected'} the correction to the ${formatDate(closing.period)} closing for ${locationName(closing.locationId)}`,
        entityId: closingId,
        locationId: closing.locationId,
        detail: approve
          ? `${rm(closing.correction.previousRevenueMYR)} → ${rm(closing.revenueMYR)}`
          : `Left at ${rm(closing.correction.previousRevenueMYR)}`,
        actor: { id: getAuditActor() ?? 'unknown', name: approvedBy, role },
      })
      return { ok: true }
    },

    // ── Orders ───────────────────────────────────────────────────────
    createPurchaseOrder: (po) => {
      patchDoc('po', po.id, po, { locationId: po.locationId })
      const units = po.lines.reduce((a, l) => a + l.qtyRequested, 0)
      get().record({
        kind: 'order',
        action: 'order.raised',
        summary: `Raised ${po.id} for ${locationName(po.locationId)} — ${po.lines.length} items, ${units} units`,
        entityId: po.id,
        locationId: po.locationId,
        detail: po.priority === 'urgent' ? 'Marked urgent' : undefined,
      })
    },

    transitionPo: ({ poId, to, actor, role, note, approvedQty }) => {
      const po = get().purchaseOrders.find((p) => p.id === poId)
      if (!po) return { ok: false, error: 'That order no longer exists.' }
      if (!can(role).canEdit) return { ok: false, error: 'Your sign-in is read-only.' }
      if (!canTransition(po.status, to, role)) {
        return { ok: false, error: `A ${role} cannot move an order from ${po.status} to ${to}.` }
      }
      if (to === 'rejected' && !note?.trim()) {
        return { ok: false, error: 'Rejecting an order needs a reason.' }
      }

      const lines = po.lines.map((l) => {
        if (to === 'approved') return { ...l, qtyApproved: approvedQty?.[l.skuId] ?? l.qtyRequested }
        if (to === 'packed') return { ...l, qtyShipped: l.qtyApproved ?? l.qtyRequested }
        return l
      })
      const events = [...po.events, { status: to, actor, role, at: new Date().toISOString(), note }]
      const next: PurchaseOrder = { ...po, status: to, lines, events }
      patchDoc('po', poId, next, { locationId: po.locationId })

      const trimmed =
        to === 'approved'
          ? lines.filter((l, i) => l.qtyApproved !== po.lines[i].qtyRequested).length
          : 0
      get().record({
        kind: 'order',
        action: `order.${to}`,
        summary: `${PO_ACTION_WORD[to]} ${poId} for ${locationName(po.locationId)}`,
        entityId: poId,
        locationId: po.locationId,
        detail:
          note?.trim() ||
          (trimmed > 0 ? `${trimmed} ${trimmed === 1 ? 'line' : 'lines'} trimmed` : undefined),
        actor: { id: getAuditActor() ?? 'unknown', name: actor, role },
      })
      return { ok: true }
    },

    clearAccounts: ({ poId, actor, role, note }) => {
      const po = get().purchaseOrders.find((p) => p.id === poId)
      if (!po) return { ok: false, error: 'That order no longer exists.' }
      if (!canClearAccounts(po, role)) return { ok: false, error: 'Only Finance can clear an approved order.' }
      const at = new Date().toISOString()
      const next: PurchaseOrder = {
        ...po,
        financeClearedBy: actor,
        financeClearedAt: at,
        events: [...po.events, { status: 'accounts_cleared', actor, role, at, note }],
      }
      patchDoc('po', poId, next, { locationId: po.locationId })
      get().record({
        kind: 'order',
        action: 'order.accounts_cleared',
        summary: `Cleared ${poId} for ${locationName(po.locationId)}`,
        entityId: poId,
        locationId: po.locationId,
        detail: note?.trim() || undefined,
        actor: { id: getAuditActor() ?? 'unknown', name: actor, role },
      })
      return { ok: true }
    },

    // ── Logins ───────────────────────────────────────────────────────
    addUser: async (person, password) => {
      const result = await backend().addPerson(getSessionToken(), person, password)
      if (!result.ok) return result
      people = [...people, { ...person, passwordChanges: 0 }]
      set(rebuild(get().today))
      get().record({
        kind: 'login',
        action: 'login.created',
        summary: `Created a login for ${person.name}, ${ROLE_LABEL[person.role]}`,
        entityId: person.id,
        locationId: person.locationId,
        // The password is never written to the log, here or anywhere else.
        detail: 'Issued them a starting password',
      })
      return result
    },

    updateUser: (id, changes, opts) => {
      const before = get().users.find((u) => u.id === id)
      people = people.map((u) => (u.id === id ? { ...u, ...changes } : u))
      set(rebuild(get().today))
      void backend()
        .updatePerson(getSessionToken(), id, changes)
        .then((r) => {
          if (!r.ok) {
            fail(r.error ?? 'The server refused that change.')
            void get().sync(true)
          } else backend().notify()
        })
      if (opts?.silent || !before) return
      const fields = Object.keys(changes).filter(
        (k) => before[k as keyof Person] !== changes[k as keyof Person],
      )
      if (fields.length === 0) return
      get().record({
        kind: 'login',
        action: 'login.updated',
        summary: `Edited the login for ${before.name}`,
        entityId: id,
        detail: fields.map((f) => FIELD_LABEL[f] ?? f).join(', ') + ' changed',
      })
    },

    setUserActive: (id, active) => {
      const target = get().users.find((u) => u.id === id)
      get().updateUser(id, { active }, { silent: true })
      if (!target) return
      get().record({
        kind: 'login',
        action: active ? 'login.enabled' : 'login.disabled',
        summary: `${active ? 'Let' : 'Stopped'} ${target.name} ${active ? 'sign in again' : 'signing in'}`,
        entityId: id,
      })
    },

    setPassword: async ({ actor, targetId, password }) => {
      const result = await backend().setPassword(getSessionToken(), targetId, password)
      if (!result.ok) return result
      // The server writes the log line and the "set by"; reflect it here at once.
      people = people.map((u) =>
        u.id === targetId
          ? {
              ...u,
              passwordChanges: u.passwordChanges + 1,
              passwordSetAt: new Date().toISOString(),
              passwordSetBy: actor.name,
            }
          : u,
      )
      set(rebuild(get().today))
      void get().sync()
      return result
    },

    revealPassword: async ({ targetId }) => {
      const result = await backend().revealPassword(getSessionToken(), targetId)
      // The look-up is logged by the server; pull the line so the screen shows it.
      if (result.ok) void get().sync()
      return result
    },

    // ── Promotions ───────────────────────────────────────────────────
    addPromotion: (promotion) => {
      patchDoc('promotion', promotion.id, promotion)
      get().record({
        kind: 'promotion',
        action: 'promotion.recorded',
        summary: `Recorded the promotion “${promotion.name}” — ${promotion.detail}`,
        entityId: promotion.id,
        detail: `${formatDate(promotion.from)} to ${formatDate(promotion.to)}, planned by ${promotion.plannedBy}`,
      })
    },

    updatePromotion: (id, changes) => {
      const before = get().promotions.find((p) => p.id === id)
      if (!before) return
      patchDoc('promotion', id, { ...before, ...changes })
      const toldIt = changes.informedIt === true && !before.informedIt
      get().record({
        kind: 'promotion',
        action: toldIt ? 'promotion.it_informed' : 'promotion.updated',
        summary: toldIt
          ? `Marked Imran as told about “${before.name}”`
          : `Edited the promotion “${before.name}”`,
        entityId: id,
      })
    },

    // ── Alerts & housekeeping ────────────────────────────────────────
    markAlertRead: (id) => {
      const alert = get().alerts.find((a) => a.id === id)
      if (!alert || alert.read) return
      const by = getSession()?.personId ?? 'unknown'
      write([{ kind: 'alert_read', id, doc: { id, by, at: new Date().toISOString() } }])
      get().record({
        kind: 'alert',
        action: 'alert.read',
        summary: `Read the alert: ${alert.message}`,
        entityId: id,
        locationId: alert.locationId,
      })
    },

    markAllAlertsRead: () => {
      const unread = get().alerts.filter((a) => !a.read)
      if (unread.length === 0) return
      const by = getSession()?.personId ?? 'unknown'
      const at = new Date().toISOString()
      write(unread.map((a) => ({ kind: 'alert_read' as const, id: a.id, doc: { id: a.id, by, at } })))
      get().record({
        kind: 'alert',
        action: 'alert.read_all',
        summary: `Cleared ${unread.length} ${unread.length === 1 ? 'alert' : 'alerts'}`,
      })
    },

    setTarget: (locationId, month, amountMYR) => {
      const before = get().targets.find((t) => t.locationId === locationId && t.month === month)
      const target: Target = { locationId, month, amountMYR }
      patchDoc('target', `${locationId}::${month}`, target, { locationId })
      get().record({
        kind: 'target',
        action: before ? 'target.changed' : 'target.set',
        summary: `Set the ${month} target for ${locationName(locationId)} to ${rm(amountMYR)}`,
        entityId: `${locationId}::${month}`,
        locationId,
        detail: before ? `Was ${rm(before.amountMYR)}` : undefined,
      })
    },

    clearAllData: async () => {
      const result = await backend().clearAllData(getSessionToken())
      if (result.ok) {
        docs.clear()
        since = undefined
        await get().sync(true)
        backend().notify()
      }
      return result
    },

    // ── Sync ─────────────────────────────────────────────────────────
    applySnapshot: (snapshot, full) => {
      if (full) docs.clear()
      for (const d of snapshot.docs) docs.set(docKey(d.kind, d.id), d)
      if (snapshot.people) people = snapshot.people
      since = new Date(new Date(snapshot.now).getTime() - OVERLAP_MS).toISOString()
      set({
        ...rebuild(snapshot.today),
        syncStatus: 'ready',
        lastSyncAt: snapshot.now,
      })
    },

    sync: async (full = false) => {
      const token = getSessionToken()
      if (!token) return
      if (inflight) return inflight
      if (get().syncStatus === 'idle') set({ syncStatus: 'loading' })
      inflight = (async () => {
        try {
          const wantFull = full || !since
          const snapshot = await backend().load(token, wantFull ? undefined : since)
          get().applySnapshot(snapshot, wantFull)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          set((s) => ({
            syncStatus: 'offline',
            lastError: s.syncStatus === 'offline' ? s.lastError : `No connection to the server — ${message}`,
            errorSeq: s.syncStatus === 'offline' ? s.errorSeq : s.errorSeq + 1,
          }))
        } finally {
          inflight = null
        }
      })()
      return inflight
    },

    startSync: () => {
      const b = backend()
      void get().sync(true)
      const stopSignal = b.onChange(() => void get().sync())
      const timer = setInterval(() => void get().sync(), POLL_MS)
      const onFocus = () => {
        if (document.visibilityState === 'visible') void get().sync()
      }
      document.addEventListener('visibilitychange', onFocus)
      window.addEventListener('focus', onFocus)
      window.addEventListener('online', onFocus)
      return () => {
        stopSignal()
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onFocus)
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('online', onFocus)
      }
    },

    clearSession: () => {
      docs.clear()
      since = undefined
      set({ ...empty(), unfiledLines: {}, syncStatus: 'idle', lastSyncAt: null })
    },

    resetDemo: (today = DEMO_TODAY) => {
      const lb = localBackend()
      if (!lb) return
      lb.seed(today)
      since = undefined
      const token = getSessionToken()
      if (token) get().applySnapshot(lb.loadSync(token), true)
      else set({ ...empty(), today, unfiledLines: {} })
    },
  }
})

export const useToday = () => useData((s) => s.today)
export const useAlerts = (): Alert[] => useData((s) => s.alerts)
