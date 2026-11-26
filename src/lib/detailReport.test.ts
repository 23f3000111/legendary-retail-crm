import { afterEach, describe, expect, it } from 'vitest'
import { buildDetailReport, detailCsvBlocks, detailFilename, detailPrintSpec, foldOutlets } from './detailReport'
import { toCsvSections } from './exportCsv'
import { reportHtml } from './printReport'
import { emptyFilter, partnersIn, selectDayDetail } from '../store/selectors'
import { applyCatalogue } from '../data/products'
import { startFixture } from '../store/testing'
import { useData } from '../store/useData'
import type { Closing, CrmData, SaleLine } from '../data/types'

/**
 * The meeting of 16 November: exports "need to include net sales, quantities,
 * closing quantity and customers", and the layout follows the Zeoniq report
 * Davy sent on 18 November ("Product Sales Listing"): outlet by outlet, item
 * by item, every date the item sold and nothing for the dates it did not, a
 * subtotal under each item and each outlet, and a grand total. Its cost and
 * gross-profit columns are left out ("no need to be exactly like this").
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

const closing = (locationId: string, period: string, lines: SaleLine[], tender: Closing['tender'], more: Partial<Closing> = {}): Closing => ({
  id: `${locationId}-${period}`,
  locationId,
  channel: 'main',
  period,
  periodType: 'day',
  revenueMYR: lines.reduce((a, l) => a + l.qty * (l.unitPriceMYR ?? 0), 0),
  tender,
  lines,
  staffSales: { qty: 0, revenueMYR: 0 },
  stockCount: [],
  writeOffs: [],
  submittedBy: 'x',
  submittedAt: `${period}T22:00:00+08:00`,
  ...more,
})

const day = '2026-11-02'
const bsas = closing(
  'bsas',
  day,
  [
    sale('orchid-retail', 2, 188, 'a', 'CN'),
    sale('orchid-retail', 1, 198, 'b', 'MY', 'promotion2'),
    sale('man-retail', 1, 188, 'b', 'MY'),
    sale('wish-3-set', 1, 0, 'c', 'CN', 'foc'),
  ],
  { cash: 300, ewallet: 0, card: 462 },
  {
    stockCount: [
      { skuId: 'orchid-retail', opening: 23, counted: 20 },
      { skuId: 'man-retail', opening: 7, counted: 5 },
      { skuId: 'wish-3-set', opening: 9, counted: 8 },
    ],
    writeOffs: [{ skuId: 'man-retail', qty: 1, reason: 'tester' }],
  },
)
// The day before at BSAS, a Wish 3 sold rather than given; and KLCC Isetan on the day.
const bsasBefore = closing('bsas', '2026-11-01', [sale('wish-3-set', 1, 88, 'z', 'SG')], { cash: 88, ewallet: 0, card: 0 })
const klcc = closing(
  'klcc-isetan',
  day,
  [sale('orchid-retail', 1, 188, 'k', 'SG'), sale('wish-3-set', 2, 0, 'k', 'SG', 'foc')],
  { cash: 0, ewallet: 0, card: 188 },
)
const dealer = partnersIn('dealer')[0].id
const data: CrmData = {
  today: '2026-11-03',
  closings: [bsasBefore, bsas, klcc],
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
const twoDays = emptyFilter('2026-11-01', day)

/** An item's rows and subtotal, as [date, price, net, qty, trans]. */
const shape = (item: { label: string; rows: { day: string; unitPrice: number; net: number; units: number; transactions: number }[]; subtotal: { net: number; units: number; transactions: number } }) => [
  item.label,
  item.rows.map((r) => [r.day, r.unitPrice, r.net, r.units, r.transactions]),
  [item.subtotal.net, item.subtotal.units, item.subtotal.transactions],
]

describe('the product sales listing', () => {
  it('lists each item at the outlet in the range order, every date it sold at each price, nothing for what did not sell', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.outlets.map((o) => [o.locationId, o.code, o.name])).toEqual([['bsas', 'BSA', 'BSAS']])
    expect(r.outlets[0].items.map(shape)).toEqual([
      ['Orchid · 30ml', [[day, 188, 376, 2, 1], [day, 198, 198, 1, 1]], [574, 3, 2]],
      ['Wish 3 · 15ml (FOC)', [[day, 0, 0, 1, 1]], [0, 1, 1]],
      ['Man · 50ml', [[day, 188, 188, 1, 1]], [188, 1, 1]],
    ])
  })

  it('keeps what was given free apart from what was sold, as its own item, after it', () => {
    const r = buildDetailReport(data, twoDays)
    const wishes = r.outlets[0].items.filter((i) => i.skuId === 'wish-3-set')
    expect(wishes.map((i) => [i.code, i.label, i.free])).toEqual([
      ['LGD-WIS3-R15', 'Wish 3 · 15ml', false],
      ['LGD-WIS3-R15', 'Wish 3 · 15ml (FOC)', true],
    ])
    expect(wishes.map(shape)).toEqual([
      ['Wish 3 · 15ml', [['2026-11-01', 88, 88, 1, 1]], [88, 1, 1]],
      ['Wish 3 · 15ml (FOC)', [[day, 0, 0, 1, 1]], [0, 1, 1]],
    ])
  })

  it('gives each outlet its subtotal, by name, and the whole its grand total', () => {
    const r = buildDetailReport(data, twoDays)
    expect(r.outlets.map((o) => [o.name, o.subtotal.net, o.subtotal.units, o.subtotal.transactions])).toEqual([
      ['BSAS', 850, 6, 5],
      ['KLCC Isetan', 188, 3, 2],
    ])
    // Nothing is discounted at the counter: the gross is the net.
    expect(r.grandTotal).toEqual({ gross: 1038, discount: 0, net: 1038, units: 9, transactions: 7 })
    expect(r.totals).toMatchObject({ units: 9, linesRevenue: 1038, revenue: 2038, customers: 5 })
  })

  it('lists the main stores first, then the partners, as the app does, each by name', () => {
    const cldf = partnersIn('dealer').find((p) => p.name === 'CLDF Enterprise')!
    const withDealer = {
      ...data,
      closings: [...data.closings, { ...closing(cldf.id, day, [sale('orchid-retail', 1, 188, 'd', 'MY')], undefined), channel: 'dealer' as const }],
    }
    expect(buildDetailReport(withDealer, twoDays).outlets.map((o) => o.name)).toEqual(['BSAS', 'KLCC Isetan', 'CLDF Enterprise'])
  })

  it('folds the outlets together, item by item and date by date, for a report of several', () => {
    const items = foldOutlets(buildDetailReport(data, twoDays).outlets)
    expect(items.map(shape)).toEqual([
      ['Orchid · 30ml', [[day, 188, 564, 3, 2], [day, 198, 198, 1, 1]], [762, 4, 3]],
      ['Wish 3 · 15ml', [['2026-11-01', 88, 88, 1, 1]], [88, 1, 1]],
      ['Wish 3 · 15ml (FOC)', [[day, 0, 0, 3, 2]], [0, 3, 2]],
      ['Man · 50ml', [[day, 188, 188, 1, 1]], [188, 1, 1]],
    ])
  })

  it('totals each product across the outlets, for the best sellers', () => {
    const r = buildDetailReport(data, twoDays)
    expect(r.products.map((p) => [p.skuId, p.units, p.revenue])).toEqual([
      ['orchid-retail', 4, 762],
      ['wish-3-set', 4, 88],
      ['man-retail', 1, 188],
    ])
  })
})

describe('the rest of the report', () => {
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

  // The client's Revision #10, 26 November: "Please help to confirm ALL stores
  // vial will update the deducted stock everyday". The export says what the page does.
  it('takes a vial’s Deducted from its count where more went than was rung up', () => {
    const vials = closing('bsas', day, [sale('orchid-vial', 1, 0, 'v', 'CN', 'foc')], { cash: 0, ewallet: 0, card: 0 }, {
      stockCount: [
        { skuId: 'orchid-retail', opening: 23, counted: 15 },
        { skuId: 'orchid-vial', opening: 96, counted: 90 },
      ],
    })
    const r = buildDetailReport({ ...data, closings: [vials] }, oneDay)
    expect(r.stock.map((s) => [s.skuId, s.deducted, s.onHand])).toEqual([
      ['orchid-retail', 0, 15],
      ['orchid-vial', 6, 90],
    ])
  })

  // The client's Revision #10, 26 November: "For KLIA T2, On hand quantity not
  // displaying". A day filed with every product at 0 was not counted.
  it('gives no on-hand figure for a day filed with every product at 0, in the CSV and the PDF', () => {
    const zeroed = { ...bsas, stockCount: bsas.stockCount.map((c) => ({ ...c, counted: 0 })) }
    const r = buildDetailReport({ ...data, closings: [zeroed] }, oneDay)
    expect(r.stock.map((s) => [s.skuId, s.deducted, s.onHand])).toEqual([
      ['orchid-retail', 3, null],
      ['wish-3-set', 1, null],
      ['man-retail', 2, null],
    ])
    const csv = toCsvSections(detailCsvBlocks(r)).split('\r\n')
    expect(csv).toContain('2026-11-02,BSAS,BSA,Orchid · 30ml,LGD-ORC-R30,3,')
    const shelf = detailPrintSpec(r, { title: 'BSAS', subtitle: '', rules: [] }).sections!.find((x) => x.title === 'Closing stock')!
    expect(shelf.rows[0]).toEqual(['Orchid · 30ml', '−3', '—'])
    expect(shelf.total).toEqual(['Total', '−6', '—'])
  })

  it('sums the customers by country', () => {
    const r = buildDetailReport(data, oneDay)
    expect(r.customers.map((c) => [c.countryCode, c.customers, c.units, c.revenue])).toEqual([
      ['CN', 2, 3, 376],
      ['MY', 1, 2, 386],
    ])
  })

  it('takes in the dealers’ keyed months, unless a product or country narrows it', () => {
    expect(buildDetailReport(data, twoDays).partners).toEqual([{ month: '2026-11', locationId: dealer, revenue: 1000 }])
    const orchid = buildDetailReport(data, { ...twoDays, skuIds: ['orchid-retail'] })
    expect(orchid.partners).toEqual([])
    expect(orchid.outlets.flatMap((o) => o.items).every((i) => i.skuId === 'orchid-retail')).toBe(true)
    expect(orchid.stock.map((s) => s.skuId)).toEqual(['orchid-retail'])
    expect(orchid.totals).toMatchObject({ units: 4, revenue: 762 })
  })

  it('totals each store that sold, the best first, with the partners’ months (16 November)', () => {
    const r = buildDetailReport(data, twoDays)
    expect(r.stores.map((s) => [s.locationId, s.units, s.revenue, s.customers])).toEqual([
      [dealer, 0, 1000, 0],
      ['bsas', 6, 850, 4],
      ['klcc-isetan', 3, 188, 1],
    ])
  })

  it('agrees with the calendar’s day, on the sample history', () => {
    startFixture('siew-fang')
    const state = useData.getState()
    const yesterday = '2026-08-20'
    const r = buildDetailReport(state, { ...emptyFilter(yesterday, yesterday), locationIds: ['pavilion-5'] })
    const d = selectDayDetail(state, yesterday, 'pavilion-5')
    expect(r.totals.revenue).toBe(d.revenue)
    expect(r.totals.units).toBe(d.units)
    expect(r.grandTotal.net).toBe(d.revenue)
    expect(r.customers.reduce((a, c) => a + c.customers, 0)).toBe(d.countries.reduce((a, c) => a + c.customers, 0))
    expect(r.stock.length).toBeGreaterThan(20)
  })
})

describe('the CSV of it', () => {
  const linesOf = (csv: string) => csv.split('\r\n')
  const listing = (lines: string[]) => lines.slice(lines.indexOf('PRODUCT SALES LISTING'), lines.findIndex((l) => l.startsWith('Grand Total')) + 1)

  it('opens like Zeoniq’s, with the dates it covers', () => {
    const lines = linesOf(toCsvSections(detailCsvBlocks(buildDetailReport(data, oneDay), [['Store', 'BSAS']])))
    expect(lines.slice(0, 4)).toEqual([
      'Product Sales Listing',
      'Legendary Retail CRM',
      'Filters: Business Date from 2/11/2026 to 2/11/2026',
      'Store,BSAS',
    ])
  })

  it('lists outlet, item, dates, subtotals and the grand total, in Zeoniq’s order', () => {
    const lines = linesOf(toCsvSections(detailCsvBlocks(buildDetailReport(data, oneDay))))
    expect(listing(lines)).toEqual([
      'PRODUCT SALES LISTING',
      'Business Date,Selling Price,Gross Amount,Discount,Net Sales,Item Qty,Trans. Count',
      'Outlet: BSA - BSAS',
      'Item: LGD-ORC-R30 - Orchid · 30ml',
      '2026-11-02,188.00,376.00,0.00,376.00,2,1',
      '2026-11-02,198.00,198.00,0.00,198.00,1,1',
      'Subtotal,,574.00,0.00,574.00,3,2',
      'Item: LGD-WIS3-R15 - Wish 3 · 15ml (FOC)',
      '2026-11-02,0.00,0.00,0.00,0.00,1,1',
      'Subtotal,,0.00,0.00,0.00,1,1',
      'Item: LGD-MAN-R50 - Man · 50ml',
      '2026-11-02,188.00,188.00,0.00,188.00,1,1',
      'Subtotal,,188.00,0.00,188.00,1,1',
      'Subtotal · BSAS,,762.00,0.00,762.00,5,4',
      'Grand Total,,762.00,0.00,762.00,5,4',
    ])
    // Then payment, the shelf and the customers; one store, so no by-store part.
    expect(lines).toContain('PAYMENT (AS FILED AT EACH CLOSE)')
    expect(lines).toContain('CLOSING STOCK (AS COUNTED AT EACH CLOSE)')
    expect(lines).toContain('CUSTOMERS')
    expect(lines).not.toContain('SALES BY STORE')
  })

  it('keeps every outlet apart, one after the other, where there are several', () => {
    const lines = linesOf(toCsvSections(detailCsvBlocks(buildDetailReport(data, twoDays))))
    expect(lines).toContain('SALES BY STORE')
    const outlets = listing(lines).filter((l) => l.startsWith('Outlet: ') || l.startsWith('Subtotal · ') || l.startsWith('Grand'))
    expect(outlets).toEqual([
      'Outlet: BSA - BSAS',
      'Subtotal · BSAS,,850.00,0.00,850.00,6,5',
      'Outlet: KLC - KLCC Isetan',
      'Subtotal · KLCC Isetan,,188.00,0.00,188.00,3,2',
      'Grand Total,,1038.00,0.00,1038.00,9,7',
    ])
  })

  it('names the file for the store and the dates', () => {
    const r = buildDetailReport(data, oneDay)
    expect(detailFilename(r, 'BSA')).toBe('legendary-product-sales-BSA-2026-11-02.csv')
    expect(detailFilename(buildDetailReport(data, twoDays))).toBe('legendary-product-sales-2026-11-01-to-2026-11-02.csv')
  })
})

describe('the PDF of it', () => {
  it('draws one outlet’s listing the way Zeoniq does: bands for the outlet and each item, a subtotal under each', () => {
    const spec = detailPrintSpec(buildDetailReport(data, oneDay), { title: 'BSAS', subtitle: '2 Nov 2026', rules: [] })
    expect(spec.sections?.map((s) => s.title)).toEqual(['Product Sales Listing', 'Payment', 'Closing stock', 'Customers'])
    const sales = spec.sections![0]
    expect(sales.note).toBe('Business Date from 2/11/2026 to 2/11/2026 · RM, excluding SST')
    expect(sales.headers).toEqual(['Business Date', 'Selling Price', 'Gross Amount', 'Discount', 'Net Sales', 'Item Qty', 'Trans. Count'])
    expect(sales.rows).toEqual([
      ['Outlet: BSA - BSAS'],
      ['Item: LGD-ORC-R30 - Orchid · 30ml'],
      ['2/11/2026', '188.00', '376.00', '0.00', '376.00', '2', '1'],
      ['2/11/2026', '198.00', '198.00', '0.00', '198.00', '1', '1'],
      ['Subtotal', '', '574.00', '0.00', '574.00', '3', '2'],
      ['Item: LGD-WIS3-R15 - Wish 3 · 15ml (FOC)'],
      ['2/11/2026', '0.00', '0.00', '0.00', '0.00', '1', '1'],
      ['Subtotal', '', '0.00', '0.00', '0.00', '1', '1'],
      ['Item: LGD-MAN-R50 - Man · 50ml'],
      ['2/11/2026', '188.00', '188.00', '0.00', '188.00', '1', '1'],
      ['Subtotal', '', '188.00', '0.00', '188.00', '1', '1'],
      ['Subtotal · BSAS', '', '762.00', '0.00', '762.00', '5', '4'],
    ])
    expect(sales.bands).toEqual([
      { row: 0, level: 'outlet' },
      { row: 1, level: 'item' },
      { row: 5, level: 'item' },
      { row: 8, level: 'item' },
    ])
    expect(sales.subtotals).toEqual([4, 7, 10, 11])
    // Days and their subtotal sit under the item, the item under the outlet.
    expect(sales.indents).toEqual([0, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1])
    expect(sales.total).toEqual(['Grand Total', '', '762.00', '0.00', '762.00', '5', '4'])
  })

  it('folds several outlets into one listing, with thousands marked', () => {
    const spec = detailPrintSpec(buildDetailReport(data, twoDays), { title: 'Analytics', subtitle: '1 to 2 Nov 2026', rules: [] })
    const sales = spec.sections!.find((s) => s.title === 'Product Sales Listing')!
    expect(sales.note).toBe('Business Date from 1/11/2026 to 2/11/2026 · RM, excluding SST · 2 outlets together; the CSV lists each outlet')
    expect(sales.rows.filter((r) => r.length === 1)).toEqual([
      ['Item: LGD-ORC-R30 - Orchid · 30ml'],
      ['Item: LGD-WIS3-R15 - Wish 3 · 15ml'],
      ['Item: LGD-WIS3-R15 - Wish 3 · 15ml (FOC)'],
      ['Item: LGD-MAN-R50 - Man · 50ml'],
    ])
    expect(sales.bands?.every((b) => b.level === 'item')).toBe(true)
    expect(sales.total).toEqual(['Grand Total', '', '1,038.00', '0.00', '1,038.00', '9', '7'])
  })

  it('prints the bands across the table and sets the rows in under them', () => {
    const spec = detailPrintSpec(buildDetailReport(data, oneDay), { title: 'BSAS', subtitle: '2 Nov 2026', rules: [] })
    const html = reportHtml(spec, 'logo.png', 'now')
    expect(html).toContain('<tr class="band outlet"><td colspan="7" style="padding-left:8px">Outlet: BSA - BSAS</td></tr>')
    expect(html).toContain('<tr class="band item"><td colspan="7" style="padding-left:22px">Item: LGD-ORC-R30 - Orchid · 30ml</td></tr>')
    expect(html).toContain('<td style="padding-left:36px">2/11/2026</td>')
    expect(html).toContain('<p class="note">Business Date from 2/11/2026 to 2/11/2026 · RM, excluding SST</p>')
  })
})
