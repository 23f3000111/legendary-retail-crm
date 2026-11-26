import { afterEach, describe, expect, it } from 'vitest'
import { filedDayRows, offTheShelf, partnersIn, selectPartnerMonths, selectStoreDay, storeDayRows } from './selectors'
import { applyCatalogue, countedSkus } from '../data/products'
import type { Closing, CrmData, PurchaseOrder, SaleLine } from '../data/types'

/**
 * Revision 10, Finance's store page: "the On Hand quantity, show the closing
 * quantity on the particular date (eg: I click on 10th October, it shows 10th
 * October sales, and 10th October closing on hand quantity)", "need to show on
 * the date how much of the sales is paid by card and cash", and the meeting of
 * 16 November: Days left and Status go, Deducted is what that day took off.
 */

afterEach(() => applyCatalogue([]))

const sale = (skuId: string, qty: number, unit: number, saleId: string, countryCode: string, tier: SaleLine['priceTier'] = 'promotion'): SaleLine => ({
  skuId,
  qty,
  unitPriceMYR: unit,
  priceTier: tier,
  saleId,
  countryCode,
})

const filedDay = '2026-11-02'
const today = '2026-11-03'
const closing: Closing = {
  id: `bsas-${filedDay}`,
  locationId: 'bsas',
  channel: 'main',
  period: filedDay,
  periodType: 'day',
  revenueMYR: 762,
  tender: { cash: 300, ewallet: 0, card: 462 },
  lines: [
    sale('orchid-retail', 2, 188, 'a', 'CN'),
    sale('orchid-retail', 1, 198, 'b', 'MY', 'promotion2'),
    sale('man-retail', 1, 188, 'b', 'MY'),
    sale('wish-3-set', 1, 0, 'c', 'CN', 'foc'),
  ],
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: [
    { skuId: 'orchid-retail', opening: 23, counted: 20 },
    { skuId: 'man-retail', opening: 7, counted: 5 },
    { skuId: 'wish-3-set', opening: 9, counted: 8 },
  ],
  writeOffs: [{ skuId: 'man-retail', qty: 1, reason: 'tester' }],
  submittedBy: 'Lee Kwan Sern',
  submittedAt: `${filedDay}T22:05:00+08:00`,
}
const dealer = partnersIn('dealer')[0].id
const data: CrmData = {
  today,
  closings: [closing],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: { bsas: [sale('violet-retail', 1, 188, 'z', 'SG'), sale('orchid-retail', 1, 188, 'z', 'SG')] },
  partnerSales: [{ locationId: dealer, month: '2026-10', revenueMYR: 1000, enteredBy: 'Kelly Tew', enteredAt: 'x' }],
}
const row = (d: ReturnType<typeof selectStoreDay>, skuId: string) => d.rows.find((r) => r.skuId === skuId)!

describe("a store's day", () => {
  it('gives that day’s sales, what it took off the shelf, and the count at its close', () => {
    const d = selectStoreDay(data, 'bsas', filedDay)
    expect(d).toMatchObject({ day: filedDay, live: false, revenue: 762, units: 5, customers: 3 })
    expect(d.closing?.id).toBe(closing.id)
    const orchid = row(d, 'orchid-retail')
    expect(orchid).toMatchObject({ units: 3, revenue: 574, deducted: 3, onHand: 20 })
    // Every price it went at that day, most units first.
    expect(orchid.prices.map((p) => [p.unitPrice, p.qty])).toEqual([
      [188, 2],
      [198, 1],
    ])
    // Deducted is sold and written off: a tester used up leaves the shelf too.
    expect(row(d, 'man-retail')).toMatchObject({ units: 1, deducted: 2, onHand: 5 })
    expect(row(d, 'wish-3-set').prices[0].tier).toBe('foc')
  })

  it('lists every product on the shelf in the range order, the unsold ones at their usual price', () => {
    const d = selectStoreDay(data, 'bsas', filedDay)
    expect(d.rows.map((r) => r.skuId)).toEqual(countedSkus.map((s) => s.id))
    const violet = row(d, 'violet-retail')
    expect(violet).toMatchObject({ units: 0, revenue: 0, deducted: 0, onHand: null })
    // BSAS is counted on the retail price, so that is its usual one.
    expect(violet.prices).toEqual([{ unitPrice: 238, tier: 'retail', qty: 0 }])
  })

  it('says how it was paid, as filed', () => {
    expect(selectStoreDay(data, 'bsas', filedDay).tender).toEqual({ cash: 300, ewallet: 0, card: 462 })
  })

  it('gives the customers of that day by country', () => {
    expect(selectStoreDay(data, 'bsas', filedDay).countries.map((c) => [c.countryCode, c.customers, c.units])).toEqual([
      ['CN', 2, 3],
      ['MY', 1, 2],
    ])
  })

  it('reads today live, with nothing counted yet', () => {
    const d = selectStoreDay(data, 'bsas', today)
    expect(d).toMatchObject({ live: true, revenue: 376, units: 2, customers: 1 })
    expect(d.closing).toBeUndefined()
    expect(d.tender).toBeUndefined()
    expect(row(d, 'violet-retail')).toMatchObject({ units: 1, deducted: 1 })
    expect(d.rows.every((r) => r.onHand === null)).toBe(true)
  })

  it('says nothing was counted on a day that was never filed', () => {
    const d = selectStoreDay(data, 'bsas', '2026-11-01')
    expect(d).toMatchObject({ live: false, revenue: 0, units: 0 })
    expect(d.closing).toBeUndefined()
    expect(d.rows.every((r) => r.onHand === null && r.deducted === 0)).toBe(true)
  })
})

// The client, 20 November, the promoter's closing page: "Add below picture
// section ... so that they can refer back the deducted stocks and sales of the
// day" — the same rows, read from the closing being filled in.
describe('the day, product by product, from the closing being filled in', () => {
  it('takes the sales as they stand and the counts as typed, every product listed', () => {
    const lines = closing.lines
    const counts = new Map([
      ['orchid-retail', 41],
      ['man-retail', 6],
    ])
    // What leaves the shelf is the sales: nothing is written off at the counter.
    const rows = storeDayRows(lines, lines, counts, 'retail')
    expect(rows.map((r) => r.skuId)).toEqual(countedSkus.map((s) => s.id))
    const at = (id: string) => rows.find((r) => r.skuId === id)!
    expect(at('orchid-retail')).toMatchObject({ units: 3, revenue: 574, deducted: 3, onHand: 41 })
    expect(at('man-retail')).toMatchObject({ units: 1, deducted: 1, onHand: 6 })
    // Not counted yet: nothing to show.
    expect(at('violet-retail')).toMatchObject({ units: 0, deducted: 0, onHand: null })
  })

  it('reads the same as the store’s page once the day is filed', () => {
    const filed = selectStoreDay(data, 'bsas', filedDay).rows
    const counts = new Map(closing.stockCount.map((c) => [c.skuId, c.counted]))
    expect(storeDayRows(closing.lines, [...closing.lines, ...closing.writeOffs], counts, 'retail')).toEqual(filed)
  })
})

describe('a dealer’s months', () => {
  it('lists the months keyed in for it, the latest first', () => {
    expect(selectPartnerMonths(data, dealer)).toEqual([
      { month: '2026-10', revenue: 1000, keyed: data.partnerSales[0] },
    ])
    expect(selectPartnerMonths(data, 'bsas')).toEqual([])
  })
})

// 25 November: on a closed day that is still today, the heading read the day
// as filed and the Price and Sales columns read the counter, so a sale changed
// after closing left the two disagreeing.
describe('a closed day, as it was filed', () => {
  it('reads its sales, what it took off the shelf and its counts from the closing alone', () => {
    const rows = filedDayRows(closing)
    const at = (id: string) => rows.find((r) => r.skuId === id)!
    expect(rows.map((r) => r.skuId)).toEqual(countedSkus.map((s) => s.id))
    expect(at('orchid-retail')).toMatchObject({ units: 3, revenue: 574, deducted: 3, onHand: 20 })
    expect(at('man-retail')).toMatchObject({ units: 1, deducted: 2, onHand: 5 })
    expect(rows.reduce((a, r) => a + r.revenue, 0)).toBe(closing.revenueMYR)
  })

  it('does so for today too, whatever the counter says since', () => {
    const filedToday: Closing = { ...closing, id: `bsas-${today}`, period: today, submittedAt: `${today}T22:05:00+08:00` }
    const d: CrmData = { ...data, closings: [closing, filedToday] }
    // The counter has a Violet and an Orchid rung up since.
    expect(row(selectStoreDay(d, 'bsas', today), 'violet-retail').units).toBe(1)
    expect(filedDayRows(filedToday).find((r) => r.skuId === 'violet-retail')!.units).toBe(0)
    expect(filedDayRows(filedToday).reduce((a, r) => a + r.revenue, 0)).toBe(762)
  })
})

// The client's Revision #10, 26 November, Finance's store page: "Please help to
// confirm ALL stores vial will update the deducted stock everyday". Vials are
// given away with a purchase and many counters never ring them up, so their
// Deducted read 0 while the count fell every night.
describe('what a vial took off the shelf', () => {
  const vialDay: Closing = {
    ...closing,
    id: `bsas-${filedDay}-vials`,
    lines: [
      sale('orchid-retail', 2, 188, 'a', 'CN'),
      sale('orchid-vial', 2, 0, 'a', 'CN', 'foc'),
      sale('violet-vial', 5, 0, 'b', 'MY', 'foc'),
    ],
    stockCount: [
      // A bottle's count is not its Deducted: that is what sold and was written off.
      { skuId: 'orchid-retail', opening: 23, counted: 15 },
      // Down 6 on the count, 2 rung up.
      { skuId: 'orchid-vial', opening: 96, counted: 90 },
      // Down 3 on the count, 5 rung up.
      { skuId: 'violet-vial', opening: 72, counted: 69 },
      // Never rung up; 24 came in, and 30 are on the shelf.
      { skuId: 'mahsuri-vial', opening: 10, counted: 30 },
      // More on the shelf than before and nothing came in that the app knows of.
      { skuId: 'passion-vial', opening: 33, counted: 40 },
    ],
    writeOffs: [],
  }
  const off = (arrived: [string, number][] = []) =>
    new Map(
      offTheShelf([...vialDay.lines, ...vialDay.writeOffs], vialDay.stockCount, new Map(arrived)).reduce(
        (m, l) => m.set(l.skuId, (m.get(l.skuId) ?? 0) + l.qty),
        new Map<string, number>(),
      ),
    )

  it('is what its count says went, where that is more than was rung up', () => {
    expect(off().get('orchid-vial')).toBe(6)
  })

  it('is what was rung up, where that is more than the count says', () => {
    expect(off().get('violet-vial')).toBe(5)
  })

  it('takes in what arrived since the last count, and is never below nothing', () => {
    expect(off([['mahsuri-vial', 24]]).get('mahsuri-vial')).toBe(4)
    expect(off().get('passion-vial')).toBeUndefined()
  })

  it('leaves a bottle at what sold and was written off, whatever its count', () => {
    expect(off().get('orchid-retail')).toBe(2)
  })

  it('says nothing more where nothing was counted', () => {
    const lines = [...vialDay.lines]
    expect(offTheShelf(lines, null, new Map())).toEqual(lines)
  })

  it('reads so on the store’s page and on the promoter’s closed day, a delivery before the closing included', () => {
    const delivered: PurchaseOrder = {
      id: 'PO-261102-VIAL',
      locationId: 'bsas',
      createdBy: 'x',
      createdAt: '2026-11-01T03:00:00.000Z',
      priority: 'standard',
      notes: '',
      status: 'received',
      lines: [{ skuId: 'mahsuri-vial', qtyRequested: 24, qtyApproved: 24, qtyShipped: 24 }],
      // 2 November, 13:00 in Malaysia: before the day was filed at 22:05.
      events: [{ status: 'received', actor: 'x', role: 'promoter', at: '2026-11-02T05:00:00.000Z' }],
    }
    const d: CrmData = { ...data, closings: [vialDay], purchaseOrders: [delivered] }
    const page = selectStoreDay(d, 'bsas', filedDay)
    expect(row(page, 'orchid-vial')).toMatchObject({ units: 2, deducted: 6, onHand: 90 })
    expect(row(page, 'mahsuri-vial')).toMatchObject({ units: 0, deducted: 4, onHand: 30 })
    expect(row(page, 'orchid-retail')).toMatchObject({ deducted: 2, onHand: 15 })
    expect(filedDayRows(vialDay, new Map([['mahsuri-vial', 24]]))).toEqual(page.rows)
  })

  it('is what was rung up on a day still open, with nothing counted yet', () => {
    const d: CrmData = { ...data, liveLines: { bsas: [sale('orchid-vial', 1, 0, 'z', 'SG', 'foc')] } }
    expect(row(selectStoreDay(d, 'bsas', today), 'orchid-vial')).toMatchObject({ deducted: 1, onHand: null })
  })
})
