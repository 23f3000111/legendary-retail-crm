import type { Person, Role } from './people'
import type { Channel } from './locations'
import type { Promotion } from './promotions'
import type { AuditEntry } from '../lib/audit'
import type { MalaysiaSegment } from './countries'
import type { PriceTier } from './products'

/** `YYYY-MM-DD`. For monthly consignment periods this is the 1st of the month. */
export type DateStr = string

// ── What sold ──────────────────────────────────────────────────────────────

/**
 * One line of a period's sales.
 *
 * Main stores record the buyer's nationality against each line, because the
 * client needs to know exactly which country bought which perfume (Q29).
 * Dealers and consignment leave it undefined — they never capture it.
 */
export interface SaleLine {
  skuId: string
  qty: number
  countryCode?: string
  /**
   * Which price was charged for this line.
   *
   * Left undefined where nobody chose one — the seeded history, and the dealer
   * and consignment channels, which report a figure rather than ringing up a
   * sale. Those fall back to the location's own basis.
   */
  priceTier?: PriceTier
  /**
   * Malaysian customers only, and never guessed.
   *
   * The client wants the home market broken down further than a headcount —
   * Malaysia is where they sell most, so the mix inside it is worth more than
   * the count. Set only when `countryCode` is 'MY'.
   */
  segment?: MalaysiaSegment
}

/** Tonight's physical count. Every product, every night (Q20). */
export interface StockCount {
  skuId: string
  /** What was on the shelf at the last close. */
  opening: number
  /** What the promoter physically counted. */
  counted: number
}

export type WriteOffReason = 'tester' | 'damaged' | 'sample'

/** Recorded by the store, but only Kelly or Davy may approve it (Q25, Q43). */
export interface WriteOff {
  skuId: string
  qty: number
  reason: WriteOffReason
  note?: string
  approvedBy?: string
  approvedAt?: string
}

/** Cash, e-wallet and card — the only split the client wants (Q21). */
export interface Tender {
  cash: number
  ewallet: number
  card: number
}

/**
 * A correction filed within three days of the original, held until Kelly
 * approves it (Q19).
 */
export interface Correction {
  requestedBy: string
  requestedAt: string
  reason: string
  previousRevenueMYR: number
  approvedBy?: string
  approvedAt?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface Closing {
  id: string
  locationId: string
  channel: Channel
  /** The trading day, or the first of the month for consignment. */
  period: DateStr
  periodType: 'day' | 'month'
  /** Legendary's revenue, excluding SST (Q24). */
  revenueMYR: number
  /** Daily channels only. Consignment reports a monthly figure with no split. */
  tender?: Tender
  lines: SaleLine[]
  /** Staff purchases and staff discounts, kept apart from normal trade (Q23). */
  staffSales: { qty: number; revenueMYR: number }
  /** Main stores and dealers count stock; consignment does not. */
  stockCount: StockCount[]
  writeOffs: WriteOff[]
  submittedBy: string
  submittedAt: string
  correction?: Correction
}

// ── Purchase orders ────────────────────────────────────────────────────────
//
// Kelly approves every order (Q46). There are no supplier orders (Q49) and no
// back-orders — a short delivery means the shop asks again (Q52). The printed
// order form comes out of SQL Accounting, not from here (Q51).

export const PO_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'accounts_cleared',
  'packed',
  'in_transit',
  'received',
] as const

export type PoStatus = (typeof PO_STATUSES)[number]

export interface PoLine {
  skuId: string
  qtyRequested: number
  /** Set on approval; may be trimmed. */
  qtyApproved: number | null
  /** Set by the warehouse at pack time. */
  qtyShipped: number | null
}

export interface PoEvent {
  status: PoStatus
  actor: string
  role: Role
  at: string
  note?: string
}

export interface PurchaseOrder {
  id: string
  locationId: string
  createdBy: string
  createdAt: string
  priority: 'standard' | 'urgent'
  notes: string
  status: PoStatus
  lines: PoLine[]
  events: PoEvent[]
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export type AlertType =
  | 'missed_closing'
  | 'low_stock'
  | 'correction_pending'
  | 'po_waiting'
  | 'target_risk'

export interface Alert {
  id: string
  type: AlertType
  severity: 'warn' | 'serious' | 'critical'
  locationId: string
  skuId?: string
  poId?: string
  message: string
  at: string
  read: boolean
}

// ── Targets ────────────────────────────────────────────────────────────────

/** Set by Davy (Q68). History of changes is out of scope for now (Q69). */
export interface Target {
  locationId: string
  month: string
  amountMYR: number
}

// ── Store shape ────────────────────────────────────────────────────────────

export interface CrmData {
  /** The demo's fixed "today", so seeded history always lines up. */
  today: DateStr
  closings: Closing[]
  purchaseOrders: PurchaseOrder[]
  alerts: Alert[]
  targets: Target[]
  /** Campaigns Davy planned and Chloe recorded (Q59). */
  promotions: Promotion[]
  /** Every action anyone has taken, newest first. */
  audit: AuditEntry[]
  /**
   * Sales entered at the counter through the day, before the close is filed.
   * Main-store promoters record each sale as it happens — product, quantity and
   * the customer's country — so the 11pm close is a confirmation rather than an
   * hour of recall.
   */
  liveLines: Record<string, SaleLine[]>
  /** Everyone who can sign in. Managed from the Logins screen. */
  users: Person[]
}
