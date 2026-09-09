import type { Role } from '../data/people'

/**
 * The activity log.
 *
 * Every action that changes anything is written down: what happened, who did
 * it, and when. Q67 said the accounting side would handle the audit trail, but
 * the client has since asked for it here, and they are right to — a system that
 * three people can edit needs to be able to answer "who changed this, and when"
 * without anyone having to remember.
 *
 * Two rules keep the log worth reading:
 *
 *   1. **Summaries are written for a person, not for a machine.** "Kelly Tew
 *      approved PO-2026-0131 for Pavilion KL" — not `UPDATE purchase_orders SET
 *      status='approved'`. The row is evidence, and evidence nobody can read is
 *      not evidence.
 *   2. **Reads are not logged.** Opening a screen is not an action. Nothing in
 *      the system can read a credential back any more — passwords are hashed —
 *      so what gets recorded is who *reset* whose, and when.
 */

export type AuditKind =
  | 'session'
  | 'sale'
  | 'closing'
  | 'correction'
  | 'order'
  | 'login'
  | 'password'
  | 'promotion'
  | 'target'
  | 'alert'

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  session: 'Sign in',
  sale: 'Sales',
  closing: 'Closings',
  correction: 'Corrections',
  order: 'Orders',
  login: 'Logins',
  password: 'Passwords',
  promotion: 'Promotions',
  target: 'Targets',
  alert: 'Alerts',
}

export type AuditTone = 'neutral' | 'active' | 'good' | 'warn' | 'critical'

/**
 * How loudly a row reads. PINs and corrections are the two categories somebody
 * would come looking for, so they carry weight; alerts and sign-ins are the
 * background hum.
 */
export const AUDIT_KIND_TONE: Record<AuditKind, AuditTone> = {
  session: 'neutral',
  sale: 'neutral',
  closing: 'active',
  correction: 'warn',
  order: 'active',
  login: 'warn',
  password: 'critical',
  promotion: 'good',
  target: 'good',
  alert: 'neutral',
}

export interface AuditEntry {
  id: string
  /** ISO timestamp. */
  at: string
  actorId: string
  actorName: string
  actorRole: Role
  kind: AuditKind
  /** Machine-readable slug, e.g. `order.approved`. Stable; safe to filter on. */
  action: string
  /** One line, in plain English, already written for a reader. */
  summary: string
  /** What it happened to — an order id, a login id, a closing id. */
  entityId?: string
  /** Which store it concerns, where that makes sense. */
  locationId?: string
  /** What changed, when a before-and-after is worth keeping. */
  detail?: string
}

/**
 * Who is doing it.
 *
 * Held in a plain module rather than in either store, so `useData` can write an
 * entry without importing `useAuth` and `useAuth` can set it without importing
 * back — no cycle, and no second copy of the session to keep in step.
 *
 * On the server this is the JWT claim; here it is the same idea with less
 * ceremony.
 */
let actorId: string | null = null

export const setAuditActor = (id: string | null) => {
  actorId = id
}

export const getAuditActor = (): string | null => actorId

let counter = 0

/** Ids are unique within a session and sort with the timestamp. */
export const auditId = (at: string): string => `au-${at}-${(counter += 1).toString(36)}`

export const newestFirst = (a: AuditEntry, b: AuditEntry): number => (a.at < b.at ? 1 : -1)
