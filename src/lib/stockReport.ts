/**
 * The Stock page's report (22 November: "this exported report in Davy, Kelly
 * and Chloe's page should give the breakdown output like the report made in
 * finance page"). It used to be one grid, a product a row and a store a
 * column. Now it reads like the Product Sales Listing behind Finance's
 * reports: each store under its own band, every product under it as the page
 * lists it, a subtotal under each store, and a grand total. A table of the
 * stores comes first and each product across the stores last, where there is
 * more than one store.
 *
 * It is the page's own figures: the count at each store's last closing, the
 * pace over 30 days, and the top-up suggested in whole cases. A count for
 * visibility only; SQL Accounting remains the record of what stock is worth.
 */
import { selectStock, type StockRow } from '../store/selectors'
import { locationById } from '../data/locations'
import { formatDate } from './dates'
import { num } from './format'
import type { CsvBlock } from './exportCsv'
import type { ReportSection, ReportSpec } from './printReport'
import type { CrmData, DateStr } from '../data/types'

export interface StockSums {
  /** Units counted. */
  onHand: number
  /** Products counted at or below their reorder level, the empty included. */
  atOrBelow: number
  out: number
  /** Units suggested, in whole cases. */
  suggested: number
  /** Products the store has never counted. */
  notCounted: number
}

export interface StockStore {
  locationId: string
  code: string
  name: string
  /** The closing the count comes from; null for a store that has filed none. */
  countedOn: DateStr | null
  rows: StockRow[]
  subtotal: StockSums
}

export interface StockProductTotal {
  skuId: string
  label: string
  code: string
  onHand: number
  suggested: number
  /** How many of the stores have it at or below its reorder level. */
  storesLow: number
}

export interface StockReport {
  asAt: DateStr
  stores: StockStore[]
  /** Each product across the stores, as the page lists them. */
  products: StockProductTotal[]
  total: StockSums
}

export const STOCK_STATUS_WORD: Record<StockRow['status'], string> = {
  ok: 'Healthy',
  low: 'Low',
  critical: 'Very low',
  out: 'Out of stock',
}

const statusWord = (r: StockRow) =>
  !r.counted ? 'Not counted yet' : r.workedOut ? `${STOCK_STATUS_WORD[r.status]} · worked out` : STOCK_STATUS_WORD[r.status]
const lowOrOut = (r: StockRow) => r.counted && r.status !== 'ok'

const sumsOf = (rows: StockRow[]): StockSums => ({
  onHand: rows.reduce((a, r) => a + (r.counted ? r.onHand : 0), 0),
  atOrBelow: rows.filter(lowOrOut).length,
  out: rows.filter((r) => r.counted && r.status === 'out').length,
  suggested: rows.reduce((a, r) => a + r.suggested, 0),
  notCounted: rows.filter((r) => !r.counted).length,
})

const addUp = (xs: StockSums[]): StockSums =>
  xs.reduce(
    (a, x) => ({
      onHand: a.onHand + x.onHand,
      atOrBelow: a.atOrBelow + x.atOrBelow,
      out: a.out + x.out,
      suggested: a.suggested + x.suggested,
      notCounted: a.notCounted + x.notCounted,
    }),
    { onHand: 0, atOrBelow: 0, out: 0, suggested: 0, notCounted: 0 },
  )

/** The stores asked for, in that order, each as the Stock page shows it. */
export function buildStockReport(data: CrmData, locationIds: string[]): StockReport {
  const stores = locationIds.map((id): StockStore => {
    const l = locationById(id)
    const rows = selectStock(data, id)
    const latest = data.closings
      .filter((c) => c.locationId === id)
      .reduce<DateStr | null>((a, c) => (a === null || c.period > a ? c.period : a), null)
    return { locationId: id, code: l?.code ?? '', name: l?.name ?? id, countedOn: latest, rows, subtotal: sumsOf(rows) }
  })
  const products = (stores[0]?.rows ?? []).map((first): StockProductTotal => {
    const at = stores.map((s) => s.rows.find((r) => r.skuId === first.skuId)).filter((r): r is StockRow => Boolean(r))
    return {
      skuId: first.skuId,
      label: first.label,
      code: first.code,
      onHand: at.reduce((a, r) => a + (r.counted ? r.onHand : 0), 0),
      suggested: at.reduce((a, r) => a + r.suggested, 0),
      storesLow: at.filter(lowOrOut).length,
    }
  })
  return { asAt: data.today, stores, products, total: addUp(stores.map((s) => s.subtotal)) }
}

const outletBand = (s: StockStore) => `Outlet: ${s.code ? `${s.code} - ` : ''}${s.name}`
const outletSubtotal = (s: StockStore) => `Subtotal · ${s.name}`
const cover = (r: StockRow) => (!r.counted ? '' : r.daysCover === null ? 'not moving' : r.daysCover.toFixed(1))
const lowWords = (n: number) => `${n} at or below reorder`

const LISTING_HEADERS = ['Product', 'Code', 'On hand', 'Per day', 'Days left', 'Reorder at', 'Status', 'Suggested']

// ── The CSV ──────────────────────────────────────────────────────────────────

/** The report as a CSV of several parts, as Finance's are. */
export function stockCsvBlocks(r: StockReport): CsvBlock[] {
  const several = r.stores.length > 1
  const blocks: CsvBlock[] = [
    {
      rows: [
        ['Stock on hand'],
        ['Legendary Retail CRM'],
        [`As at ${r.asAt}, as counted at each store's last closing`],
        [several ? `Stores: ${r.stores.length} main stores` : `Store: ${r.stores[0]?.name ?? ''}`],
        ['A count for visibility only: SQL Accounting remains the record of what stock is worth.'],
        ['Per day is the pace over the last 30 days. Suggested tops up to three weeks, at least twice the reorder level, less what is on its way, in whole cases.'],
      ],
    },
  ]
  if (several) {
    blocks.push({
      title: 'STOCK BY STORE',
      headers: ['Store', 'Store code', 'Counted at the close of', 'Units on hand', 'At or below reorder', 'Out of stock', 'Suggested top-up'],
      rows: [
        ...r.stores.map((s) => [s.name, s.code, s.countedOn ?? 'never filed', s.subtotal.onHand, s.subtotal.atOrBelow, s.subtotal.out, s.subtotal.suggested]),
        ['Total', '', '', r.total.onHand, r.total.atOrBelow, r.total.out, r.total.suggested],
      ],
    })
  }
  const listing: (string | number)[][] = []
  for (const s of r.stores) {
    listing.push([outletBand(s)])
    for (const row of s.rows) {
      listing.push([
        row.label,
        row.code,
        row.counted ? row.onHand : '',
        row.counted ? Number(row.velocity.toFixed(1)) : '',
        cover(row),
        row.reorderPoint,
        statusWord(row),
        row.suggested,
      ])
    }
    listing.push([outletSubtotal(s), '', s.subtotal.onHand, '', '', '', lowWords(s.subtotal.atOrBelow), s.subtotal.suggested])
  }
  listing.push(['Grand Total', '', r.total.onHand, '', '', '', lowWords(r.total.atOrBelow), r.total.suggested])
  blocks.push({ title: 'STOCK LISTING', headers: LISTING_HEADERS, rows: listing })
  if (several) {
    blocks.push({
      title: 'EACH PRODUCT ACROSS THE STORES',
      headers: ['Product', 'Code', 'On hand', 'Stores at or below reorder', 'Suggested'],
      rows: [
        ...r.products.map((p) => [p.label, p.code, p.onHand, p.storesLow, p.suggested]),
        ['Total', '', r.total.onHand, '', r.total.suggested],
      ],
    })
  }
  return blocks
}

/** "legendary-stock-2026-11-22.csv", or with the store's code for one store. */
export const stockFilename = (r: StockReport): string =>
  `legendary-stock-${r.stores.length === 1 && r.stores[0].code ? `${r.stores[0].code}-` : ''}${r.asAt}.csv`

// ── The PDF ──────────────────────────────────────────────────────────────────

/** The same report drawn up to print or keep as a PDF, the listing banded by store. */
export function stockPrintSpec(r: StockReport): ReportSpec {
  const several = r.stores.length > 1
  const sections: ReportSection[] = []
  if (several) {
    sections.push({
      title: 'Stock by store',
      note: 'Counted at each store’s last closing.',
      headers: ['Store', 'Counted', 'On hand', 'At or below reorder', 'Out of stock', 'Suggested'],
      right: [false, false, true, true, true, true],
      rows: r.stores.map((s) => [
        s.name,
        s.countedOn ? formatDate(s.countedOn) : 'never filed',
        num(s.subtotal.onHand),
        num(s.subtotal.atOrBelow),
        num(s.subtotal.out),
        num(s.subtotal.suggested),
      ]),
      total: ['Total', '', num(r.total.onHand), num(r.total.atOrBelow), num(r.total.out), num(r.total.suggested)],
    })
  }
  const rows: string[][] = []
  const bands: NonNullable<ReportSection['bands']> = []
  const indents: number[] = []
  const subtotals: number[] = []
  for (const s of r.stores) {
    bands.push({ row: rows.length, level: 'outlet' })
    indents.push(0)
    rows.push([outletBand(s)])
    for (const row of s.rows) {
      indents.push(1)
      rows.push([
        row.label,
        row.counted ? `${row.workedOut ? '≈' : ''}${num(row.onHand)}` : '—',
        row.counted ? row.velocity.toFixed(1) : '',
        cover(row),
        num(row.reorderPoint),
        statusWord(row),
        row.suggested ? `+${num(row.suggested)}` : '—',
      ])
    }
    subtotals.push(rows.length)
    indents.push(1)
    rows.push([outletSubtotal(s), num(s.subtotal.onHand), '', '', '', lowWords(s.subtotal.atOrBelow), num(s.subtotal.suggested)])
  }
  sections.push({
    title: 'Stock listing',
    note: `As at ${formatDate(r.asAt)} · each store as counted at its last closing`,
    headers: ['Product', 'On hand', 'Per day', 'Days left', 'Reorder at', 'Status', 'Suggested'],
    right: [false, true, true, true, true, false, true],
    rows,
    bands,
    indents,
    subtotals,
    total: ['Grand Total', num(r.total.onHand), '', '', '', lowWords(r.total.atOrBelow), num(r.total.suggested)],
  })
  if (several) {
    sections.push({
      title: 'Each product across the stores',
      headers: ['Product', 'On hand', 'Stores at or below reorder', 'Suggested'],
      right: [false, true, true, true],
      rows: r.products.map((p) => [p.label, num(p.onHand), num(p.storesLow), num(p.suggested)]),
      total: ['Total', num(r.total.onHand), '', num(r.total.suggested)],
    })
  }
  const bars = several
    ? r.stores.map((s) => ({ label: s.name, value: s.subtotal.onHand, display: `${num(s.subtotal.onHand)} units` }))
    : [...(r.stores[0]?.rows ?? [])]
        .filter((x) => x.suggested > 0)
        .sort((a, b) => b.suggested - a.suggested)
        .slice(0, 12)
        .map((x) => ({ label: x.label, value: x.suggested, display: `+${num(x.suggested)}` }))
  return {
    title: several ? 'Stock on hand · every main store' : `Stock on hand · ${r.stores[0]?.name ?? ''}`,
    subtitle: several
      ? `As at ${formatDate(r.asAt)}`
      : `As at ${formatDate(r.asAt)} · ${r.stores[0]?.countedOn ? `counted at the close of ${formatDate(r.stores[0].countedOn)}` : 'no closing filed yet'}`,
    boxes: [
      { label: 'Units on hand', value: num(r.total.onHand) },
      { label: 'At or below reorder', value: num(r.total.atOrBelow), note: 'products, top-up suggested' },
      { label: 'Out of stock', value: num(r.total.out), note: 'products' },
      { label: 'Suggested top-up', value: num(r.total.suggested), note: 'units, in whole cases' },
    ],
    chart: { title: several ? 'Units on hand, by store' : 'The biggest top-ups suggested', bars },
    sections,
  }
}
