/**
 * The detailed report behind every export (16 November): "net sales,
 * quantity, closing quantity, and customers", with its sales laid out like
 * the Zeoniq "Product Sales Listing" Davy sent on 18 November — outlet by
 * outlet, item by item, every date the item sold (and no rows for the dates
 * it did not), a subtotal under each item and each outlet, and a grand total.
 * Zeoniq's cost and gross-profit columns are left out ("no need to be exactly
 * like this"); its tax and charges are always nil here, as figures exclude SST.
 *
 * It follows the filter it is given, dates and all: one store on one day for
 * a store's page, or the Analytics filter. Days that have ended read what was
 * filed; today reads the counter, as everywhere else.
 */
import {
  eachLineIn,
  filteredClosings,
  inWindow,
  keyedMonths,
  locationMatches,
  narrowsByProduct,
  offTheShelf,
  selectArrivalsForClosing,
  selectStoreTotals,
  skuIdsFor,
  type Filter,
} from '../store/selectors'
import { CHANNELS, locationById } from '../data/locations'
import { countryByCode } from '../data/countries'
import { skuById } from '../data/products'
import { rangeIndex } from './range'
import { formatDate, monthKey, monthLabel } from './dates'
import { num, rm } from './format'
import type { CsvBlock } from './exportCsv'
import type { ReportSection, ReportSpec } from './printReport'
import type { CrmData, DateStr } from '../data/types'

/** The figures of a line of the listing, or of a subtotal (Zeoniq's columns, those that apply). */
export interface ListingSums {
  /** Units at the price they went for, SST excluded. */
  gross: number
  /** Nothing is discounted at the counter: a sale's price is its price. Kept so the columns read as Zeoniq's. */
  discount: number
  net: number
  units: number
  /** The sales it was part of. A subtotal adds up its lines, as Zeoniq's does. */
  transactions: number
}

/** One date an item sold at an outlet, at one price. */
export interface ListingRow extends ListingSums {
  day: DateStr
  /** What one went for; 0 where it was given free. */
  unitPrice: number
}

/**
 * An item at an outlet: a product, or what of it was given free of charge,
 * kept apart as an item of its own as Zeoniq keeps its F.O.C. items.
 */
export interface ListingItem {
  skuId: string
  code: string
  /** "Wish 3 · 15ml", or "Wish 3 · 15ml (FOC)". */
  label: string
  free: boolean
  /** By date, then the price most of it went at. */
  rows: ListingRow[]
  subtotal: ListingSums
}

export interface ListingOutlet {
  locationId: string
  code: string
  name: string
  /** In the range's order, what was sold before what was given. */
  items: ListingItem[]
  subtotal: ListingSums
}

export interface ProductTotal {
  skuId: string
  label: string
  code: string
  units: number
  revenue: number
}

export interface PaymentRow {
  day: DateStr
  locationId: string
  cash: number
  card: number
  ewallet: number
  total: number
}

export interface StockDetailRow {
  day: DateStr
  locationId: string
  skuId: string
  label: string
  code: string
  /** Off the shelf that day: sold, and written off. */
  deducted: number
  /** Counted at the close. */
  onHand: number
}

export interface PartnerMonthLine {
  month: string
  locationId: string
  revenue: number
}

export interface CustomerRow {
  countryCode: string
  name: string
  customers: number
  units: number
  revenue: number
}

export interface StoreLine {
  locationId: string
  units: number
  revenue: number
  customers: number
}

export interface DetailReport {
  from: DateStr
  to: DateStr
  /** The product sales listing: each outlet that sold, by name. */
  outlets: ListingOutlet[]
  grandTotal: ListingSums
  /** Each product across the outlets, sold and given alike, in the range's order. */
  products: ProductTotal[]
  payment: PaymentRow[]
  stock: StockDetailRow[]
  /** Dealers' and consignment partners' months keyed in, where nothing narrows by product or country. */
  partners: PartnerMonthLine[]
  /** Every country, most customers first. */
  customers: CustomerRow[]
  /** Each store that sold in the dates, its total, the best first (16 November: "the total amount of each store"). */
  stores: StoreLine[]
  /** Units and sales of the lines; revenue also takes in the partners' months. Customers: one a sale. */
  totals: { units: number; revenue: number; linesRevenue: number; customers: number }
}

const sen = (n: number) => Math.round(n * 100) / 100
const storeName = (id: string) => locationById(id)?.name ?? id
const LAST = Number.MAX_SAFE_INTEGER
/** The main stores, then consignment, then the dealers, as the app lists them. */
const channelRank = (id: string) => {
  const channel = locationById(id)?.channel
  return channel ? CHANNELS.indexOf(channel) : CHANNELS.length
}

const NOTHING: ListingSums = { gross: 0, discount: 0, net: 0, units: 0, transactions: 0 }

const sumOf = (xs: ListingSums[]): ListingSums =>
  xs.reduce(
    (a, x) => ({
      gross: sen(a.gross + x.gross),
      discount: sen(a.discount + x.discount),
      net: sen(a.net + x.net),
      units: a.units + x.units,
      transactions: a.transactions + x.transactions,
    }),
    NOTHING,
  )

/** By date; on one date, the price most went at first. */
const rowOrder = (a: ListingRow, b: ListingRow) =>
  (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || b.units - a.units || b.unitPrice - a.unitPrice

/** In the range's order; a product's free units straight after what it sold. */
const itemOrder = () => {
  const at = rangeIndex()
  return (a: ListingItem, b: ListingItem) =>
    (at.get(a.skuId) ?? LAST) - (at.get(b.skuId) ?? LAST) || Number(a.free) - Number(b.free) || a.label.localeCompare(b.label)
}

const itemOf = (skuId: string, free: boolean, rows: ListingRow[]): ListingItem => {
  const sku = skuById(skuId)
  const label = sku?.label ?? skuId
  const sorted = [...rows].sort(rowOrder)
  return { skuId, code: sku?.code ?? '', label: free ? `${label} (FOC)` : label, free, rows: sorted, subtotal: sumOf(sorted) }
}

/**
 * Several outlets' listings as one, item by item and date by date — for a
 * printed report of several outlets, which would otherwise run to a listing
 * of every outlet in turn. The CSV keeps each outlet.
 */
export function foldOutlets(outlets: ListingOutlet[]): ListingItem[] {
  const items = new Map<string, { skuId: string; free: boolean; rows: Map<string, ListingRow> }>()
  for (const o of outlets) {
    for (const i of o.items) {
      const key = `${i.skuId}::${i.free}`
      const item = items.get(key) ?? { skuId: i.skuId, free: i.free, rows: new Map<string, ListingRow>() }
      items.set(key, item)
      for (const r of i.rows) {
        const at = `${r.day}::${r.unitPrice}`
        const was = item.rows.get(at)
        item.rows.set(at, was ? { ...sumOf([was, r]), day: r.day, unitPrice: r.unitPrice } : { ...r })
      }
    }
  }
  return [...items.values()].map((i) => itemOf(i.skuId, i.free, [...i.rows.values()])).sort(itemOrder())
}

export function buildDetailReport(data: CrmData, f: Filter): DetailReport {
  const at = rangeIndex()
  const place = (skuId: string) => at.get(skuId) ?? LAST

  // ── Sales, line by line: outlet, item, then the date and price ───────────
  type Tally = { day: DateStr; unitPrice: number; units: number; value: number; sales: Set<string> }
  const listing = new Map<string, Map<string, { skuId: string; free: boolean; rows: Map<string, Tally> }>>()
  const baskets = new Set<string>()
  const nations = new Map<string, { baskets: Set<string>; units: number; revenue: number }>()
  eachLineIn(data, f, (l, value, basket, locationId, day) => {
    baskets.add(basket)
    if (l.countryCode) {
      const n = nations.get(l.countryCode) ?? { baskets: new Set<string>(), units: 0, revenue: 0 }
      n.baskets.add(basket)
      n.units += l.qty
      n.revenue += value
      nations.set(l.countryCode, n)
    }
    if (l.qty <= 0) return
    const unitPrice = sen(value / l.qty)
    const free = unitPrice === 0
    const outlet = listing.get(locationId) ?? new Map()
    listing.set(locationId, outlet)
    const itemKey = `${l.skuId}::${free}`
    const item = outlet.get(itemKey) ?? { skuId: l.skuId, free, rows: new Map<string, Tally>() }
    outlet.set(itemKey, item)
    const rowKey = `${day}::${unitPrice}`
    const row = item.rows.get(rowKey) ?? { day, unitPrice, units: 0, value: 0, sales: new Set<string>() }
    item.rows.set(rowKey, row)
    row.units += l.qty
    row.value += value
    row.sales.add(basket)
  })
  const order = itemOrder()
  const outlets: ListingOutlet[] = [...listing.entries()]
    .map(([locationId, items]) => {
      const list = [...items.values()]
        .map((i) =>
          itemOf(
            i.skuId,
            i.free,
            [...i.rows.values()].map((r) => {
              const net = sen(r.value)
              return { day: r.day, unitPrice: r.unitPrice, gross: net, discount: 0, net, units: r.units, transactions: r.sales.size }
            }),
          ),
        )
        .sort(order)
      return {
        locationId,
        code: locationById(locationId)?.code ?? '',
        name: storeName(locationId),
        items: list,
        subtotal: sumOf(list.map((i) => i.subtotal)),
      }
    })
    .sort((a, b) => channelRank(a.locationId) - channelRank(b.locationId) || a.name.localeCompare(b.name))
  const grandTotal = sumOf(outlets.map((o) => o.subtotal))

  const byProduct = new Map<string, ProductTotal>()
  for (const i of outlets.flatMap((o) => o.items)) {
    const sku = skuById(i.skuId)
    const p = byProduct.get(i.skuId) ?? { skuId: i.skuId, label: sku?.label ?? i.skuId, code: sku?.code ?? '', units: 0, revenue: 0 }
    p.units += i.subtotal.units
    p.revenue = sen(p.revenue + i.subtotal.net)
    byProduct.set(i.skuId, p)
  }
  const products = [...byProduct.values()].sort((a, b) => place(a.skuId) - place(b.skuId))

  // ── The closings: payment and the shelf ──────────────────────────────────
  const keyed = keyedMonths(data)
  const allowed = skuIdsFor(f)
  const closings = filteredClosings(data, f)
    .filter((c) => c.periodType === 'day' && !keyed.has(`${c.locationId}::${monthKey(c.period)}`))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : storeName(a.locationId).localeCompare(storeName(b.locationId))))
  const payment: PaymentRow[] = closings
    .filter((c) => c.tender)
    .map((c) => {
      const { cash, card, ewallet } = c.tender!
      return { day: c.period, locationId: c.locationId, cash, card, ewallet, total: sen(cash + card + ewallet) }
    })
  const stock: StockDetailRow[] = []
  for (const c of closings) {
    // As the store's page has it: a vial's from its count, where more went than was rung up (26 November).
    const off = new Map<string, number>()
    const shelf = offTheShelf(
      [...c.lines, ...c.writeOffs],
      c.stockCount,
      selectArrivalsForClosing(data, c.locationId, c.period, c.submittedAt),
    )
    for (const l of shelf) off.set(l.skuId, (off.get(l.skuId) ?? 0) + l.qty)
    const rows = c.stockCount
      .filter((s) => allowed.has(s.skuId))
      .map((s) => {
        const sku = skuById(s.skuId)
        return {
          day: c.period,
          locationId: c.locationId,
          skuId: s.skuId,
          label: sku?.label ?? s.skuId,
          code: sku?.code ?? '',
          deducted: off.get(s.skuId) ?? 0,
          onHand: s.counted,
        }
      })
      .sort((a, b) => place(a.skuId) - place(b.skuId))
    stock.push(...rows)
  }

  // ── Dealers' and consignment partners' months ────────────────────────────
  const partners: PartnerMonthLine[] = narrowsByProduct(f)
    ? []
    : data.partnerSales
        .filter((p) => inWindow(`${p.month}-01`, f) && locationMatches(p.locationId, f))
        .map((p) => ({ month: p.month, locationId: p.locationId, revenue: p.revenueMYR }))
        .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : storeName(a.locationId).localeCompare(storeName(b.locationId))))

  const customers: CustomerRow[] = [...nations.entries()]
    .map(([countryCode, n]) => ({
      countryCode,
      name: countryByCode(countryCode)?.name ?? countryCode,
      customers: n.baskets.size,
      units: n.units,
      revenue: sen(n.revenue),
    }))
    .sort((a, b) => b.customers - a.customers || b.units - a.units || a.name.localeCompare(b.name))

  const stores: StoreLine[] = selectStoreTotals(data, f)
    .filter((s) => s.revenue > 0 || s.units > 0)
    .map((s) => ({ locationId: s.locationId, units: s.units, revenue: s.revenue, customers: s.customers }))

  return {
    from: f.from,
    to: f.to,
    outlets,
    grandTotal,
    products,
    payment,
    stock,
    partners,
    customers,
    stores,
    totals: {
      units: grandTotal.units,
      linesRevenue: grandTotal.net,
      revenue: sen(grandTotal.net + partners.reduce((a, p) => a + p.revenue, 0)),
      customers: baskets.size,
    },
  }
}

// ── Shared by the CSV and the PDF ────────────────────────────────────────────

/** 2/11/2026: day, month, year, as Zeoniq writes a business date. */
const dmy = (day: DateStr) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}/${day.slice(0, 4)}`

const LISTING_HEADERS = ['Business Date', 'Selling Price', 'Gross Amount', 'Discount', 'Net Sales', 'Item Qty', 'Trans. Count']
const outletBand = (o: ListingOutlet) => `Outlet: ${o.code ? `${o.code} - ` : ''}${o.name}`
const itemBand = (i: ListingItem) => `Item: ${i.code ? `${i.code} - ` : ''}${i.label}`
const outletSubtotal = (o: ListingOutlet) => `Subtotal · ${o.name}`
const datesLine = (r: DetailReport) => `Business Date from ${dmy(r.from)} to ${dmy(r.to)}`

// ── The CSV ──────────────────────────────────────────────────────────────────

/**
 * The report as a CSV of several parts, one after another: what it is and
 * the dates it covers, each store's total where there are several, the
 * product sales listing, the partners' months, payment, the shelf at each
 * close, and the customers. `heading` adds lines under the dates, such as the
 * store or the rules it was drawn up with. Dates in the listing are written
 * 2026-11-02, which Excel reads as a date in any setting and shows the
 * Malaysian way, 2/11/2026.
 */
export function detailCsvBlocks(r: DetailReport, heading: (string | number)[][] = []): CsvBlock[] {
  const code = (id: string) => locationById(id)?.code ?? ''
  const money = (n: number) => n.toFixed(2)
  const figures = (s: ListingSums) => [money(s.gross), money(s.discount), money(s.net), s.units, s.transactions]
  const blocks: CsvBlock[] = [
    {
      rows: [
        ['Product Sales Listing'],
        ['Legendary Retail CRM'],
        [`Filters: ${datesLine(r)}`],
        ...heading,
        ['Figures are in RM, excluding SST. Nothing is discounted at the counter, so Gross Amount and Net Sales agree.'],
        ['Trans. Count is how many sales a line was part of. Days that have ended are as filed; today is as it stands.'],
      ],
    },
  ]
  if (r.stores.length > 1) {
    blocks.push({
      title: 'SALES BY STORE',
      headers: ['Store', 'Store code', 'Units', 'Customers', 'Net sales MYR'],
      rows: [
        ...r.stores.map((s) => [storeName(s.locationId), code(s.locationId), s.units, s.customers, s.revenue]),
        [
          'Total',
          '',
          r.stores.reduce((a, s) => a + s.units, 0),
          r.stores.reduce((a, s) => a + s.customers, 0),
          sen(r.stores.reduce((a, s) => a + s.revenue, 0)),
        ],
      ],
    })
  }
  const listing: (string | number)[][] = []
  for (const o of r.outlets) {
    listing.push([outletBand(o)])
    for (const i of o.items) {
      listing.push([itemBand(i)])
      for (const row of i.rows) listing.push([row.day, money(row.unitPrice), ...figures(row)])
      listing.push(['Subtotal', '', ...figures(i.subtotal)])
    }
    listing.push([outletSubtotal(o), '', ...figures(o.subtotal)])
  }
  listing.push(['Grand Total', '', ...figures(r.grandTotal)])
  blocks.push({ title: 'PRODUCT SALES LISTING', headers: LISTING_HEADERS, rows: listing })
  if (r.partners.length) {
    blocks.push({
      title: 'CONSIGNMENT AND DEALERS (KEYED IN MONTHLY)',
      headers: ['Month', 'Partner', 'Code', 'Net sales MYR'],
      rows: [
        ...r.partners.map((p) => [p.month, storeName(p.locationId), code(p.locationId), p.revenue]),
        ['Total', '', '', sen(r.partners.reduce((a, p) => a + p.revenue, 0))],
      ],
    })
  }
  if (r.payment.length) {
    const sum = (k: 'cash' | 'card' | 'ewallet' | 'total') => sen(r.payment.reduce((a, p) => a + p[k], 0))
    blocks.push({
      title: 'PAYMENT (AS FILED AT EACH CLOSE)',
      headers: ['Business date', 'Store', 'Store code', 'Cash MYR', 'Card MYR', 'E-wallet MYR', 'Total MYR'],
      rows: [
        ...r.payment.map((p) => [p.day, storeName(p.locationId), code(p.locationId), p.cash, p.card, p.ewallet, p.total]),
        ['Total', '', '', sum('cash'), sum('card'), sum('ewallet'), sum('total')],
      ],
    })
  }
  if (r.stock.length) {
    blocks.push({
      title: 'CLOSING STOCK (AS COUNTED AT EACH CLOSE)',
      headers: ['Business date', 'Store', 'Store code', 'Product', 'Code', 'Deducted', 'On hand at close'],
      rows: r.stock.map((s) => [s.day, storeName(s.locationId), code(s.locationId), s.label, s.code, s.deducted, s.onHand]),
    })
  }
  blocks.push({
    title: 'CUSTOMERS',
    headers: ['Country', 'Customers', 'Units', 'Net sales MYR'],
    rows: [
      ...r.customers.map((c) => [c.name, c.customers, c.units, c.revenue]),
      [
        'Total',
        r.customers.reduce((a, c) => a + c.customers, 0),
        r.customers.reduce((a, c) => a + c.units, 0),
        sen(r.customers.reduce((a, c) => a + c.revenue, 0)),
      ],
    ],
  })
  return blocks
}

/** A file name for the report: the store's code, if one, and the dates. */
export const detailFilename = (r: DetailReport, storeCode?: string): string =>
  `legendary-product-sales-${storeCode ? `${storeCode}-` : ''}${r.from === r.to ? r.from : `${r.from}-to-${r.to}`}.csv`

// ── The PDF ──────────────────────────────────────────────────────────────────

/**
 * The report drawn up to print or keep as a PDF: the figures in boxes, the
 * rules, the best sellers as bars, then the same parts as the CSV. The
 * listing is drawn as Zeoniq draws it — a band for the outlet and for each
 * item, the dates set in under the item, a subtotal under each. Where the
 * report takes in several outlets, they are folded into one listing, so a
 * month of every store stays readable; the CSV keeps each outlet. The shelf
 * is printed for a single day, where it is one count per product.
 */
export function detailPrintSpec(r: DetailReport, opts: { title: string; subtitle: string; rules: string[] }): ReportSpec {
  const sections: ReportSection[] = []

  // Every store's total, where there is more than one.
  if (r.stores.length > 1) {
    sections.push({
      title: 'Sales by store',
      headers: ['Store', 'Units', 'Customers', 'Net sales'],
      right: [false, true, true, true],
      rows: r.stores.map((s) => [storeName(s.locationId), num(s.units), num(s.customers), rm(s.revenue)]),
      total: [
        'Total',
        num(r.stores.reduce((a, s) => a + s.units, 0)),
        num(r.stores.reduce((a, s) => a + s.customers, 0)),
        rm(r.stores.reduce((a, s) => a + s.revenue, 0)),
      ],
    })
  }

  // The product sales listing.
  const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const figures = (s: ListingSums) => [money(s.gross), money(s.discount), money(s.net), num(s.units), num(s.transactions)]
  const rows: string[][] = []
  const bands: NonNullable<ReportSection['bands']> = []
  const indents: number[] = []
  const subtotals: number[] = []
  const put = (row: string[], indent: number, kind?: 'outlet' | 'item' | 'subtotal') => {
    if (kind === 'subtotal') subtotals.push(rows.length)
    else if (kind) bands.push({ row: rows.length, level: kind })
    indents.push(indent)
    rows.push(row)
  }
  const putItem = (i: ListingItem, indent: number) => {
    put([itemBand(i)], indent, 'item')
    for (const row of i.rows) put([dmy(row.day), money(row.unitPrice), ...figures(row)], indent + 1)
    put(['Subtotal', '', ...figures(i.subtotal)], indent + 1, 'subtotal')
  }
  const folded = r.outlets.length > 1
  if (folded) {
    for (const i of foldOutlets(r.outlets)) putItem(i, 0)
  } else {
    for (const o of r.outlets) {
      put([outletBand(o)], 0, 'outlet')
      for (const i of o.items) putItem(i, 1)
      put([outletSubtotal(o), '', ...figures(o.subtotal)], 1, 'subtotal')
    }
  }
  sections.push({
    title: 'Product Sales Listing',
    note: `${datesLine(r)} · RM, excluding SST${folded ? ` · ${r.outlets.length} outlets together; the CSV lists each outlet` : ''}`,
    headers: LISTING_HEADERS,
    right: [false, true, true, true, true, true, true],
    rows,
    bands,
    indents,
    subtotals,
    total: ['Grand Total', '', ...figures(r.grandTotal)],
  })

  if (r.partners.length) {
    sections.push({
      title: 'Consignment and dealers, keyed in monthly',
      headers: ['Month', 'Partner', 'Net sales'],
      right: [false, false, true],
      rows: r.partners.map((p) => [monthLabel(p.month), storeName(p.locationId), rm(p.revenue)]),
      total: ['Total', '', rm(r.partners.reduce((a, p) => a + p.revenue, 0))],
    })
  }

  if (r.payment.length) {
    const ewallet = r.payment.some((p) => p.ewallet > 0)
    const sum = (k: 'cash' | 'card' | 'ewallet' | 'total') => rm(r.payment.reduce((a, p) => a + p[k], 0))
    sections.push({
      title: 'Payment',
      headers: ['Business date', 'Store', 'Cash', 'Card', ...(ewallet ? ['E-wallet'] : []), 'Total'],
      right: [false, false, true, true, ...(ewallet ? [true] : []), true],
      rows: r.payment.map((p) => [
        formatDate(p.day),
        locationById(p.locationId)?.shortName ?? p.locationId,
        rm(p.cash),
        rm(p.card),
        ...(ewallet ? [rm(p.ewallet)] : []),
        rm(p.total),
      ]),
      total: ['Total', '', sum('cash'), sum('card'), ...(ewallet ? [sum('ewallet')] : []), sum('total')],
    })
  }

  if (r.from === r.to && r.stock.length) {
    const stores = new Set(r.stock.map((s) => s.locationId)).size > 1
    sections.push({
      title: 'Closing stock',
      headers: ['Product', ...(stores ? ['Store'] : []), 'Deducted', 'On hand at close'],
      right: [false, ...(stores ? [false] : []), true, true],
      rows: r.stock.map((s) => [
        s.label,
        ...(stores ? [locationById(s.locationId)?.shortName ?? s.locationId] : []),
        s.deducted ? `−${num(s.deducted)}` : '0',
        num(s.onHand),
      ]),
      total: [
        'Total',
        ...(stores ? [''] : []),
        `−${num(r.stock.reduce((a, s) => a + s.deducted, 0))}`,
        num(r.stock.reduce((a, s) => a + s.onHand, 0)),
      ],
    })
  }

  sections.push({
    title: 'Customers',
    headers: ['Country', 'Customers', 'Units', 'Net sales'],
    right: [false, true, true, true],
    rows: r.customers.map((c) => [c.name, num(c.customers), num(c.units), rm(c.revenue)]),
    total: [
      'Total',
      num(r.customers.reduce((a, c) => a + c.customers, 0)),
      num(r.customers.reduce((a, c) => a + c.units, 0)),
      rm(r.customers.reduce((a, c) => a + c.revenue, 0)),
    ],
  })

  const cash = r.payment.reduce((a, p) => a + p.cash, 0)
  const card = r.payment.reduce((a, p) => a + p.card, 0)
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    boxes: [
      { label: 'Sales', value: rm(r.totals.revenue), note: r.partners.length ? 'consignment and dealers’ months included' : undefined },
      { label: 'Units', value: num(r.totals.units) },
      { label: 'Customers', value: num(r.totals.customers) },
      r.payment.length
        ? { label: 'Cash · Card', value: `${rm(cash)} · ${rm(card)}`, note: 'as filed at each close' }
        : { label: 'Products sold', value: num(r.products.length) },
    ],
    rules: opts.rules,
    chart: {
      title: 'Best sellers in these dates',
      bars: [...r.products]
        .filter((p) => p.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 12)
        .map((p) => ({ label: p.label, value: p.revenue, display: rm(p.revenue) })),
    },
    sections,
  }
}
