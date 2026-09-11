/**
 * The single source of truth. Everything the system knows lives here, and every
 * figure on screen is derived from it by a pure selector — so two screens can
 * never disagree about a number.
 *
 * **What gets saved.** The 90 days of seeded history are far too large for
 * browser storage, so they are never written there. Instead the browser keeps a
 * small overlay of what *this person changed* — the sales they logged, the days
 * they filed, the orders they raised or moved — and that overlay is replayed
 * over a freshly generated seed on load. It keeps a walkthrough's changes across
 * a refresh, and it mirrors how the real system will work: the server holds the
 * history, the device holds only what is in front of you.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { buildSeed } from '../data/seed'
import { canTransition } from '../lib/po-machine'
import {
  can,
  canResetPasswordOf,
  canSeePasswordOf,
  checkPassword,
  seedPeople,
  ROLE_LABEL,
  type Person,
  type Role,
} from '../data/people'
import { daysBetween, formatDate } from '../lib/dates'
import { skuLabel } from '../data/products'
import { countryName, MALAYSIA_SEGMENT_LABEL, type MalaysiaSegment } from '../data/countries'
import { locationName } from '../data/locations'
import { rm } from '../lib/format'
import {
  auditId,
  getAuditActor,
  newestFirst,
  type AuditEntry,
  type AuditKind,
} from '../lib/audit'
import type {
  Alert,
  Closing,
  CrmData,
  PoStatus,
  PurchaseOrder,
  SaleLine,
  Target,
} from '../data/types'
import type { Promotion } from '../data/promotions'

const STORAGE_KEY = 'legendary-crm-v3'

/** Corrections are allowed for three days after the period (Q19). */
export const CORRECTION_WINDOW_DAYS = 3

/**
 * How much of the activity log the browser keeps.
 *
 * This is a limit of the wireframe, not of the design: browser storage is a
 * few megabytes and the seeded history alone would fill it. The real system
 * writes every row to Postgres and keeps them for ten years (Q88). The cap is
 * on what is *replayed after a refresh*, never on what is recorded.
 */
export const AUDIT_OVERLAY_LIMIT = 400

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
  initials: 'Initials',
  accent: 'Colour',
  home: 'Home screen',
  blurb: 'Description',
  active: 'Can sign in',
}

/** The small slice of state that is actually written to the browser. */
interface Overlay {
  liveLines: Record<string, SaleLine[]>
  /** Logins added since the seed. */
  newUsers: Person[]
  /** Edits to seeded logins, by id. */
  userPatches: Record<string, Partial<Person>>
  /** Closings this person filed or corrected. */
  filedClosings: Closing[]
  /** Orders this person raised. */
  newOrders: PurchaseOrder[]
  /** Moves made on seeded orders, by order id. */
  orderPatches: Record<string, Pick<PurchaseOrder, 'status' | 'lines' | 'events'>>
  readAlertIds: string[]
  removedAlertIds: string[]
  /** Actions taken in this browser, newest first. Capped — see the note above. */
  auditEntries: AuditEntry[]
  changedTargets: Target[]
  /** Promotions recorded since the seed. */
  newPromotions: Promotion[]
  /** Edits to seeded promotions, by id. */
  promotionPatches: Record<string, Partial<Promotion>>
}

const emptyOverlay = (): Overlay => ({
  liveLines: {},
  newUsers: [],
  userPatches: {},
  filedClosings: [],
  newOrders: [],
  orderPatches: {},
  readAlertIds: [],
  removedAlertIds: [],
  auditEntries: [],
  changedTargets: [],
  newPromotions: [],
  promotionPatches: {},
})

/** Replays an overlay over a fresh seed to rebuild the full working set. */
function applyOverlay(seed: CrmData, overlay: Overlay): CrmData {
  const filedIds = new Set(overlay.filedClosings.map((c) => `${c.locationId}::${c.period}`))
  const closings = [
    ...seed.closings.filter((c) => !filedIds.has(`${c.locationId}::${c.period}`)),
    ...overlay.filedClosings,
  ].sort((a, b) => (a.period < b.period ? -1 : 1))

  const purchaseOrders = [
    ...overlay.newOrders,
    ...seed.purchaseOrders.map((p) =>
      overlay.orderPatches[p.id] ? { ...p, ...overlay.orderPatches[p.id] } : p,
    ),
  ]

  const removed = new Set(overlay.removedAlertIds)
  const read = new Set(overlay.readAlertIds)
  const alerts = seed.alerts
    .filter((a) => !removed.has(a.id))
    .map((a) => (read.has(a.id) ? { ...a, read: true } : a))

  // A target may be *changed* or *set for the first time*, so the overlay both
  // overrides seeded rows and contributes rows the seed never had.
  const changed = new Map(overlay.changedTargets.map((t) => [`${t.locationId}::${t.month}`, t]))
  const seededKeys = new Set(seed.targets.map((t) => `${t.locationId}::${t.month}`))
  const targets = [
    ...seed.targets.map((t) => changed.get(`${t.locationId}::${t.month}`) ?? t),
    ...overlay.changedTargets.filter((t) => !seededKeys.has(`${t.locationId}::${t.month}`)),
  ]

  const promotions = [
    ...seed.promotions.map((p) =>
      overlay.promotionPatches[p.id] ? { ...p, ...overlay.promotionPatches[p.id] } : p,
    ),
    ...overlay.newPromotions,
  ]

  const users = [
    ...seedPeople.map((u) =>
      overlay.userPatches[u.id] ? { ...u, ...overlay.userPatches[u.id] } : u,
    ),
    ...overlay.newUsers,
  ]

  const audit = [...overlay.auditEntries, ...seed.audit].sort(newestFirst)

  return {
    today: seed.today,
    closings,
    purchaseOrders,
    alerts,
    targets,
    promotions,
    audit,
    liveLines: { ...seed.liveLines, ...overlay.liveLines },
    users,
  }
}

export interface DataState extends CrmData {
  /** Everyone who can sign in. Editable at runtime by the MD, Kelly, Chloe or IT. */
  users: Person[]
  /** Persisted slice — never read directly by screens. */
  overlay: Overlay
  /** Set when saved state could not be read and a fresh seed was substituted. */
  recoveredFromError: boolean

  addSaleLine: (locationId: string, line: SaleLine) => void
  /**
   * One customer, everything they bought.
   *
   * A person who buys three bottles is one sale, not three — so the counter
   * builds the basket first and answers "where are they from?" once. Every line
   * carries the same country, and the log gets one entry rather than three.
   */
  recordSale: (args: {
    locationId: string
    lines: SaleLine[]
    countryCode?: string
    segment?: MalaysiaSegment
  }) => void
  removeSaleLine: (locationId: string, index: number) => void

  submitClosing: (closing: Closing) => void
  requestCorrection: (args: {
    closingId: string
    requestedBy: string
    reason: string
    revenueMYR: number
  }) => { ok: boolean; error?: string }
  resolveCorrection: (args: {
    closingId: string
    approvedBy: string
    role: Role
    approve: boolean
  }) => { ok: boolean; error?: string }

  createPurchaseOrder: (po: PurchaseOrder) => void
  transitionPo: (args: {
    poId: string
    to: PoStatus
    actor: string
    role: Role
    note?: string
    approvedQty?: Record<string, number>
  }) => { ok: boolean; error?: string }

  addUser: (person: Person) => void
  /**
   * `silent` is for the two callers that write their own, better, log entry —
   * changing a PIN and enabling or disabling a login. Everything else logs
   * itself here so no edit can slip through unrecorded.
   */
  updateUser: (id: string, changes: Partial<Person>, opts?: { silent?: boolean }) => void
  setUserActive: (id: string, active: boolean) => void
  /**
   * Changes someone's PIN. Authority and PIN rules are checked here, not only
   * in the form — a screen can be wrong, the store is the last line.
   */
  /**
   * Sets somebody's password. Authority and rules are checked here, not only
   * in the form — a screen can be wrong, the store is the last line.
   */
  setPassword: (args: {
    actor: Person
    targetId: string
    password: string
  }) => { ok: boolean; error?: string }
  /**
   * Reads somebody's password back, and writes down that it happened.
   *
   * The client requires senior staff to be able to look one up, as they could
   * the PIN. Screens never read `person.password` directly; going through here
   * is what makes "who looked at whose password" answerable.
   */
  revealPassword: (args: { actor: Person; targetId: string }) => {
    ok: boolean
    password?: string
    error?: string
  }

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
  dismissRecovery: () => void
  resetDemo: () => void
}

const seeded = (): CrmData => buildSeed()

/**
 * Who is acting.
 *
 * Normally the signed-in person, read from the plain module in `lib/audit` so
 * neither store has to import the other. An explicit actor wins — a purchase
 * order carries the name of whoever moved it — and if there is genuinely
 * nobody, the row says so rather than guessing.
 */
const resolveActor = (
  s: DataState,
  explicit?: { id: string; name: string; role: Role },
): { id: string; name: string; role: Role } => {
  if (explicit) return explicit
  const id = getAuditActor()
  const user = id ? s.users.find((u) => u.id === id) : undefined
  if (user) return { id: user.id, name: user.name, role: user.role }
  return { id: 'unknown', name: 'Someone not signed in', role: 'promoter' }
}

/** Records a closing in both the working set and the overlay. */
const withClosing = (state: DataState, closing: Closing) => {
  const rest = state.closings.filter(
    (c) => !(c.locationId === closing.locationId && c.period === closing.period),
  )
  const overlayRest = state.overlay.filedClosings.filter(
    (c) => !(c.locationId === closing.locationId && c.period === closing.period),
  )
  return {
    closings: [...rest, closing].sort((a, b) => (a.period < b.period ? -1 : 1)),
    filedClosings: [...overlayRest, closing],
  }
}

export const useData = create<DataState>()(
  persist(
    (set, get) => ({
      ...seeded(),
      users: seedPeople,
      overlay: emptyOverlay(),
      recoveredFromError: false,

      // ── The activity log ─────────────────────────────────────────────
      record: ({ actor, ...rest }) =>
        set((s) => {
          const who = resolveActor(s, actor)
          const at = new Date().toISOString()
          const entry: AuditEntry = {
            id: auditId(at),
            at,
            actorId: who.id,
            actorName: who.name,
            actorRole: who.role,
            ...rest,
          }
          return {
            audit: [entry, ...s.audit],
            overlay: {
              ...s.overlay,
              auditEntries: [entry, ...s.overlay.auditEntries].slice(0, AUDIT_OVERLAY_LIMIT),
            },
          }
        }),

      // ── Counter ──────────────────────────────────────────────────────
      addSaleLine: (locationId, line) => {
        set((s) => {
          const next = [...(s.liveLines[locationId] ?? []), line]
          return {
            liveLines: { ...s.liveLines, [locationId]: next },
            overlay: { ...s.overlay, liveLines: { ...s.overlay.liveLines, [locationId]: next } },
          }
        })
        get().record({
          kind: 'sale',
          action: 'sale.recorded',
          summary: `Recorded ${line.qty} × ${skuLabel(line.skuId)} at ${locationName(locationId)}`,
          entityId: line.skuId,
          locationId,
          detail: line.countryCode ? `Customer from ${countryName(line.countryCode)}` : undefined,
        })
      },

      recordSale: ({ locationId, lines, countryCode, segment }) => {
        if (lines.length === 0) return
        const stamped = lines.map((l) => ({
          ...l,
          ...(countryCode ? { countryCode } : {}),
          ...(segment ? { segment } : {}),
        }))
        set((s) => {
          const next = [...(s.liveLines[locationId] ?? []), ...stamped]
          return {
            liveLines: { ...s.liveLines, [locationId]: next },
            overlay: { ...s.overlay, liveLines: { ...s.overlay.liveLines, [locationId]: next } },
          }
        })
        const units = stamped.reduce((a, l) => a + l.qty, 0)
        const what =
          stamped.length === 1
            ? `${stamped[0].qty} × ${skuLabel(stamped[0].skuId)}`
            : `${units} units across ${stamped.length} products`
        get().record({
          kind: 'sale',
          action: 'sale.recorded',
          summary: `Recorded a sale — ${what} at ${locationName(locationId)}`,
          locationId,
          detail: countryCode
            ? `Customer from ${countryName(countryCode)}${segment ? ` · ${MALAYSIA_SEGMENT_LABEL[segment]}` : ''}`
            : undefined,
        })
      },

      removeSaleLine: (locationId, index) => {
        const removed = get().liveLines[locationId]?.[index]
        set((s) => {
          const next = (s.liveLines[locationId] ?? []).filter((_, i) => i !== index)
          return {
            liveLines: { ...s.liveLines, [locationId]: next },
            overlay: { ...s.overlay, liveLines: { ...s.overlay.liveLines, [locationId]: next } },
          }
        })
        if (removed) {
          get().record({
            kind: 'sale',
            action: 'sale.removed',
            summary: `Took back ${removed.qty} × ${skuLabel(removed.skuId)} at ${locationName(locationId)}`,
            entityId: removed.skuId,
            locationId,
          })
        }
      },

      // ── Closing ──────────────────────────────────────────────────────
      submitClosing: (closing) => {
        set((s) => {
          const { closings, filedClosings } = withClosing(s, closing)
          const liveLines = { ...s.liveLines }
          delete liveLines[closing.locationId]
          const overlayLive = { ...s.overlay.liveLines }
          delete overlayLive[closing.locationId]
          const alertId = `missed-${closing.locationId}-${closing.period}`

          return {
            closings,
            liveLines,
            alerts: s.alerts.filter((a) => a.id !== alertId),
            overlay: {
              ...s.overlay,
              filedClosings,
              liveLines: overlayLive,
              removedAlertIds: [...s.overlay.removedAlertIds, alertId],
            },
          }
        })
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

        set((s) => {
          const { closings, filedClosings } = withClosing(s, corrected)
          const alert: Alert = {
            id: `correction-${closingId}`,
            type: 'correction_pending',
            severity: 'warn',
            locationId: closing.locationId,
            message: `${requestedBy} asked to correct the ${closing.period} closing`,
            at: new Date().toISOString(),
            read: false,
          }
          return {
            closings,
            alerts: [alert, ...s.alerts],
            overlay: { ...s.overlay, filedClosings },
          }
        })
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

        set((s) => {
          const { closings, filedClosings } = withClosing(s, resolved)
          return {
            closings,
            alerts: s.alerts.filter((a) => a.id !== `correction-${closingId}`),
            overlay: {
              ...s.overlay,
              filedClosings,
              removedAlertIds: [...s.overlay.removedAlertIds, `correction-${closingId}`],
            },
          }
        })
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
        set((s) => ({
          purchaseOrders: [po, ...s.purchaseOrders],
          overlay: { ...s.overlay, newOrders: [po, ...s.overlay.newOrders] },
        }))
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
        const events = [
          ...po.events,
          { status: to, actor, role, at: new Date().toISOString(), note },
        ]
        const patch = { status: to, lines, events }

        set((s) => {
          const isNew = s.overlay.newOrders.some((p) => p.id === poId)
          return {
            purchaseOrders: s.purchaseOrders.map((p) => (p.id === poId ? { ...p, ...patch } : p)),
            alerts: s.alerts.filter((a) => a.id !== `po-${poId}`),
            overlay: {
              ...s.overlay,
              // A brand-new order is stored whole; a seeded one only as a patch.
              newOrders: isNew
                ? s.overlay.newOrders.map((p) => (p.id === poId ? { ...p, ...patch } : p))
                : s.overlay.newOrders,
              orderPatches: isNew
                ? s.overlay.orderPatches
                : { ...s.overlay.orderPatches, [poId]: patch },
              removedAlertIds: [...s.overlay.removedAlertIds, `po-${poId}`],
            },
          }
        })
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

      // ── Logins ───────────────────────────────────────────────────────
      addUser: (person) => {
        set((s) => ({
          users: [...s.users, person],
          overlay: { ...s.overlay, newUsers: [...s.overlay.newUsers, person] },
        }))
        get().record({
          kind: 'login',
          action: 'login.created',
          summary: `Created a login for ${person.name}, ${ROLE_LABEL[person.role]}`,
          entityId: person.id,
          locationId: person.locationId,
          // The password is never written to the log, here or anywhere else.
          detail: 'Issued them a starting password',
        })
      },

      updateUser: (id, changes, opts) => {
        const before = get().users.find((u) => u.id === id)
        set((s) => {
          const isNew = s.overlay.newUsers.some((u) => u.id === id)
          return {
            users: s.users.map((u) => (u.id === id ? { ...u, ...changes } : u)),
            overlay: {
              ...s.overlay,
              // A login added here is stored whole; a seeded one only as a patch.
              newUsers: isNew
                ? s.overlay.newUsers.map((u) => (u.id === id ? { ...u, ...changes } : u))
                : s.overlay.newUsers,
              userPatches: isNew
                ? s.overlay.userPatches
                : { ...s.overlay.userPatches, [id]: { ...s.overlay.userPatches[id], ...changes } },
            },
          }
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

      setPassword: ({ actor, targetId, password }) => {
        const state = get()
        const target = state.users.find((u) => u.id === targetId)
        if (!target) return { ok: false, error: 'That login no longer exists.' }
        if (!canResetPasswordOf(actor, target)) {
          return {
            ok: false,
            error:
              actor.id === target.id
                ? 'Your role cannot change its own password. Ask a senior for a new one.'
                : `You cannot set the password for ${target.name}.`,
          }
        }
        const check = checkPassword(password, target)
        if (!check.ok) return { ok: false, error: check.error }

        get().updateUser(
          targetId,
          {
            password,
            // The old one joins the history so it can never be reused.
            passwordHistory: [...target.passwordHistory, target.password],
            passwordSetAt: new Date().toISOString(),
            passwordSetBy: actor.name,
          },
          { silent: true },
        )
        get().record({
          kind: 'password',
          action: actor.id === targetId ? 'password.changed' : 'password.reset',
          summary:
            actor.id === targetId
              ? 'Changed their own password'
              : `Reset the password for ${target.name}, ${ROLE_LABEL[target.role]}`,
          entityId: targetId,
          // Never the password itself. A log of passwords would be worse than
          // no log at all.
          actor: { id: actor.id, name: actor.name, role: actor.role },
        })
        return { ok: true }
      },

      revealPassword: ({ actor, targetId }) => {
        const target = get().users.find((u) => u.id === targetId)
        if (!target) return { ok: false, error: 'That login no longer exists.' }
        if (!canSeePasswordOf(actor, target)) {
          return { ok: false, error: `You cannot see the password for ${target.name}.` }
        }
        get().record({
          kind: 'password',
          action: 'password.revealed',
          summary:
            actor.id === targetId
              ? 'Looked at their own password'
              : `Looked at the password for ${target.name}, ${ROLE_LABEL[target.role]}`,
          entityId: targetId,
          actor: { id: actor.id, name: actor.name, role: actor.role },
        })
        return { ok: true, password: target.password }
      },

      // ── Promotions ───────────────────────────────────────────────────
      addPromotion: (promotion) => {
        set((s) => ({
          promotions: [promotion, ...s.promotions],
          overlay: { ...s.overlay, newPromotions: [promotion, ...s.overlay.newPromotions] },
        }))
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
        set((s) => {
          const isNew = s.overlay.newPromotions.some((p) => p.id === id)
          return {
            promotions: s.promotions.map((p) => (p.id === id ? { ...p, ...changes } : p)),
            overlay: isNew
              ? {
                  ...s.overlay,
                  newPromotions: s.overlay.newPromotions.map((p) =>
                    p.id === id ? { ...p, ...changes } : p,
                  ),
                }
              : {
                  ...s.overlay,
                  promotionPatches: {
                    ...s.overlay.promotionPatches,
                    [id]: { ...s.overlay.promotionPatches[id], ...changes },
                  },
                },
          }
        })
        if (!before) return
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
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
          overlay: { ...s.overlay, readAlertIds: [...s.overlay.readAlertIds, id] },
        }))
        get().record({
          kind: 'alert',
          action: 'alert.read',
          summary: `Read the alert: ${alert.message}`,
          entityId: id,
          locationId: alert.locationId,
        })
      },

      markAllAlertsRead: () => {
        const unread = get().alerts.filter((a) => !a.read).length
        set((s) => ({
          alerts: s.alerts.map((a) => ({ ...a, read: true })),
          overlay: { ...s.overlay, readAlertIds: s.alerts.map((a) => a.id) },
        }))
        if (unread === 0) return
        get().record({
          kind: 'alert',
          action: 'alert.read_all',
          summary: `Cleared ${unread} ${unread === 1 ? 'alert' : 'alerts'}`,
        })
      },

      setTarget: (locationId, month, amountMYR) => {
        const before = get().targets.find(
          (t) => t.locationId === locationId && t.month === month,
        )
        set((s) => {
          const target: Target = { locationId, month, amountMYR }
          return {
            targets: [
              ...s.targets.filter((t) => !(t.locationId === locationId && t.month === month)),
              target,
            ],
            overlay: {
              ...s.overlay,
              changedTargets: [
                ...s.overlay.changedTargets.filter(
                  (t) => !(t.locationId === locationId && t.month === month),
                ),
                target,
              ],
            },
          }
        })
        get().record({
          kind: 'target',
          action: before ? 'target.changed' : 'target.set',
          summary: `Set the ${month} target for ${locationName(locationId)} to ${rm(amountMYR)}`,
          entityId: `${locationId}::${month}`,
          locationId,
          detail: before ? `Was ${rm(before.amountMYR)}` : undefined,
        })
      },

      dismissRecovery: () => set({ recoveredFromError: false }),

      resetDemo: () =>
        set({ ...seeded(), users: seedPeople, overlay: emptyOverlay(), recoveredFromError: false }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the overlay is written. The history is rebuilt from the seed.
      partialize: (s) => ({ overlay: s.overlay }) as unknown as DataState,
      merge: (persisted, current) => {
        const overlay = (persisted as { overlay?: Overlay } | undefined)?.overlay
        if (!overlay) return current
        try {
          return {
            ...current,
            ...applyOverlay(current, { ...emptyOverlay(), ...overlay }),
            overlay: { ...emptyOverlay(), ...overlay },
          }
        } catch {
          // A malformed overlay is discarded rather than breaking the session.
          return { ...current, recoveredFromError: true }
        }
      },
    },
  ),
)

export const useToday = () => useData((s) => s.today)
export const useAlerts = (): Alert[] => useData((s) => s.alerts)
