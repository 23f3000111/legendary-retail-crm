import { describe, expect, it } from 'vitest'
import {
  emptyFilter,
  partnersIn,
  selectCountryDetail,
  selectDailySales,
  selectDayDetail,
  selectOriginSales,
  selectOriginsBetween,
  selectSalesPeriods,
  selectSalesReport,
  selectSkuSales,
  selectStoreSales,
  type ReportRule,
} from './selectors'
import type { Closing, CrmData, SaleLine } from '../data/types'

/**
 * The client's seventh amendments (1 November): four sales boxes on every main
 * page — today, yesterday, the month so far and last month — nationality
 * counted by customers rather than bottles, a country's own breakdown, and a
 * calendar of daily sales that opens on a day.
 */

const line = (skuId: string, unitPriceMYR: number, countryCode: string, saleId: string, qty = 1): SaleLine => ({
  skuId,
  qty,
  priceTier: unitPriceMYR ? 'promotion' : 'foc',
  unitPriceMYR,
  countryCode,
  saleId,
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

// Tuesday 3 November 2026.
const today = '2026-11-03'
const dealer = partnersIn('dealer')[0].id
const data: CrmData = {
  today,
  closings: [
    closing('pavilion-5', '2026-10-15', [line('orchid-retail', 188, 'CN', 'a', 2)]),
    closing('pavilion-5', '2026-10-31', [line('orchid-retail', 188, 'MY', 'b')]),
    closing('pavilion-5', '2026-11-01', [line('orchid-retail', 198, 'CN', 'c')]),
    // One customer, two things: a bottle, and a Wish given free.
    closing('pavilion-5', '2026-11-02', [line('orchid-retail', 188, 'CN', 'd'), line('wish-3-set', 0, 'CN', 'd')]),
    closing('klia-t2', '2026-11-02', [line('orchid-retail', 188, 'ID', 'e')]),
    // Today is read from the counter, never from its closing.
    closing('klia-t2', today, [line('orchid-retail', 188, 'ID', 'zz', 99)]),
  ],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: {
    'pavilion-5': [line('orchid-retail', 188, 'CN', 'f')],
    'klia-t2': [line('violet-retail', 188, 'KR', 'g'), line('orchid-retail', 188, 'KR', 'g')],
  },
  partnerSales: [
    { locationId: dealer, month: '2026-10', revenueMYR: 1000, enteredBy: 'Kelly Tew', enteredAt: '2026-11-01T00:00:00Z' },
  ],
}

describe('the four sales boxes', () => {
  it('gives today live, yesterday as filed, the month so far, and last month', () => {
    const p = selectSalesPeriods(data)
    expect(p.today).toMatchObject({ from: today, to: today, revenue: 564, units: 3, customers: 2 })
    expect(p.yesterday).toMatchObject({ from: '2026-11-02', revenue: 376, units: 3, customers: 2 })
    expect(p.monthToDate).toMatchObject({ from: '2026-11-01', to: today, revenue: 1138, units: 7, customers: 5 })
    // Last month takes in the dealers' keyed-in month as well.
    expect(p.lastMonth).toMatchObject({ from: '2026-10-01', to: '2026-10-31', revenue: 1564, units: 3, customers: 2 })
  })

  it('reads one store alone when asked', () => {
    const p = selectSalesPeriods(data, { locationIds: ['pavilion-5'] })
    expect(p.today).toMatchObject({ revenue: 188, units: 1, customers: 1 })
    expect(p.yesterday).toMatchObject({ revenue: 188, units: 2, customers: 1 })
    expect(p.monthToDate).toMatchObject({ revenue: 574, units: 4, customers: 3 })
    expect(p.lastMonth).toMatchObject({ revenue: 564, units: 3, customers: 2 })
  })

  it('narrows to a nationality or a product, as the Analytics filter does', () => {
    expect(selectSalesPeriods(data, { countryCodes: ['KR'] }).today).toMatchObject({ revenue: 376, customers: 1 })
    expect(selectSalesPeriods(data, { skuIds: ['violet-retail'] }).today).toMatchObject({ revenue: 188, units: 1 })
    // A keyed-in month has no products behind it, so a product view leaves it out.
    expect(selectSalesPeriods(data, { skuIds: ['orchid-retail'] }).lastMonth.revenue).toBe(564)
  })
})

describe('the stores table, store by store', () => {
  it('gives each store its today, yesterday, month so far and last month', () => {
    const rows = selectStoreSales(data)
    expect(rows.find((r) => r.locationId === 'pavilion-5')).toMatchObject({
      today: { revenue: 188 },
      yesterday: { revenue: 188 },
      monthToDate: { revenue: 574 },
      lastMonth: { revenue: 564 },
    })
    expect(rows.find((r) => r.locationId === dealer)?.lastMonth.revenue).toBe(1000)
  })
})

describe('nationality, by customer', () => {
  it('counts a customer once, however many things they bought', () => {
    // 2 Nov at Pavilion: one Chinese customer, two things.
    const slices = selectOriginsBetween(data, 'pavilion-5', '2026-11-02', '2026-11-02')
    expect(slices).toEqual([expect.objectContaining({ countryCode: 'CN', customers: 1, units: 2, share: 100 })])
  })

  it('shares out the ribbon by customers', () => {
    const slices = selectOriginsBetween(data, 'pavilion-5', '2026-10-01', '2026-11-02')
    // CN: a, c, d — three customers, five bottles. MY: b — one customer.
    expect(slices.map((s) => [s.countryCode, s.customers, s.units, Math.round(s.share)])).toEqual([
      ['CN', 3, 5, 75],
      ['MY', 1, 1, 25],
    ])
  })
})

describe('one country, opened', () => {
  it('ranks the stores by its customers, and the products by what they bought', () => {
    const detail = selectCountryDetail(data, emptyFilter('2026-10-01', '2026-11-02'), 'CN')
    expect(detail.stores).toEqual([expect.objectContaining({ locationId: 'pavilion-5', customers: 3, units: 5 })])
    expect(detail.skus.map((s) => [s.skuId, s.units, s.revenue])).toEqual([
      ['orchid-retail', 4, 762],
      ['wish-3-set', 1, 0],
    ])
    expect(detail).toMatchObject({ customers: 3, units: 5, revenue: 762 })
  })
})

describe('the calendar', () => {
  it('gives each day of the month its sales, today live', () => {
    const days = selectDailySales(data, '2026-11')
    expect(days.get('2026-11-01')).toMatchObject({ revenue: 198, customers: 1 })
    expect(days.get('2026-11-02')).toMatchObject({ revenue: 376, units: 3, customers: 2 })
    expect(days.get(today)).toMatchObject({ revenue: 564, customers: 2 })
    expect(days.has('2026-11-04')).toBe(false)
  })

  it('opens a day: each store, each product, each nationality', () => {
    const day = selectDayDetail(data, '2026-11-02')
    expect(day.stores.map((s) => [s.locationId, s.revenue, s.units, s.customers, s.filed])).toEqual([
      ['pavilion-5', 188, 2, 1, true],
      ['klia-t2', 188, 1, 1, true],
    ])
    expect(day.skus.map((s) => [s.skuId, s.units, s.revenue])).toEqual([
      ['orchid-retail', 2, 376],
      ['wish-3-set', 1, 0],
    ])
    expect(day.skus[0].countries).toEqual([
      { countryCode: 'CN', units: 1 },
      { countryCode: 'ID', units: 1 },
    ])
    expect(day.countries.map((c) => [c.countryCode, c.customers, c.units])).toEqual([
      ['CN', 1, 2],
      ['ID', 1, 1],
    ])
    expect(day).toMatchObject({ revenue: 376, units: 3, customers: 2 })
  })

  it('opens today live, and one store alone', () => {
    expect(selectDayDetail(data, today).stores.map((s) => [s.locationId, s.revenue, s.filed])).toEqual([
      ['klia-t2', 376, true],
      ['pavilion-5', 188, false],
    ])
    expect(selectDayDetail(data, '2026-11-02', 'klia-t2').stores.map((s) => s.locationId)).toEqual(['klia-t2'])
  })
})

describe('the sales report, by store', () => {
  const date: ReportRule = { id: 'd', field: 'date', span: { op: 'equal', from: '2026-11-02', to: '2026-11-02' } }
  const rows = (rules: ReportRule[]) => selectSalesReport(data, rules).rows.map((r) => r.locationId)

  it('keeps the stores chosen, or leaves them out', () => {
    expect(rows([date])).toEqual(['klia-t2', 'pavilion-5'])
    expect(rows([date, { id: 's', field: 'store', op: 'equal', locationIds: ['klia-t2'] }])).toEqual(['klia-t2'])
    expect(rows([date, { id: 's', field: 'store', op: 'not_equal', locationIds: ['klia-t2'] }])).toEqual(['pavilion-5'])
  })
})

describe('product performance, by the four boxes', () => {
  it('gives each product its today, yesterday, month so far, last month and the chosen dates', () => {
    const rows = selectSkuSales(data, {}, emptyFilter('2026-10-31', '2026-11-02'))
    expect(rows.map((r) => r.skuId)).toEqual(['orchid-retail', 'violet-retail', 'wish-3-set'])
    expect(rows[0]).toMatchObject({
      // Today from the counter: Pavilion's one, KLIA T2's one — never today's closing.
      today: { units: 2, revenue: 376 },
      yesterday: { units: 2, revenue: 376 },
      monthToDate: { units: 5, revenue: 950 },
      lastMonth: { units: 3, revenue: 564 },
      chosen: { units: 4, revenue: 762 },
    })
    expect(rows[2]).toMatchObject({ yesterday: { units: 1, revenue: 0 }, today: { units: 0, revenue: 0 } })
  })

  it('adds up to the boxes, less the keyed-in months that have no products', () => {
    const rows = selectSkuSales(data, {}, emptyFilter(today, today))
    const sum = (k: 'today' | 'monthToDate' | 'lastMonth') => rows.reduce((a, r) => a + r[k].revenue, 0)
    const boxes = selectSalesPeriods(data)
    expect(sum('today')).toBe(boxes.today.revenue)
    expect(sum('monthToDate')).toBe(boxes.monthToDate.revenue)
    expect(sum('lastMonth')).toBe(boxes.lastMonth.revenue - 1000)
  })

  it('narrows to a store or a nationality, as the boxes do', () => {
    const rows = selectSkuSales(data, { countryCodes: ['KR'] }, emptyFilter(today, today))
    expect(rows.map((r) => [r.skuId, r.today.units, r.monthToDate.units])).toEqual([
      ['orchid-retail', 1, 1],
      ['violet-retail', 1, 1],
    ])
    expect(selectSkuSales(data, { locationIds: ['klia-t2'] }, emptyFilter(today, today))[0].yesterday).toEqual({
      units: 1,
      revenue: 188,
    })
  })

  // A store's best sellers, by the four windows and the page's range.
  it('gives one store its products, with the page range as the last column', () => {
    const range = { ...emptyFilter('2026-10-05', today), locationIds: ['pavilion-5'] }
    const rows = selectSkuSales(data, { locationIds: ['pavilion-5'] }, range)
    expect(rows.map((r) => r.skuId)).toEqual(['orchid-retail', 'wish-3-set'])
    expect(rows[0]).toMatchObject({
      today: { units: 1, revenue: 188 },
      yesterday: { units: 1, revenue: 188 },
      monthToDate: { units: 3, revenue: 574 },
      lastMonth: { units: 3, revenue: 564 },
      chosen: { units: 6, revenue: 1138 },
    })
  })
})

describe('where the customers came from, by the four boxes', () => {
  const store = { locationIds: ['pavilion-5'] }

  it('gives each nationality its customers, units and sales in every window', () => {
    const rows = selectOriginSales(data, store, { ...emptyFilter('2026-10-31', '2026-11-02'), ...store })
    // Most customers this month first.
    expect(rows.map((r) => r.countryCode)).toEqual(['CN', 'MY'])
    expect(rows[0]).toMatchObject({
      name: 'China',
      // Today from the counter; 2 Nov is one customer with two things.
      today: { customers: 1, units: 1, revenue: 188 },
      yesterday: { customers: 1, units: 2, revenue: 188 },
      monthToDate: { customers: 3, units: 4, revenue: 574 },
      lastMonth: { customers: 1, units: 2, revenue: 376 },
      chosen: { customers: 2, units: 3, revenue: 386 },
    })
    expect(rows[1]).toMatchObject({
      today: { customers: 0, units: 0, revenue: 0 },
      lastMonth: { customers: 1, units: 1, revenue: 188 },
      chosen: { customers: 1, units: 1, revenue: 188 },
    })
  })

  it('counts the same customers as the boxes, where every sale has a country', () => {
    const rows = selectOriginSales(data, {}, null)
    const sum = (k: 'today' | 'yesterday' | 'monthToDate' | 'lastMonth') => rows.reduce((a, r) => a + r[k].customers, 0)
    const boxes = selectSalesPeriods(data)
    expect(sum('today')).toBe(boxes.today.customers)
    expect(sum('yesterday')).toBe(boxes.yesterday.customers)
    expect(sum('monthToDate')).toBe(boxes.monthToDate.customers)
    expect(sum('lastMonth')).toBe(boxes.lastMonth.customers)
    // No dates of the page's own: the last column is empty.
    expect(rows.every((r) => r.chosen.customers === 0 && r.chosen.units === 0)).toBe(true)
  })

  it('opens a country by the same rules: today live, and its closing never counted as well', () => {
    const month = { ...emptyFilter('2026-11-01', today), locationIds: ['klia-t2'] }
    expect(selectCountryDetail(data, month, 'ID', true)).toMatchObject({ customers: 1, units: 1, revenue: 188 })
    // As filed, today's closing counts and the counter does not.
    expect(selectCountryDetail(data, month, 'ID')).toMatchObject({ customers: 2, units: 100 })
    const live = selectCountryDetail(data, { ...emptyFilter('2026-11-01', today), ...store }, 'CN', true)
    expect(live).toMatchObject({ customers: 3, units: 4, revenue: 574 })
    expect(live.skus.map((s) => [s.skuId, s.units])).toEqual([
      ['orchid-retail', 3],
      ['wish-3-set', 1],
    ])
  })
})
