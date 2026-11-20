import { describe, expect, it } from 'vitest'
import {
  emptyFilter,
  foldOrigins,
  partnersIn,
  selectChannelMonth,
  selectChannelTotals,
  selectCountryTotals,
  selectDailySales,
  selectDailySeries,
  selectPeriodTotals,
  selectSkuTotals,
  selectStoreTotals,
} from './selectors'
import type { Closing, CrmData, SaleLine } from '../data/types'

/**
 * The meeting of 16 November: "if I chose one week, from 1st to 7th of
 * November, of course I want to see the total" — every store's total and
 * every product's units for those days, not a list of each day, and nothing
 * from outside them. Every country is listed, none folded into "Other".
 */

const sale = (skuId: string, qty: number, saleId: string, countryCode: string, unit = 188): SaleLine => ({
  skuId,
  qty,
  unitPriceMYR: unit,
  priceTier: 'promotion',
  saleId,
  countryCode,
})
const closing = (locationId: string, period: string, lines: SaleLine[]): Closing => ({
  id: `${locationId}-${period}`,
  locationId,
  channel: 'main',
  period,
  periodType: 'day',
  revenueMYR: lines.reduce((a, l) => a + l.qty * (l.unitPriceMYR ?? 0), 0),
  lines,
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: [],
  writeOffs: [],
  submittedBy: 'x',
  submittedAt: 'x',
})

const today = '2026-11-08'
const dealer = partnersIn('dealer')[0].id
const countries = ['CN', 'MY', 'SG', 'ID', 'IN', 'AU', 'GB', 'JP']
const data: CrmData = {
  today,
  closings: [
    // Last week of October: outside the dates chosen below.
    closing('pavilion-5', '2026-10-31', [sale('orchid-retail', 5, 'x', 'CN')]),
    closing('pavilion-5', '2026-11-01', [sale('orchid-retail', 2, 'a', 'CN'), sale('man-retail', 1, 'a', 'CN')]),
    closing('pavilion-5', '2026-11-03', [sale('orchid-retail', 1, 'b', 'MY')]),
    closing('klia-t2', '2026-11-02', countries.map((c, i) => sale('violet-retail', 1, `k${i}`, c))),
    // Today's closing is filed early; today is read from the counter, once.
    closing('klia-t2', today, [sale('orchid-retail', 99, 'zz', 'ID')]),
  ],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: { 'klia-t2': [sale('orchid-retail', 1, 'live', 'ID')] },
  partnerSales: [{ locationId: dealer, month: '2026-11', revenueMYR: 1000, enteredBy: 'Kelly Tew', enteredAt: 'x' }],
}
const week = emptyFilter('2026-11-01', '2026-11-07')

describe('a period on Analytics', () => {
  it('adds up the days chosen, and only those', () => {
    const t = selectPeriodTotals(data, week)
    // 2 + 1 at Pavilion on the 1st, 1 on the 3rd; 8 at KLIA on the 2nd; the dealer's month.
    expect(t).toMatchObject({ units: 12, customers: 10, revenue: 12 * 188 + 1000, stores: 3 })
    const days = [...selectDailySales(data, '2026-11').entries()].filter(([d]) => d <= '2026-11-07')
    expect(t.revenue - 1000).toBe(days.reduce((a, [, f]) => a + f.revenue, 0))
  })

  it('compares with the same number of days before', () => {
    // 25 Oct to 31 Oct: the five orchids on the 31st.
    expect(selectPeriodTotals(data, week).previous).toBe(5 * 188)
  })

  it('counts today once, from the counter, when the period runs to today', () => {
    const t = selectPeriodTotals(data, emptyFilter(today, today))
    expect(t).toMatchObject({ units: 1, revenue: 188, customers: 1 })
  })

  it('gives every store its total for the period, adding up to the whole', () => {
    const stores = selectStoreTotals(data, week)
    const by = new Map(stores.map((s) => [s.locationId, s]))
    expect(by.get('pavilion-5')).toMatchObject({ units: 4, revenue: 4 * 188, customers: 2, previous: 5 * 188, previousUnits: 5 })
    expect(by.get('klia-t2')).toMatchObject({ units: 8, revenue: 8 * 188, customers: 8 })
    expect(by.get(dealer)).toMatchObject({ revenue: 1000 })
    expect(stores.reduce((a, s) => a + s.revenue, 0)).toBe(selectPeriodTotals(data, week).revenue)
    // The best first.
    expect(stores[0].locationId).toBe('klia-t2')
  })

  it('gives every product its units for the period, in the range’s order', () => {
    expect(selectSkuTotals(data, week).map((s) => [s.skuId, s.units])).toEqual([
      ['orchid-retail', 3],
      ['violet-retail', 8],
      ['man-retail', 1],
    ])
  })

  it('lists every country, with none folded into Other', () => {
    const c = selectCountryTotals(data, week)
    expect(c).toHaveLength(8)
    expect(c.some((x) => x.countryCode === 'OTHER')).toBe(false)
    expect(c[0]).toMatchObject({ countryCode: 'CN', customers: 2 })
  })

  it('folds the countries past six into Other for the ribbon, the table keeping them all', () => {
    const all = selectCountryTotals(data, week)
    const ribbon = foldOrigins(all, 6)
    expect(ribbon).toHaveLength(7)
    expect(ribbon[6]).toMatchObject({ countryCode: 'OTHER', customers: 2, units: 2 })
    expect(ribbon.reduce((a, s) => a + s.customers, 0)).toBe(all.reduce((a, s) => a + s.customers, 0))
    expect(foldOrigins(all.slice(0, 3), 6)).toHaveLength(3)
  })

  it('splits the period by channel', () => {
    expect(selectChannelTotals(data, week)).toEqual([
      { channel: 'main', revenue: 12 * 188, units: 12 },
      { channel: 'dealer', revenue: 1000, units: 0 },
    ])
  })

  it('draws the period day by day, today live', () => {
    const series = selectDailySeries(data, emptyFilter('2026-11-01', today), 'units')
    expect(series.map((p) => p.value)).toEqual([3, 8, 1, 0, 0, 0, 0, 1])
  })
})

// 20 November, Finance's Revenue: "by channel should be working ... dealers and
// Consignment should be seen". They report a month at a time, so the split is
// a month's: the main stores' days, and each partner's month as keyed in.
describe('a month by channel', () => {
  const consignment = partnersIn('consignment')
  const d: CrmData = {
    ...data,
    partnerSales: [
      ...data.partnerSales,
      { locationId: consignment[0].id, month: '2026-11', revenueMYR: 500, enteredBy: 'Kelly Tew', enteredAt: 'x' },
      { locationId: consignment[1].id, month: '2026-10', revenueMYR: 700, enteredBy: 'Kelly Tew', enteredAt: 'x' },
    ],
  }

  it('gives every channel, the partners with how many are keyed in', () => {
    const rows = selectChannelMonth(d, '2026-11')
    expect(rows.map((r) => [r.channel, r.revenue])).toEqual([
      // The month so far: 12 on the 1st to the 7th, and today's one, live.
      ['main', 13 * 188],
      ['dealer', 1000],
      ['consignment', 500],
    ])
    expect(rows[1].keyed).toEqual({ done: 1, of: partnersIn('dealer').length })
    expect(rows[2].keyed).toEqual({ done: 1, of: consignment.length })
    expect(rows[0].keyed).toBeUndefined()
  })

  it('still lists the partners in a month nobody has keyed in, at nothing', () => {
    const rows = selectChannelMonth(d, '2026-09')
    expect(rows.map((r) => [r.channel, r.revenue, r.keyed?.done])).toEqual([
      ['main', 0, undefined],
      ['dealer', 0, 0],
      ['consignment', 0, 0],
    ])
  })
})
