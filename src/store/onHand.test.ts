import { describe, expect, it } from 'vitest'
import { selectArrivals, selectArrivalsForClosing, selectOnHandAtOrder, selectSoldSinceCount, selectSuggestedPoLines, selectWorkedOut } from './selectors'
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

// The client's Revision #9, 25 November. What arrives is added to the count;
// what sold since has to come off it too, the days nobody closed included.
describe('what sold since the last count, on days that were never closed', () => {
  const line = (skuId: string, qty: number) => ({ skuId, qty })
  const unfiled = {
    '2026-11-07': [line('orchid-retail', 9)], // before the last count: in it already
    '2026-11-09': [line('orchid-retail', 2), line('man-retail', 1)],
    '2026-11-10': [line('orchid-retail', 3)],
  }

  it('adds up those days, not the ones before the count, the day itself or after it', () => {
    const sold = selectSoldSinceCount(data([eighth], order([sent('2026-11-09T03:49:00.000Z')])), unfiled, 'melaka', '2026-11-10')
    expect([...sold.entries()]).toEqual([
      ['orchid-retail', 2],
      ['man-retail', 1],
    ])
  })

  it('takes in every earlier day for a store that has never counted', () => {
    const sold = selectSoldSinceCount(data([], order([sent('2026-11-09T03:49:00.000Z')])), unfiled, 'melaka', '2026-11-11')
    expect(sold.get('orchid-retail')).toBe(14)
  })

  it('is nothing where every day was closed', () => {
    expect(selectSoldSinceCount(data([eighth], order([sent('2026-11-09T03:49:00.000Z')])), undefined, 'melaka', '2026-11-10').size).toBe(0)
  })
})

// On the same page, Ask HQ for stock asked again for what had just arrived:
// it was no longer on its way, and not yet counted.
describe('what is suggested after a delivery', () => {
  const low = closing('2026-11-09', '2026-11-09T22:00:00+08:00', { 'orchid-retail': 3 })
  const arrived = (qty: number): PurchaseOrder => ({
    ...order([sent('2026-11-07T03:00:00.000Z')]),
    status: 'received',
    lines: [{ skuId: 'orchid-retail', qtyRequested: qty, qtyApproved: qty, qtyShipped: qty }],
    events: [sent('2026-11-07T03:00:00.000Z'), { status: 'received', actor: 'x', role: 'promoter', at: '2026-11-10T04:00:00.000Z' }],
  })
  const suggested = (po: PurchaseOrder) =>
    selectSuggestedPoLines(data([low], po), 'melaka').find((l) => l.skuId === 'orchid-retail')?.qtyRequested

  it('asks for a low product, as it did', () => {
    expect(suggested(order([sent('2026-11-09T03:49:00.000Z')]))).toBe(48)
  })

  it('does not ask again for what was received since the last count', () => {
    expect(suggested(arrived(48))).toBeUndefined()
  })

  it('asks only for what is still short when less came', () => {
    expect(suggested(arrived(12))).toBe(36)
  })
})

// 28 November: KLIA T2's last count put every product at 0, so every screen
// said "not counted" while its own movements showed 120 Orchid in and 108
// out. With no count to go by, the shelf is what the record works out: the
// last real count, or nothing, plus what came in, less what went out — never
// below 0, as a sale with nothing on record came from stock nobody recorded.
describe('the shelf worked out from the record', () => {
  const klia = (period: string, submittedAt: string, counts: Record<string, number>, sold: Record<string, number> = {}): Closing => ({
    ...closing(period, submittedAt, counts),
    id: `klia-t2-${period}`,
    locationId: 'klia-t2',
    lines: Object.entries(sold).map(([skuId, qty]) => ({ skuId, qty })),
  })
  const delivered = (at: string, lines: Record<string, number>): PurchaseOrder => ({
    ...order([sent('2026-11-01T03:00:00.000Z')]),
    id: `PO-${at}`,
    locationId: 'klia-t2',
    status: 'received',
    lines: Object.entries(lines).map(([skuId, qty]) => ({ skuId, qtyRequested: qty, qtyApproved: qty, qtyShipped: qty })),
    events: [{ status: 'received', actor: 'x', role: 'promoter', at }],
  })
  const zero = { 'orchid-retail': 0, 'violet-retail': 0, 'orchid-vial': 0 }
  const kliaData = (closings: Closing[], pos: PurchaseOrder[]): CrmData => ({ ...data(closings, pos[0] ?? order([])), purchaseOrders: pos })

  it('takes what came in, less what sold after it, from nothing where nothing was ever counted', () => {
    const d = kliaData(
      [
        klia('2026-11-11', '2026-11-11T15:00:00.000Z', zero, { 'orchid-retail': 4 }),
        // Sold during the day, then the delivery came in at 20:23.
        klia('2026-11-12', '2026-11-12T15:00:00.000Z', zero, { 'orchid-retail': 5, 'orchid-vial': 2 }),
        klia('2026-11-13', '2026-11-13T15:00:00.000Z', zero, { 'orchid-retail': 3, 'violet-retail': 1 }),
      ],
      [delivered('2026-11-12T12:23:37.014Z', { 'orchid-retail': 120, 'violet-retail': 60 })],
    )
    const shelf = selectWorkedOut(d, d.closings[2])
    expect(shelf.get('orchid-retail')).toBe(117)
    expect(shelf.get('violet-retail')).toBe(59)
    // Never delivered, yet sold: from stock nobody recorded. Never below 0.
    expect(shelf.get('orchid-vial')).toBe(0)
    expect(selectWorkedOut(d, d.closings[1]).get('orchid-retail')).toBe(120)
  })

  it('starts from the last real count, and takes in what came after it and the days nobody closed', () => {
    const d: CrmData = {
      ...kliaData(
        [
          klia('2026-11-08', '2026-11-08T14:00:00.000Z', { 'orchid-retail': 30, 'violet-retail': 6, 'orchid-vial': 0 }),
          klia('2026-11-10', '2026-11-10T14:00:00.000Z', zero, { 'orchid-retail': 2 }),
        ],
        [delivered('2026-11-09T05:00:00.000Z', { 'orchid-retail': 12 })],
      ),
      unfiledLines: { 'klia-t2': { '2026-11-09': [{ skuId: 'violet-retail', qty: 10 }] } },
    }
    const shelf = selectWorkedOut(d, d.closings[1])
    expect(shelf.get('orchid-retail')).toBe(40)
    expect(shelf.get('violet-retail')).toBe(0)
  })

  // 28 November, on the live record: KLIA T2's delivery of 12 November had 24
  // testers in it, so its store page put ≈1,103 on the shelf against the Stock
  // page's ≈1,079, with six tester lines no count ever has (Revision 2).
  it('covers only what the count covers: a tester that came with the delivery is not on the shelf', () => {
    const d = kliaData(
      [klia('2026-11-13', '2026-11-13T15:00:00.000Z', zero, { 'orchid-retail': 3 })],
      [delivered('2026-11-12T12:23:37.014Z', { 'orchid-retail': 120, 'orchid-tester-30ml': 6 })],
    )
    const shelf = selectWorkedOut(d, d.closings[0])
    expect(shelf.get('orchid-retail')).toBe(117)
    expect(shelf.has('orchid-tester-30ml')).toBe(false)
    expect([...shelf.keys()].sort()).toEqual(Object.keys(zero).sort())
  })
})
