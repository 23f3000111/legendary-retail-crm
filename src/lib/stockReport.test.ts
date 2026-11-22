import { describe, expect, it } from 'vitest'
import { buildStockReport, stockCsvBlocks, stockFilename, stockPrintSpec } from './stockReport'
import { toCsvSections } from './exportCsv'
import { reportHtml } from './printReport'
import { countedSkus } from '../data/products'
import { selectStock } from '../store/selectors'
import type { Closing, CrmData } from '../data/types'

/**
 * 22 November, of the Stock page's export: "this exported report in Davy,
 * Kelly and Chloe's page should give the breakdown output like the report made
 * in finance page". It was one grid, a product a row and a store a column.
 * Now it reads like the Product Sales Listing: each store under its own band,
 * every product under it, a subtotal under each store, and a grand total.
 */

const count = (locationId: string, period: string, counts: [string, number][]): Closing => ({
  id: `${locationId}-${period}`,
  locationId,
  channel: 'main',
  period,
  periodType: 'day',
  revenueMYR: 0,
  lines: [],
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: counts.map(([skuId, counted]) => ({ skuId, opening: counted, counted })),
  writeOffs: [],
  submittedBy: 'x',
  submittedAt: `${period}T22:00:00+08:00`,
})

const data: CrmData = {
  today: '2026-11-22',
  closings: [
    count('pavilion-5', '2026-11-20', [['orchid-retail', 3], ['violet-retail', 0]]),
    // Its latest close is the one that counts.
    count('pavilion-5', '2026-11-21', [['orchid-retail', 466], ['violet-retail', 96], ['man-retail', 0]]),
    count('bsas', '2026-11-21', [['orchid-retail', 40], ['violet-retail', 41]]),
  ],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: {},
  partnerSales: [],
}

describe('the stock report', () => {
  const r = buildStockReport(data, ['pavilion-5', 'bsas', 'trx'])

  it('gives each store its products, as the page shows them, and when they were counted', () => {
    expect(r.stores.map((s) => [s.locationId, s.countedOn])).toEqual([
      ['pavilion-5', '2026-11-21'],
      ['bsas', '2026-11-21'],
      ['trx', null],
    ])
    expect(r.stores[0].rows).toEqual(selectStock(data, 'pavilion-5'))
    expect(r.stores[0].rows.map((x) => x.skuId)).toEqual(countedSkus.map((s) => s.id))
  })

  it('adds each store up, and the stores up to the grand total', () => {
    expect(r.stores[0].subtotal).toMatchObject({ onHand: 466 + 96, out: 1 })
    expect(r.stores[1].subtotal).toMatchObject({ onHand: 81, out: 0 })
    // A store that has never filed has nothing counted, and nothing out.
    expect(r.stores[2].subtotal).toMatchObject({ onHand: 0, out: 0, atOrBelow: 0, notCounted: countedSkus.length })
    expect(r.total.onHand).toBe(466 + 96 + 81)
    expect(r.total.suggested).toBe(r.stores.reduce((a, s) => a + s.subtotal.suggested, 0))
    expect(r.total.atOrBelow).toBe(r.stores.reduce((a, s) => a + s.subtotal.atOrBelow, 0))
  })

  it('adds each product up across the stores', () => {
    const orchid = r.products.find((p) => p.skuId === 'orchid-retail')!
    expect(orchid).toMatchObject({ onHand: 466 + 40, storesLow: 0 })
    const man = r.products.find((p) => p.skuId === 'man-retail')!
    expect(man).toMatchObject({ onHand: 0, storesLow: 1 })
  })

  it('writes the CSV store by store: a band, the products, a subtotal, then the grand total', () => {
    const blocks = stockCsvBlocks(r)
    expect(blocks.map((b) => b.title).filter(Boolean)).toEqual(['STOCK BY STORE', 'STOCK LISTING', 'EACH PRODUCT ACROSS THE STORES'])
    const listing = blocks.find((b) => b.title === 'STOCK LISTING')!
    const firsts = listing.rows.map((row) => String(row[0]))
    expect(firsts[0]).toBe('Outlet: PV5 - Pavilion 5th Floor')
    expect(firsts).toContain('Subtotal · Pavilion 5th Floor')
    expect(firsts).toContain('Outlet: BSA - BSAS')
    expect(firsts[firsts.length - 1]).toBe('Grand Total')
    const orchid = listing.rows.find((row) => row[1] === 'LGD-ORC-R30')
    expect(orchid?.slice(0, 3)).toEqual(['Orchid · 30ml', 'LGD-ORC-R30', 466])
    // Never counted: no figure, and says so.
    const trxRows = listing.rows.slice(firsts.indexOf('Outlet: TRX - TRX') + 1, firsts.indexOf('Subtotal · TRX'))
    expect(trxRows.every((row) => row[2] === '' && row[6] === 'Not counted yet')).toBe(true)
    const csv = toCsvSections(blocks)
    expect(csv).toContain('As at 2026-11-22')
  })

  it('keeps one store to its own listing, with no table of stores', () => {
    const one = buildStockReport(data, ['bsas'])
    expect(stockCsvBlocks(one).map((b) => b.title).filter(Boolean)).toEqual(['STOCK LISTING'])
    expect(stockFilename(one)).toBe('legendary-stock-BSA-2026-11-22.csv')
    expect(stockFilename(r)).toBe('legendary-stock-2026-11-22.csv')
  })

  it('prints the same listing, banded by store, with the totals in boxes', () => {
    const spec = stockPrintSpec(r)
    expect(spec.boxes?.map((b) => b.label)).toEqual(['Units on hand', 'At or below reorder', 'Out of stock', 'Suggested top-up'])
    const listing = spec.sections!.find((s) => s.title === 'Stock listing')!
    expect(listing.bands?.map((b) => listing.rows[b.row][0])).toEqual(['Outlet: PV5 - Pavilion 5th Floor', 'Outlet: BSA - BSAS', 'Outlet: TRX - TRX'])
    expect(listing.total?.[0]).toBe('Grand Total')
    expect(reportHtml(spec, 'logo.png', 'now')).toContain('Stock listing')
  })
})
