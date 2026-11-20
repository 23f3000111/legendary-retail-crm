import { describe, expect, it } from 'vitest'
import { emptyFilter, partnersIn, selectStorePeriod, selectStoreTotals } from './selectors'
import type { Closing, CrmData, SaleLine, Tender } from '../data/types'

/**
 * 20 November, on Stores and Analytics: "when click on any stores then its
 * data should be open in pop-up with all the details ... it says 20 unit sold
 * but it's not showing what 20 unit sold." One store over some dates: what it
 * sold and at what prices, who bought, day by day, and how it was paid.
 */

const sale = (skuId: string, qty: number, saleId: string, countryCode: string, unit = 188, tier: SaleLine['priceTier'] = 'promotion'): SaleLine => ({
  skuId,
  qty,
  unitPriceMYR: unit,
  priceTier: tier,
  saleId,
  countryCode,
})
const closing = (locationId: string, period: string, lines: SaleLine[], tender?: Tender): Closing => ({
  id: `${locationId}-${period}`,
  locationId,
  channel: 'main',
  period,
  periodType: 'day',
  revenueMYR: lines.reduce((a, l) => a + l.qty * (l.unitPriceMYR ?? 0), 0),
  ...(tender ? { tender } : {}),
  lines,
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: [],
  writeOffs: [],
  submittedBy: 'x',
  submittedAt: 'x',
})

const today = '2026-11-08'
const dealer = partnersIn('dealer')[0].id
const data: CrmData = {
  today,
  closings: [
    // Before the dates chosen below.
    closing('pavilion-5', '2026-10-31', [sale('orchid-retail', 5, 'x', 'CN')], { cash: 940, ewallet: 0, card: 0 }),
    closing(
      'pavilion-5',
      '2026-11-01',
      [sale('orchid-retail', 2, 'a', 'CN'), sale('man-retail', 1, 'a', 'CN'), sale('orchid-retail', 1, 'b', 'MY', 198, 'promotion2')],
      { cash: 300, ewallet: 0, card: 462 },
    ),
    closing('pavilion-5', '2026-11-03', [sale('orchid-retail', 1, 'c', 'CN')], { cash: 0, ewallet: 0, card: 188 }),
    closing('klia-t2', '2026-11-02', [sale('violet-retail', 4, 'k', 'ID')]),
    // Today's closing, filed early: today is read from the counter, once.
    closing('pavilion-5', today, [sale('orchid-retail', 99, 'zz', 'CN')], { cash: 99, ewallet: 0, card: 0 }),
  ],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: { 'pavilion-5': [sale('violet-retail', 1, 'live', 'SG')] },
  partnerSales: [
    { locationId: dealer, month: '2026-11', revenueMYR: 1000, enteredBy: 'Kelly Tew', enteredAt: '2026-11-05T01:00:00Z' },
  ],
}
const days = emptyFilter('2026-11-01', today)

describe('one store, opened for some dates', () => {
  it('adds up as the store’s row on Analytics does', () => {
    const p = selectStorePeriod(data, days, 'pavilion-5')
    const row = selectStoreTotals(data, days).find((r) => r.locationId === 'pavilion-5')!
    expect(p).toMatchObject({ revenue: row.revenue, units: row.units, customers: row.customers })
    // 2 + 1 + 1 on the 1st, 1 on the 3rd, 1 today live; never today's closing as well.
    expect(p).toMatchObject({ units: 6, customers: 4, revenue: 2 * 188 + 188 + 198 + 188 + 188 })
  })

  it('says what sold, most first, and every price it went at', () => {
    const p = selectStorePeriod(data, days, 'pavilion-5')
    expect(p.skus.map((s) => [s.skuId, s.units, s.revenue])).toEqual([
      ['orchid-retail', 4, 3 * 188 + 198],
      ['man-retail', 1, 188],
      ['violet-retail', 1, 188],
    ])
    const orchid = p.skus[0]
    expect(orchid.prices.map((x) => [x.unitPrice, x.tier, x.qty])).toEqual([
      [188, 'promotion', 3],
      [198, 'promotion2', 1],
    ])
    expect(orchid.code).toBeTruthy()
  })

  it('says who bought, by customer, and the days it sold', () => {
    const p = selectStorePeriod(data, days, 'pavilion-5')
    expect(p.countries.map((c) => [c.countryCode, c.customers, c.units])).toEqual([
      ['CN', 2, 4],
      ['MY', 1, 1],
      ['SG', 1, 1],
    ])
    expect(p.days.map((d) => [d.day, d.units, d.customers])).toEqual([
      ['2026-11-01', 4, 2],
      ['2026-11-03', 1, 1],
      [today, 1, 1],
    ])
  })

  it('says how the days filed were paid, and nothing when the view is narrowed to products', () => {
    expect(selectStorePeriod(data, days, 'pavilion-5').tender).toEqual({ cash: 300, ewallet: 0, card: 650, days: 2 })
    expect(selectStorePeriod(data, { ...days, skuIds: ['orchid-retail'] }, 'pavilion-5').tender).toBeNull()
    expect(selectStorePeriod(data, emptyFilter(today, today), 'pavilion-5').tender).toBeNull()
  })

  it('narrows to the products and countries asked for', () => {
    const p = selectStorePeriod(data, { ...days, countryCodes: ['CN'] }, 'pavilion-5')
    expect(p).toMatchObject({ units: 4, customers: 2 })
    expect(p.skus.map((s) => s.skuId)).toEqual(['orchid-retail', 'man-retail'])
  })

  it('gives a dealer its month keyed in, which has no products behind it', () => {
    const p = selectStorePeriod(data, days, dealer)
    expect(p).toMatchObject({ revenue: 1000, units: 0, customers: 0 })
    expect(p.skus).toEqual([])
    expect(p.months).toEqual([{ month: '2026-11', revenue: 1000, keyed: data.partnerSales[0] }])
    // A day that is not the 1st of the month holds none of it.
    expect(selectStorePeriod(data, emptyFilter('2026-11-02', today), dealer).months).toEqual([])
  })
})
