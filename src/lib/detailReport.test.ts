import { afterEach, describe, expect, it } from 'vitest'
import { buildDetailReport, detailCsvBlocks, detailPrintSpec } from './detailReport'
import { toCsvSections } from './exportCsv'
import { emptyFilter, partnersIn, selectDayDetail } from '../store/selectors'
import { applyCatalogue } from '../data/products'
import { startFixture } from '../store/testing'
import { useData } from '../store/useData'
import type { Closing, CrmData, SaleLine } from '../data/types'

/**
 * The meeting of 16 November: exports "need to include net sales, quantities,
 * closing quantity and customers", like Zeoniq's report — each product, every
 * date it sold, its selling price and net sales, a subtotal for every product,
 * and no rows for what did not sell — and they follow the dates and filters.
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

const day = '2026-11-02'
const bsas: Closing = {
  id: `bsas-${day}`,
  locationId: 'bsas',
  channel: 'main',
  period: day,
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
  submittedBy: 'x',
  submittedAt: `${day}T22:00:00+08:00`,
}
const dealer = partnersIn('dealer')[0].id
const data: CrmData = {
  today: '2026-11-03',
  closings: [bsas],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: {},
  partnerSales: [{ locationId: dealer, month: '2026-11', revenueMYR: 1000, enteredBy: 'Kelly Tew', enteredAt: 'x' }],
}
const oneDay = { ...emptyFilter(day, day), locationIds: ['bsas'] }

describe('the detailed report', () => {
  it('lists each product in the range order, a row for each price it went at, no zero rows', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.sales.map((s) => [s.skuId, s.units, s.unitPrice, s.revenue])).toEqual([
      ['orchid-retail', 2, 188, 376],
      ['orchid-retail', 1, 198, 198],
      ['wish-3-set', 1, 0, 0],
      ['man-retail', 1, 188, 188],
    ])
    expect(r.sales.every((s) => s.units > 0)).toBe(true)
  })

  it('gives every product its subtotal, and the whole its total', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.products.map((p) => [p.skuId, p.units, p.revenue])).toEqual([
      ['orchid-retail', 3, 574],
      ['wish-3-set', 1, 0],
      ['man-retail', 1, 188],
    ])
    expect(r.totals).toMatchObject({ units: 5, revenue: 762, customers: 3 })
  })

  it('carries the cash and card as filed, and the shelf as counted at the close', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.payment).toEqual([{ day, locationId: 'bsas', cash: 300, card: 462, ewallet: 0, total: 762 }])
    // Deducted is sold plus written off; on hand is the count.
    expect(r.stock.map((s) => [s.skuId, s.deducted, s.onHand])).toEqual([
      ['orchid-retail', 3, 20],
      ['wish-3-set', 1, 8],
      ['man-retail', 2, 5],
    ])
  })

  it('sums the customers by country', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.customers.map((c) => [c.countryCode, c.customers, c.units, c.revenue])).toEqual([
      ['CN', 2, 3, 376],
      ['MY', 1, 2, 386],
    ])
  })

  it('takes in the dealers’ keyed months, unless a product or country narrows it', () => {
    const month = emptyFilter('2026-11-01', day)
    expect(buildDetailReport(data, month).partners).toEqual([{ month: '2026-11', locationId: dealer, revenue: 1000 }])
    expect(buildDetailReport(data, month).totals.revenue).toBe(1762)
    const orchid = buildDetailReport(data, { ...month, skuIds: ['orchid-retail'] })
    expect(orchid.partners).toEqual([])
    expect(orchid.sales.every((s) => s.skuId === 'orchid-retail')).toBe(true)
    expect(orchid.stock.map((s) => s.skuId)).toEqual(['orchid-retail'])
    expect(orchid.totals).toMatchObject({ units: 3, revenue: 574 })
  })

  it('agrees with the calendar’s day, on the sample history', () => {
    startFixture('siew-fang')
    const state = useData.getState()
    const yesterday = '2026-08-20'
    const r = buildDetailReport(state, { ...emptyFilter(yesterday, yesterday), locationIds: ['pavilion-5'] })
    const d = selectDayDetail(state, yesterday, 'pavilion-5')
    expect(r.totals.revenue).toBe(d.revenue)
    expect(r.totals.units).toBe(d.units)
    expect(r.customers.reduce((a, c) => a + c.customers, 0)).toBe(d.countries.reduce((a, c) => a + c.customers, 0))
    expect(r.stock.length).toBeGreaterThan(20)
  })
})

describe('the CSV and the PDF of it', () => {
  it('writes the sections one after another, with a subtotal under each product', () => {
    const csv = toCsvSections(detailCsvBlocks(buildDetailReport(data, oneDay), [['Store', 'BSAS']]))
    const lines = csv.split('\r\n')
    expect(lines).toContain('SALES BY PRODUCT')
    expect(lines).toContain('Subtotal · Orchid · 30ml,LGD-ORC-R30,,,,3,,574')
    expect(lines).toContain('Total,,,,,5,,762')
    expect(lines).toContain('PAYMENT (AS FILED AT EACH CLOSE)')
    expect(lines).toContain('CLOSING STOCK (AS COUNTED AT EACH CLOSE)')
    expect(lines).toContain('CUSTOMERS')
    expect(lines).toContain('Store,BSAS')
  })

  it('draws up the same report to print', () => {
    const spec = detailPrintSpec(buildDetailReport(data, oneDay), { title: 'BSAS', subtitle: '2 Nov 2026', rules: [], perStore: false })
    expect(spec.sections?.map((s) => s.title)).toEqual(['Sales by product', 'Payment', 'Closing stock', 'Customers'])
    const sales = spec.sections![0]
    // One subtotal row for each product, marked so it prints bold.
    expect(sales.subtotals).toHaveLength(3)
    expect(sales.total).toEqual(['Total', '', '5', '', 'RM 762'])
  })
})
