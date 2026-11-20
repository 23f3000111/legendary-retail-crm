import { describe, expect, it } from 'vitest'
import { selectArrivals, selectArrivalsForClosing, selectOnHandAtOrder } from './selectors'
import { isApproverNote } from '../lib/po-machine'
import type { Closing, CrmData, PoEvent, PurchaseOrder } from '../data/types'

/**
 * Revision 10, "Davy, Kelly & Chloe Page (Purchase Order)": "In PO page to be
 * approved, show the store on hand quantity for each SKU, on the day PO
 * placed." The meeting of 16 November: Kelly's notes in green, for the
 * warehouse to follow; nobody changes anybody's notes.
 */

const closing = (period: string, submittedAt: string, counts: Record<string, number>): Closing => ({
  id: `melaka-${period}`,
  locationId: 'melaka',
  channel: 'main',
  period,
  periodType: 'day',
  revenueMYR: 0,
  lines: [],
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: Object.entries(counts).map(([skuId, counted]) => ({ skuId, opening: counted, counted })),
  writeOffs: [],
  submittedBy: 'Khoo Kwok Tsu',
  submittedAt,
})

const order = (events: PoEvent[], createdAt = '2026-11-09T03:49:00.000Z'): PurchaseOrder => ({
  id: 'PO-261109-TEST',
  locationId: 'melaka',
  createdBy: 'Khoo Kwok Tsu',
  createdAt,
  priority: 'standard',
  notes: '',
  status: 'submitted',
  lines: [{ skuId: 'orchid-retail', qtyRequested: 24, qtyApproved: null, qtyShipped: null }],
  events,
})

const data = (closings: Closing[], po: PurchaseOrder): CrmData => ({
  today: '2026-11-10',
  closings,
  purchaseOrders: [po],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: {},
  partnerSales: [],
})

const eighth = closing('2026-11-08', '2026-11-08T22:05:00+08:00', { 'orchid-retail': 30 })
const ninth = closing('2026-11-09', '2026-11-09T22:00:00+08:00', { 'orchid-retail': 26 })
const sent = (at: string): PoEvent => ({ status: 'submitted', actor: 'Khoo Kwok Tsu', role: 'promoter', at })

describe('the store’s stock when the order was placed', () => {
  it('reads the last count filed before the order was sent', () => {
    // Sent at 11:49 on the 9th, Malaysian time: the 8th's count is the latest.
    const po = order([sent('2026-11-09T03:49:00.000Z')])
    const at = selectOnHandAtOrder(data([eighth, ninth], po), po)
    expect(at?.day).toBe('2026-11-08')
    expect(at?.counts.get('orchid-retail')).toBe(30)
  })

  it('reads the day’s own count when the order went with the closing', () => {
    // Sent at 22:10 on the 9th, after that day was filed at 22:00.
    const po = order([sent('2026-11-09T14:10:00.000Z')])
    expect(selectOnHandAtOrder(data([eighth, ninth], po), po)?.day).toBe('2026-11-09')
  })

  it('goes by when it was first sent, not when it was sent again', () => {
    const po = order([sent('2026-11-09T03:49:00.000Z'), sent('2026-11-10T03:00:00.000Z')])
    expect(selectOnHandAtOrder(data([eighth, ninth], po), po)?.day).toBe('2026-11-08')
  })

  it('takes a day before the order even when it was filed late, after the order', () => {
    const seventh = closing('2026-11-07', '2026-11-07T22:00:00+08:00', { 'orchid-retail': 34 })
    const eighthLate = closing('2026-11-08', '2026-11-10T09:00:00+08:00', { 'orchid-retail': 31 })
    const po = order([sent('2026-11-09T03:49:00.000Z')])
    const at = selectOnHandAtOrder(data([seventh, eighthLate], po), po)
    expect(at?.day).toBe('2026-11-08')
    expect(at?.counts.get('orchid-retail')).toBe(31)
  })

  it('has nothing to show for a store that has never filed', () => {
    const po = order([sent('2026-11-09T03:49:00.000Z')])
    expect(selectOnHandAtOrder(data([], po), po)).toBeNull()
  })
})

describe('whose notes the warehouse follows', () => {
  const note = (role: PoEvent['role']): PoEvent => ({ status: 'approved', actor: 'x', role, at: 'x', note: 'n' })

  it('is the approvers’: Kelly’s, and Davy’s', () => {
    expect(isApproverNote(note('ops'))).toBe(true)
    expect(isApproverNote(note('md'))).toBe(true)
    for (const role of ['promoter', 'warehouse', 'finance', 'pa'] as const) expect(isApproverNote(note(role))).toBe(false)
    // A step with nothing written is no note at all.
    expect(isApproverNote({ ...note('ops'), note: undefined })).toBe(false)
  })
})

describe('what arrived at a store between two counts', () => {
  const received = (id: string, at: string, qty: number): PurchaseOrder => ({
    ...order([sent('2026-11-05T03:00:00.000Z')]),
    id,
    status: 'received',
    lines: [{ skuId: 'dream-vial', qtyRequested: qty, qtyApproved: qty, qtyShipped: qty }],
    events: [sent('2026-11-05T03:00:00.000Z'), { status: 'received', actor: 'x', role: 'promoter', at }],
  })

  it('counts what the store confirmed receiving after the one count, up to the day of the next', () => {
    const d: CrmData = {
      ...data([eighth], order([sent('2026-11-09T03:49:00.000Z')])),
      purchaseOrders: [
        received('PO-A', '2026-11-08T05:00:00.000Z', 6), // the 8th: in the 8th's own count already
        received('PO-B', '2026-11-09T05:00:00.000Z', 24), // the 9th: after it
        received('PO-C', '2026-11-11T05:00:00.000Z', 12), // after the day being closed
      ],
    }
    expect(selectArrivals(d, 'melaka', '2026-11-08', '2026-11-09').get('dream-vial')).toBe(24)
    // Never counted before: everything up to the day.
    expect(selectArrivals(d, 'melaka', undefined, '2026-11-09').get('dream-vial')).toBe(30)
    // The closing of the 9th: since the store's last count before it, the 8th's.
    expect(selectArrivalsForClosing(d, 'melaka', '2026-11-09').get('dream-vial')).toBe(24)
  })

  // The client, 20 November: "After promoter receive stock for PO, the
  // received quantity automatically adds into the closing quantity."
  it('takes in a delivery confirmed the same day as the last count, after that count was filed', () => {
    // The 8th was filed at 22:05. One order came at 13:00 that day, before the
    // count, so it is in it; another was confirmed at 23:00, after it.
    const d: CrmData = {
      ...data([eighth], order([sent('2026-11-09T03:49:00.000Z')])),
      purchaseOrders: [received('PO-A', '2026-11-08T05:00:00.000Z', 6), received('PO-D', '2026-11-08T15:00:00.000Z', 12)],
    }
    expect(selectArrivalsForClosing(d, 'melaka', '2026-11-09').get('dream-vial')).toBe(12)
  })

  it('takes in nothing confirmed after a filed day was closed, when that day is opened again', () => {
    // The 9th was filed at 22:00; an order confirmed at 23:00 that night
    // belongs to the 10th's count, not to a change to the 9th's.
    const d: CrmData = {
      ...data([eighth, ninth], order([sent('2026-11-09T03:49:00.000Z')])),
      purchaseOrders: [received('PO-B', '2026-11-09T05:00:00.000Z', 24), received('PO-E', '2026-11-09T15:00:00.000Z', 6)],
    }
    expect(selectArrivalsForClosing(d, 'melaka', '2026-11-09', ninth.submittedAt).get('dream-vial')).toBe(24)
    expect(selectArrivalsForClosing(d, 'melaka', '2026-11-10').get('dream-vial')).toBe(6)
  })
})
