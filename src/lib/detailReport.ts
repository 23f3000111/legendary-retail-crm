/**
 * The detailed report behind every export (16 November): "net sales,
 * quantity, closing quantity, and customers", laid out like the Zeoniq report
 * Davy showed — each product, every date it sold with its selling price and
 * net sales, a subtotal for every product, and no rows for what did not sell.
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
  skuIdsFor,
  type Filter,
} from '../store/selectors'
import { locationById } from '../data/locations'
import { countryByCode } from '../data/countries'
import { skuById } from '../data/products'
import { rangeIndex } from './range'
import { formatDate, monthKey, monthLabel } from './dates'
import { num, rm } from './format'
import type { CsvBlock } from './exportCsv'
import type { ReportSection, ReportSpec } from './printReport'
import type { CrmData, DateStr } from '../data/types'

export interface SalesDetailRow {
  skuId: string
  label: string
  code: string
  day: DateStr
  locationId: string
  units: number
  /** What one went for. */
  unitPrice: number
  revenue: number
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

export interface DetailReport {
  from: DateStr
  to: DateStr
  /** Product by product in the range's order, then by day, store and price. */
  sales: SalesDetailRow[]
  /** Each product's subtotal, in the same order. */
  products: ProductTotal[]
  payment: PaymentRow[]
  stock: StockDetailRow[]
  /** Dealers' and consignment partners' months keyed in, where nothing narrows by product or country. */
  partners: PartnerMonthLine[]
  /** Every country, most customers first. */
  customers: CustomerRow[]
  /** Units and sales of the lines; revenue also takes in the partners' months. Customers: one a sale. */
  totals: { units: number; revenue: number; linesRevenue: number; customers: number }
}

const sen = (n: number) => Math.round(n * 100) / 100
const storeName = (id: string) => locationById(id)?.name ?? id
const LAST = Number.MAX_SAFE_INTEGER

export function buildDetailReport(data: CrmData, f: Filter): DetailReport {
  const at = rangeIndex()
  const place = (skuId: string) => at.get(skuId) ?? LAST

  // ── Sales, line by line ──────────────────────────────────────────────────
  const sales = new Map<string, SalesDetailRow>()
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
    const key = `${l.skuId}::${day}::${locationId}::${unitPrice}`
    const sku = skuById(l.skuId)
    const row = sales.get(key) ?? {
      skuId: l.skuId,
      label: sku?.label ?? l.skuId,
      code: sku?.code ?? '',
      day,
      locationId,
      units: 0,
      unitPrice,
      revenue: 0,
    }
    row.units += l.qty
    row.revenue += value
    sales.set(key, row)
  })
  const salesRows = [...sales.values()]
    .filter((r) => r.units > 0)
    .map((r) => ({ ...r, revenue: sen(r.revenue) }))
    .sort(
      (a, b) =>
        place(a.skuId) - place(b.skuId) ||
        (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
        storeName(a.locationId).localeCompare(storeName(b.locationId)) ||
        b.units - a.units ||
        b.unitPrice - a.unitPrice,
    )
  const products: ProductTotal[] = []
  for (const r of salesRows) {
    const last = products[products.length - 1]
    if (last?.skuId === r.skuId) {
      last.units += r.units
      last.revenue = sen(last.revenue + r.revenue)
    } else products.push({ skuId: r.skuId, label: r.label, code: r.code, units: r.units, revenue: r.revenue })
  }

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
    const off = new Map<string, number>()
    for (const l of [...c.lines, ...c.writeOffs]) off.set(l.skuId, (off.get(l.skuId) ?? 0) + l.qty)
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

  const linesRevenue = sen(products.reduce((a, p) => a + p.revenue, 0))
  return {
    from: f.from,
    to: f.to,
    sales: salesRows,
    products,
    payment,
    stock,
    partners,
    customers,
    totals: {
      units: products.reduce((a, p) => a + p.units, 0),
      linesRevenue,
      revenue: sen(linesRevenue + partners.reduce((a, p) => a + p.revenue, 0)),
      customers: baskets.size,
    },
  }
}

// ── The CSV ──────────────────────────────────────────────────────────────────

/**
 * The report as a CSV of several parts, one after another: what it is, sales
 * by product with a subtotal under each, the partners' months, payment, the
 * shelf at each close, and the customers. `heading` adds lines to the top,
 * such as the store or the rules it was drawn up with.
 */
export function detailCsvBlocks(r: DetailReport, heading: (string | number)[][] = []): CsvBlock[] {
  const code = (id: string) => locationById(id)?.code ?? ''
  const blocks: CsvBlock[] = [
    {
      rows: [
        ['Legendary Retail CRM — sales detail'],
        ['Dates', r.from, r.to],
        ...heading,
        ['Days that have ended are as filed; today is as it stands. Figures exclude SST.'],
      ],
    },
  ]
  const salesRows: (string | number)[][] = []
  for (const p of r.products) {
    for (const s of r.sales.filter((x) => x.skuId === p.skuId)) {
      salesRows.push([s.label, s.code, s.day, storeName(s.locationId), code(s.locationId), s.units, s.unitPrice, s.revenue])
    }
    salesRows.push([`Subtotal · ${p.label}`, p.code, '', '', '', p.units, '', p.revenue])
  }
  salesRows.push(['Total', '', '', '', '', r.totals.units, '', r.totals.linesRevenue])
  blocks.push({
    title: 'SALES BY PRODUCT',
    headers: ['Product', 'Code', 'Business date', 'Store', 'Store code', 'Units', 'Selling price MYR', 'Net sales MYR'],
    rows: salesRows,
  })
  if (r.partners.length) {
    blocks.push({
      title: 'DEALERS AND CONSIGNMENT (KEYED IN MONTHLY)',
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
  `legendary-sales-detail-${storeCode ? `${storeCode}-` : ''}${r.from === r.to ? r.from : `${r.from}-to-${r.to}`}.csv`

// ── The PDF ──────────────────────────────────────────────────────────────────

/**
 * The report drawn up to print or keep as a PDF: the figures in boxes, the
 * rules, the best sellers as bars, then the same parts as the CSV. Unless
 * `perStore`, the stores are folded together, product by product and day by
 * day, so a month of every store stays readable; the CSV keeps every store.
 * The shelf is printed for a single day, where it is one count per product.
 */
export function detailPrintSpec(
  r: DetailReport,
  opts: { title: string; subtitle: string; rules: string[]; perStore: boolean },
): ReportSpec {
  const sections: ReportSection[] = []

  // Sales by product, with a subtotal under each.
  const rows: string[][] = []
  const subtotals: number[] = []
  for (const p of r.products) {
    const lines = r.sales.filter((s) => s.skuId === p.skuId)
    const merged = new Map<string, { day: DateStr; locationId: string; units: number; unitPrice: number; revenue: number }>()
    for (const s of lines) {
      const key = opts.perStore ? `${s.day}::${s.locationId}::${s.unitPrice}` : `${s.day}::${s.unitPrice}`
      const m = merged.get(key) ?? { day: s.day, locationId: s.locationId, units: 0, unitPrice: s.unitPrice, revenue: 0 }
      m.units += s.units
      m.revenue = sen(m.revenue + s.revenue)
      merged.set(key, m)
    }
    for (const m of merged.values()) {
      rows.push([
        p.label,
        formatDate(m.day),
        ...(opts.perStore ? [locationById(m.locationId)?.shortName ?? m.locationId] : []),
        num(m.units),
        m.unitPrice ? rm(m.unitPrice) : 'FOC',
        rm(m.revenue),
      ])
    }
    subtotals.push(rows.length)
    rows.push([`Subtotal · ${p.label}`, '', ...(opts.perStore ? [''] : []), num(p.units), '', rm(p.revenue)])
  }
  sections.push({
    title: 'Sales by product',
    headers: ['Product', 'Business date', ...(opts.perStore ? ['Store'] : []), 'Units', 'Selling price', 'Net sales'],
    right: [false, false, ...(opts.perStore ? [false] : []), true, true, true],
    rows,
    subtotals,
    total: ['Total', '', ...(opts.perStore ? [''] : []), num(r.totals.units), '', rm(r.totals.linesRevenue)],
  })

  if (r.partners.length) {
    sections.push({
      title: 'Dealers and consignment, keyed in monthly',
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
      { label: 'Sales', value: rm(r.totals.revenue), note: r.partners.length ? 'dealers’ and consignment months included' : undefined },
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
