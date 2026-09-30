/**
 * Who may change a record once it is in, and how.
 *
 * The client's ask of 29 September: anything put into the CRM can be changed,
 * and changing it must not mean typing it all in again. So every record opens
 * the way it was entered, filled in with what is on record, and the person
 * changes only what is wrong.
 *
 * The one control kept is the client's own from the start (Q19): a closing
 * from an earlier day is changed by asking Kelly or Davy, and only for three
 * days. Today's belongs to the store until midnight — they could always file
 * it again; now they edit it instead. Kelly and Davy change any closing
 * directly, since they are the ones who would approve it.
 *
 * These rules are checked by the screens, by the store, and again by the
 * server: `closingWriteRefusal` below is the local backend's twin of
 * `_closing_refusal` in `0001_init.sql`.
 */
import { can, type Person, type Role } from '../data/people'
import { daysBetween } from './dates'
import type { Closing, DateStr, PurchaseOrder, SaleLine } from '../data/types'

/** Corrections are allowed for three days after the period (Q19). */
export const CORRECTION_WINDOW_DAYS = 3

/**
 * How a person may change a filed closing:
 *
 *   direct   saved at once — the store on the day itself, Kelly or Davy any day
 *   request  sent to Kelly or Davy, who approve it — the store, days 1 to 3
 *   locked   too old for the store to ask; Kelly or Davy can still change it
 *   none     not theirs to change
 */
export type ClosingEditMode = 'direct' | 'request' | 'locked' | 'none'

export function closingEditMode(
  person: Pick<Person, 'role'>,
  sessionLocationId: string | undefined,
  closing: Pick<Closing, 'locationId' | 'period'>,
  today: DateStr,
): ClosingEditMode {
  if (can(person.role).approveCorrections) return 'direct'
  if (person.role !== 'promoter' || sessionLocationId !== closing.locationId) return 'none'
  if (closing.period >= today) return 'direct'
  return daysBetween(closing.period, today) <= CORRECTION_WINDOW_DAYS ? 'request' : 'locked'
}

/**
 * How a person may change an order:
 *
 *   edit    change its lines and note — while it waits for Kelly, by the store
 *           that asked or by whoever approves
 *   resend  change it and send it again — the store, after Kelly said no
 *   none    it has moved on; the warehouse is working from it
 */
export type OrderEditMode = 'edit' | 'resend' | 'none'

export function orderEditMode(
  person: Pick<Person, 'role'>,
  sessionLocationId: string | undefined,
  po: Pick<PurchaseOrder, 'status' | 'locationId'>,
): OrderEditMode {
  if (!can(person.role).canEdit) return 'none'
  const ownStore = person.role === 'promoter' && sessionLocationId === po.locationId
  if (po.status === 'submitted') {
    return ownStore || can(person.role).approvePurchaseOrders ? 'edit' : 'none'
  }
  if (po.status === 'rejected' && ownStore) return 'resend'
  return 'none'
}

/**
 * Whether a sale can still be changed from the counter: it was rung up today,
 * or on a day that has not been closed yet. Once a day is closed and gone, its
 * sales are changed through its closing, where Kelly sees the change.
 */
export const saleEditable = (line: Pick<SaleLine, 'day'>, today: DateStr, dayIsFiled: boolean): boolean =>
  Boolean(line.day) && (line.day === today || !dayIsFiled)

// ── The server's rule, for the local backend ──────────────────────────────

/** JSON with its keys in order, so two documents compare by content alone. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

/** Two documents that say the same thing, whatever order their fields arrived in. */
export const sameContent = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

const withoutCorrection = (doc: unknown): unknown => {
  if (!doc || typeof doc !== 'object') return doc
  const { correction, ...rest } = doc as Record<string, unknown>
  void correction
  return rest
}

const correctionOf = (doc: unknown): { status?: string } | undefined =>
  (doc as { correction?: { status?: string } | null } | null)?.correction ?? undefined

const statusOf = (doc: unknown): string | undefined => correctionOf(doc)?.status

/**
 * What the server says to a closing being written. Mirrors `_closing_refusal`
 * in `0001_init.sql`; keep the two in step.
 *
 *  · Deciding a correction is Kelly's or Davy's, whoever sends the document.
 *  · A store may change today's closing outright. An earlier day's it may only
 *    ask about: everything but the correction must stay as it is, and the
 *    request must be pending and inside the window. A store may take back its
 *    own pending request, but not touch a decided one.
 */
export function closingWriteRefusal(
  role: Role,
  before: { day?: string | null; doc: unknown; deleted?: boolean } | undefined,
  next: unknown,
  today: DateStr,
): string | null {
  if (!before || before.deleted) return null
  const was = statusOf(before.doc)
  const now = statusOf(next)
  if ((now === 'approved' || now === 'rejected') && now !== was && role !== 'md' && role !== 'ops') {
    return 'Only Kelly or Davy can approve a correction.'
  }
  if (role !== 'promoter' || !before.day || before.day >= today) return null
  if (!sameContent(withoutCorrection(next), withoutCorrection(before.doc))) {
    return 'A day that has passed is changed by asking Kelly, not directly.'
  }
  const sent = correctionOf(next)
  if (!sent) {
    return correctionOf(before.doc) && was !== 'pending'
      ? 'Only Kelly or Davy can undo a decided correction.'
      : null
  }
  if (now !== 'pending') {
    return sameContent(sent, correctionOf(before.doc))
      ? null
      : 'Only Kelly or Davy can approve a correction.'
  }
  if (daysBetween(before.day, today) > CORRECTION_WINDOW_DAYS) {
    return `Corrections are only allowed for ${CORRECTION_WINDOW_DAYS} days. Ask Kelly to change it.`
  }
  return null
}
