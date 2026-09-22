import type { Role } from '../data/people'
import { shortCode } from './ids'
import { getSession } from './session'

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

/**
 * Every action the system records, and what it is called on screen.
 *
 * The slug is what filters and exports use and never changes; the label is
 * what a person reads. Anything not listed still shows — the slug is used as
 * the label — so a new action is never invisible, but it should be added here
 * the moment it exists.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'sale.recorded': 'Sale recorded',
  'sale.removed': 'Sale taken back',
  'closing.filed': 'Day closed',
  'correction.requested': 'Correction asked for',
  'correction.approved': 'Correction approved',
  'correction.rejected': 'Correction rejected',
  'order.raised': 'Order raised',
  'order.submitted': 'Order sent to HQ',
  'order.approved': 'Order approved',
  'order.rejected': 'Order rejected',
  'order.accounts_cleared': 'Order cleared by Finance',
  'order.packed': 'Order packed',
  'order.in_transit': 'Order dispatched',
  'order.received': 'Order received at the store',
  'login.created': 'Login created',
  'login.updated': 'Login edited',
  'login.enabled': 'Login enabled',
  'login.disabled': 'Login disabled',
  'password.changed': 'Password changed by its owner',
  'password.reset': 'Password reset for somebody',
  'password.revealed': 'Password looked at',
  'promotion.recorded': 'Promotion recorded',
  'promotion.updated': 'Promotion edited',
  'promotion.it_informed': 'IT told about a promotion',
  'target.set': 'Target set',
  'target.changed': 'Target changed',
  'alert.read': 'Alert read',
  'alert.read_all': 'Alerts cleared',
  'session.signed_in': 'Signed in',
  'session.signed_out': 'Signed out',
  'session.sign_in_failed': 'Sign-in refused',
  'session.code_sent': 'Sign-in code sent',
  'session.store_chosen': 'Outlet chosen for the day',
  'data.cleared': 'Everything cleared',
}

export const actionLabel = (action: string): string => AUDIT_ACTION_LABEL[action] ?? action

/** Which actions belong to a category, for the action picker. */
export const actionsOfKind = (kind: AuditKind): string[] =>
  Object.keys(AUDIT_ACTION_LABEL).filter((a) => a.split('.')[0] === KIND_PREFIX[kind])

/** The slug prefix each category's actions use. */
const KIND_PREFIX: Record<AuditKind, string> = {
  session: 'session',
  sale: 'sale',
  closing: 'closing',
  correction: 'correction',
  order: 'order',
  login: 'login',
  password: 'password',
  promotion: 'promotion',
  target: 'target',
  alert: 'alert',
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

/** Who is doing it: the person behind the current session. */
export const getAuditActor = (): string | null => getSession()?.personId ?? null

/** Ids sort with the timestamp and are unique across every device. */
export const auditId = (at: string): string => `au-${at}-${shortCode(6)}`

export const newestFirst = (a: AuditEntry, b: AuditEntry): number => (a.at < b.at ? 1 : -1)
