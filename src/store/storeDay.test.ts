import { afterEach, describe, expect, it } from 'vitest'
import { partnersIn, selectPartnerMonths, selectStoreDay, storeDayRows } from './selectors'
import { applyCatalogue, countedSkus } from '../data/products'
import type { Closing, CrmData, SaleLine } from '../data/types'

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
