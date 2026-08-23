/**
 * The purchase-order lifecycle, in one place.
 *
 * The client confirmed the chain as demonstrated (Q45): the shop asks, head
 * office approves, accounts checks, the warehouse sends, the shop confirms
 * arrival. Kelly approves every order (Q46); when she is away Davy carries the
 * same authority.
 *
 * Note on Q48: the discovery form said Finance shares the authorisation. The
 * hierarchy chart does not — it gives "approves changes and PO" to the
 * Managing Director and the Operational Manager only. The chart wins, and
 * Finance instead *clears* an approved order for picking, which is a step in
 * the chain rather than an approval. This is flagged in
 * `docs/spec/2026-08-21-answers-to-decisions.md` for the client to confirm.
 *
 * Screens never assign `status` directly — they ask for a transition and this
 * module decides whether it is legal and who may make it.
 */
import type { PoStatus, PurchaseOrder } from '../data/types'
import type { Role } from '../data/people'

interface Transition {
  to: PoStatus
  /** Roles permitted to make this move. */
  by: Role[]
  /** Button copy, in the actor's own language. */
  label: string
  /** Rejections must say why. */
  requiresNote?: boolean
}

export const TRANSITIONS: Record<PoStatus, Transition[]> = {
  draft: [{ to: 'submitted', by: ['promoter'], label: 'Send to HQ' }],
  submitted: [
    { to: 'approved', by: ['ops', 'md'], label: 'Approve order' },
    { to: 'rejected', by: ['ops', 'md'], label: 'Reject', requiresNote: true },
  ],
  approved: [{ to: 'accounts_cleared', by: ['finance'], label: 'Clear for picking' }],
  accounts_cleared: [{ to: 'packed', by: ['warehouse'], label: 'Mark packed' }],
  packed: [{ to: 'in_transit', by: ['warehouse'], label: 'Dispatch' }],
  in_transit: [{ to: 'received', by: ['promoter', 'ops'], label: 'Confirm received' }],
  received: [],
  rejected: [],
}

/** Display order for the timeline. `rejected` sits outside the chain. */
export const STATUS_CHAIN: PoStatus[] = [
  'draft',
  'submitted',
  'approved',
  'accounts_cleared',
  'packed',
  'in_transit',
  'received',
]

export const STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  accounts_cleared: 'Cleared by Finance',
  packed: 'Packed',
  in_transit: 'On its way',
  received: 'Received at store',
}

/** Who is holding the order right now — drives the "waiting on" chip. */
export const STATUS_OWNER: Record<PoStatus, string> = {
  draft: 'Store',
  submitted: 'Kelly Tew',
  approved: 'Finance',
  rejected: '—',
  accounts_cleared: 'Warehouse',
  packed: 'Warehouse',
  in_transit: 'Store',
  received: '—',
}

export type StatusTone = 'neutral' | 'active' | 'good' | 'warn' | 'critical'

export const STATUS_TONE: Record<PoStatus, StatusTone> = {
  draft: 'neutral',
  submitted: 'warn',
  approved: 'active',
  rejected: 'critical',
  accounts_cleared: 'active',
  packed: 'active',
  in_transit: 'active',
  received: 'good',
}

export const canTransition = (from: PoStatus, to: PoStatus, role: Role): boolean =>
  TRANSITIONS[from].some((t) => t.to === to && t.by.includes(role))

/** The moves this role may make on this order, for rendering action buttons. */
export const availableTransitions = (po: PurchaseOrder, role: Role): Transition[] =>
  TRANSITIONS[po.status].filter((t) => t.by.includes(role))

export const isOpen = (po: PurchaseOrder): boolean =>
  po.status !== 'received' && po.status !== 'rejected'

/** How far along the chain, 0–1, for progress rails. Rejected orders stop dead. */
export const chainProgress = (status: PoStatus): number => {
  if (status === 'rejected') return 0
  const i = STATUS_CHAIN.indexOf(status)
  return i < 0 ? 0 : i / (STATUS_CHAIN.length - 1)
}

/** Units the store will actually receive: shipped, then approved, else requested. */
export const effectiveQty = (line: {
  qtyRequested: number
  qtyApproved: number | null
  qtyShipped: number | null
}): number => line.qtyShipped ?? line.qtyApproved ?? line.qtyRequested

/**
 * A trimmed line. There are no back-orders — a short delivery means the store
 * raises a fresh request (Q52) — so this is shown as information, not as a
 * remainder still owed.
 */
export const isPartial = (po: PurchaseOrder): boolean =>
  po.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested)
