/**
 * Every figure the system renders is computed here, by a pure function over the
 * store's data. Screens call these; screens never aggregate. Charts receive the
 * prepared arrays these return; charts never compute.
 *
 * Two rules decide what a filter means:
 *
 *  1. **Revenue is always the sum of the sale lines** (`qty × price`). Nothing
 *     is typed in as a total and trusted, so a product or collection filter is
 *     exact rather than approximate.
 *  2. **Nationality is exact, and only main stores have it.** The client wanted
 *     to know precisely which country bought which perfume (Q29), so main-store
 *     lines carry a country. Dealers and consignment never capture it, and are
 *     therefore *excluded* — not estimated — whenever a country filter is on.
 *     `countryCoverage()` reports how much of the estate that leaves.
 */
import {
  locations,
  tradingLocations,
  locationById,
  basisOf,
  CHANNELS,
  type Channel,
  type Region,
} from '../data/locations'
import {
  skus,
  countedSkus,
  skuById,
  collections,
  isFoc,
  lineUnitPrice,
  priceOf,
  priceOfId,
  productById,
  type CollectionId,
  type PriceBasis,
  type PriceTier,
  type Variant,
} from '../data/products'
import { countries } from '../data/countries'
import { linesDiffer } from '../lib/changes'
import { rangeIndex } from '../lib/range'
import { addDays, dateRange, daysBetween, monthKey, shiftMonth, spanDays, startOfMonth, todayInMalaysia, type DateSpan } from '../lib/dates'
import { effectiveQty, isOpen } from '../lib/po-machine'
import type { Alert, Closing, CrmData, DateStr, PartnerSales, PurchaseOrder, SaleLine, Tender } from '../data/types'

/** Where a line the range does not know sits in a list: at the end. */
const LAST_IN_RANGE = Number.MAX_SAFE_INTEGER

// ── Filter ─────────────────────────────────────────────────────────────────

export interface Filter {
  from: DateStr
  to: DateStr
  /** Empty array means "all" on every dimension below. */
  locationIds: string[]
  channels: Channel[]
  regions: Region[]
  collectionIds: CollectionId[]
  skuIds: string[]
  variants: Variant[]
  countryCodes: string[]
}

export type Metric = 'revenue' | 'units'

export const METRIC_LABEL: Record<Metric, string> = {
  revenue: 'Revenue',
  units: 'Units sold',
}

export const emptyFilter = (from: DateStr, to: DateStr): Filter => ({
  from,
  to,
  locationIds: [],
  channels: [],
  regions: [],
  collectionIds: [],
  skuIds: [],
  variants: [],
  countryCodes: [],
})

export const isDimensionless = (f: Filter): boolean =>
  !f.locationIds.length &&
  !f.channels.length &&
  !f.regions.length &&
  !f.collectionIds.length &&
  !f.skuIds.length &&
  !f.variants.length &&
  !f.countryCodes.length

export const activeFilterCount = (f: Filter): number =>
  f.locationIds.length +
  f.channels.length +
  f.regions.length +
  f.collectionIds.length +
  f.skuIds.length +
  f.variants.length +
  f.countryCodes.length

// ── Building blocks ────────────────────────────────────────────────────────

export const locationMatches = (locationId: string, f: Filter): boolean => {
  const loc = locationById(locationId)
  if (!loc) return false
  if (f.locationIds.length && !f.locationIds.includes(locationId)) return false
  if (f.channels.length && !f.channels.includes(loc.channel)) return false
  if (f.regions.length && !f.regions.includes(loc.region)) return false
  return true
}

/** SKU ids surviving the collection, product and variant filters. */
export const skuIdsFor = (f: Filter): Set<string> => {
  const ids = skus
    .filter((s) => {
      if (f.variants.length && !f.variants.includes(s.variant)) return false
      if (f.skuIds.length && !f.skuIds.includes(s.id)) return false
      if (f.collectionIds.length) {
        const cid = productById(s.productId)?.collectionId
        if (!cid || !f.collectionIds.includes(cid)) return false
      }
      return true
    })
    .map((s) => s.id)
  return new Set(ids)
}

export const inWindow = (date: DateStr, f: Filter) =>
  daysBetween(f.from, date) >= 0 && daysBetween(date, f.to) >= 0

export const filteredClosings = (data: CrmData, f: Filter): Closing[] =>
  data.closings.filter((c) => inWindow(c.period, f) && locationMatches(c.locationId, f))

export interface Totals {
  revenue: number
  units: number
  /** Lines that carry a country — the exactly-attributed slice. */
  attributedUnits: number
  /** Staff purchases, kept out of the headline figures (Q23). */
  staffRevenue: number
  staffUnits: number
}

const emptyTotals = (): Totals => ({
  revenue: 0,
  units: 0,
  attributedUnits: 0,
  staffRevenue: 0,
  staffUnits: 0,
})

/** True when a line survives both the SKU filter and the country filter. */
const lineMatches = (
  line: { skuId: string; countryCode?: string },
  allowed: Set<string>,
  f: Filter,
): boolean => {
  if (!allowed.has(line.skuId)) return false
  if (f.countryCodes.length) {
    // No country recorded means this line cannot satisfy a country filter.
    if (!line.countryCode) return false
    if (!f.countryCodes.includes(line.countryCode)) return false
  }
  return true
}

/** A filter that narrows by product or by country, which a typed-in total cannot answer. */
export const narrowsByProduct = (f: Filter): boolean =>
  f.countryCodes.length > 0 || f.skuIds.length > 0 || f.collectionIds.length > 0 || f.variants.length > 0

/** `locationId::YYYY-MM` for every month a partner's figure was keyed in. */
export const keyedMonths = (data: CrmData): Set<string> =>
  new Set(data.partnerSales.map((p) => `${p.locationId}::${p.month}`))

export const totalsFor = (data: CrmData, f: Filter): Totals => {
  const allowed = skuIdsFor(f)
  const t = emptyTotals()
  const keyed = keyedMonths(data)

  for (const c of filteredClosings(data, f)) {
    // A month keyed in at head office stands in for anything filed for it.
    if (keyed.size && keyed.has(`${c.locationId}::${monthKey(c.period)}`)) continue
    for (const line of c.lines) {
      if (!lineMatches(line, allowed, f)) continue
      // Counted on whichever price this location is counted on (Revision 2).
      const price = lineUnitPrice(line, basisOf(c.locationId))
      t.revenue += line.qty * price
      t.units += line.qty
      if (line.countryCode) t.attributedUnits += line.qty
    }
    // Staff sales sit outside the country and SKU dimensions, so they only
    // count when no such filter is narrowing the view.
    if (!f.countryCodes.length && !f.skuIds.length && !f.collectionIds.length) {
      t.staffRevenue += c.staffSales.revenueMYR
      t.staffUnits += c.staffSales.qty
    }
  }

  // Dealers' and consignment partners' months, keyed in as one figure: they
  // count on the 1st of their month, like a monthly closing, and only where
  // nothing narrows the view to products or countries they cannot answer.
  if (!narrowsByProduct(f)) {
    for (const p of data.partnerSales) {
      if (inWindow(`${p.month}-01`, f) && locationMatches(p.locationId, f)) t.revenue += p.revenueMYR
    }
  }

  // To the sen: a price typed with decimals must not vanish from the totals.
  t.revenue = Math.round(t.revenue * 100) / 100
  return t
}

export const metricValue = (t: Pick<Totals, 'revenue' | 'units'>, m: Metric): number =>
  m === 'revenue' ? t.revenue : t.units

/** The equivalent window immediately before this one, for like-for-like deltas. */
export const previousWindow = (f: Filter): Filter => {
  const span = daysBetween(f.from, f.to) + 1
  return { ...f, from: addDays(f.from, -span), to: addDays(f.to, -span) }
}

export interface KpiSet {
  current: Totals
  previous: Totals
  delta: Record<Metric, number | null>
}

export const selectKpis = (data: CrmData, f: Filter): KpiSet => {
  const current = totalsFor(data, f)
  const previous = totalsFor(data, previousWindow(f))
  const d = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100)
  return {
    current,
    previous,
    delta: {
      revenue: d(current.revenue, previous.revenue),
      units: d(current.units, previous.units),
    },
  }
}

/**
 * How much of the filtered estate can answer a nationality question. Main
 * stores can; dealers and consignment cannot, and the UI says so rather than
 * quietly returning a smaller number.
 */
export const countryCoverage = (data: CrmData, f: Filter) => {
  const withCountry = { ...f, countryCodes: [] }
  const rows = filteredClosings(data, withCountry)
  const capable = new Set<string>()
  const all = new Set<string>()
  for (const c of rows) {
    all.add(c.locationId)
    if (locationById(c.locationId)?.recordsCountries) capable.add(c.locationId)
  }
  return {
    capableLocations: capable.size,
    totalLocations: all.size,
    /** True when the filter spans places that cannot answer the question. */
    partial: capable.size < all.size,
  }
}

// ── Time series ────────────────────────────────────────────────────────────

export interface SeriesPoint {
  date: DateStr
  value: number
}

export const selectTimeSeries = (data: CrmData, f: Filter, metric: Metric): SeriesPoint[] => {
  const allowed = skuIdsFor(f)
  const byDate = new Map<DateStr, { revenue: number; units: number }>()
  const keyed = keyedMonths(data)

  for (const c of filteredClosings(data, f)) {
    if (keyed.size && keyed.has(`${c.locationId}::${monthKey(c.period)}`)) continue
    const bucket = byDate.get(c.period) ?? { revenue: 0, units: 0 }
    for (const line of c.lines) {
      if (!lineMatches(line, allowed, f)) continue
      bucket.revenue += line.qty * lineUnitPrice(line, basisOf(c.locationId))
      bucket.units += line.qty
    }
    byDate.set(c.period, bucket)
  }
  if (!narrowsByProduct(f)) {
    for (const p of data.partnerSales) {
      const day = `${p.month}-01`
      if (!inWindow(day, f) || !locationMatches(p.locationId, f)) continue
      const bucket = byDate.get(day) ?? { revenue: 0, units: 0 }
      bucket.revenue += p.revenueMYR
      byDate.set(day, bucket)
    }
  }

  // Walk the calendar rather than the data, so a day nobody traded reads as a
  // gap instead of silently closing up.
  return dateRange(f.from, f.to).map((date) => {
    const b = byDate.get(date)
    return { date, value: b ? (metric === 'revenue' ? Math.round(b.revenue) : b.units) : 0 }
  })
}

// ── Country mix ────────────────────────────────────────────────────────────

export interface OriginSlice {
  countryCode: string
  name: string
  flag: string
  /**
   * Customers of this nationality: one a sale, however much they bought. The
   * share and the order go by these (client, 1 November: nationality "should
   * go according to customer amount, not perfume amount").
   */
  customers: number
  /** Units bought by this nationality — exact, from the sale lines. */
  units: number
  revenue: number
  share: number
}

/** A nationality's figures as they are counted up: its customers by basket. */
export interface OriginTally {
  units: number
  revenue: number
  baskets: Set<string>
}

export const newOriginTally = (): OriginTally => ({ units: 0, revenue: 0, baskets: new Set() })

/** The key that makes one sale one customer. */
const basketOf = (locationId: string, l: Pick<SaleLine, 'saleId' | 'id'>, fallback: string) =>
  `${locationId}::${l.saleId ?? l.id ?? fallback}`

export const originSlicesFrom = (tally: Map<string, OriginTally>, top = 6): OriginSlice[] => {
  const total = [...tally.values()].reduce((a, b) => a + b.baskets.size, 0)
  const sorted = [...tally.entries()].sort(
    (a, b) => b[1].baskets.size - a[1].baskets.size || b[1].units - a[1].units || a[0].localeCompare(b[0]),
  )
  const head = sorted.slice(0, top)
  const tail = sorted.slice(top)

  const slice = (code: string, customers: number, units: number, revenue: number): OriginSlice => {
    const meta = countries.find((c) => c.code === code)
    return {
      countryCode: code,
      name: meta?.name ?? code,
      flag: meta?.flag ?? '🏳️',
      customers,
      units,
      revenue: Math.round(revenue * 100) / 100,
      share: total ? (customers / total) * 100 : 0,
    }
  }

  const out = head.map(([code, v]) => slice(code, v.baskets.size, v.units, v.revenue))
  if (tail.length) {
    const customers = tail.reduce((a, [, v]) => a + v.baskets.size, 0)
    if (customers > 0) {
      out.push({
        ...slice(
          'OTHER',
          customers,
          tail.reduce((a, [, v]) => a + v.units, 0),
          tail.reduce((a, [, v]) => a + v.revenue, 0),
        ),
        name: 'Other',
        flag: '🌍',
      })
    }
  }
  return out
}

/** Counts one sale line into a nationality's tally. */
export const tallyOrigin = (
  tally: Map<string, OriginTally>,
  locationId: string,
  l: SaleLine,
  value: number,
  fallback: string,
) => {
  if (!l.countryCode) return
  const t = tally.get(l.countryCode) ?? newOriginTally()
  t.units += l.qty
  t.revenue += value
  t.baskets.add(basketOf(locationId, l, fallback))
  tally.set(l.countryCode, t)
}

/** Customers, units and revenue by nationality across the filtered window. */
export const selectOriginMix = (data: CrmData, f: Filter, top = 6): OriginSlice[] => {
  const allowed = skuIdsFor(f)
  const tally = new Map<string, OriginTally>()

  for (const c of filteredClosings(data, f)) {
    const basis = basisOf(c.locationId)
    c.lines.forEach((line, i) => {
      if (!lineMatches(line, allowed, f)) return
      tallyOrigin(tally, c.locationId, line, line.qty * lineUnitPrice(line, basis), `${c.id}#${i}`)
    })
  }

  return originSlicesFrom(tally, top)
}

/** Each nationality's customers, units and sales in a window, by the rules of the four boxes. */
const originsIn = (data: CrmData, f: Filter): Map<string, OriginTally> => {
  const tally = new Map<string, OriginTally>()
  eachLineIn(data, f, (l, value, basket) => {
    if (!l.countryCode) return
    const t = tally.get(l.countryCode) ?? newOriginTally()
    t.units += l.qty
    t.revenue += value
    t.baskets.add(basket)
    tally.set(l.countryCode, t)
  })
  return tally
}

/**
 * Where one store's customers came from, from `from` to `to`. Days that have
 * ended read what was filed for them; today, if the span takes it in, reads
 * the counter live, as the promoters ring sales up, and is counted once
 * whether or not it has been filed. The ribbon of the store page's chosen
 * days (client, 15 and 20 October), counted as its table is.
 */
export const selectOriginsBetween = (
  data: CrmData,
  locationId: string,
  from: DateStr,
  to: DateStr,
  top = 6,
): OriginSlice[] => originSlicesFrom(originsIn(data, { ...emptyFilter(from, to), locationIds: [locationId] }), top)

// ── Finance's sales report ────────────────────────────────────────────────

/**
 * One rule of Finance's sales report, after the rules Zeoniq's reports are
 * built from (client, 20 October): a business date, equal to one day or
 * between two; the items; the nationalities. Each rule has its own delete,
 * and the report keeps only what every rule allows.
 */
export type ReportRule =
  | { id: string; field: 'date'; span: DateSpan }
  /** Which stores (client, 1 November: "toggle date, store, item and nationality"). */
  | { id: string; field: 'store'; op: 'equal' | 'not_equal'; locationIds: string[] }
  | { id: string; field: 'item'; op: 'equal' | 'not_equal'; skuIds: string[] }
  | { id: string; field: 'nationality'; op: 'equal' | 'not_equal'; countryCodes: string[] }

export interface ReportRow {
  day: DateStr
  locationId: string
  units: number
  revenue: number
}

/**
 * Every store, day by day: one row per store per business date, with the
 * units and revenue the rules allow. Days that have ended read what was
 * filed; today reads the counter live. A rule with nothing chosen yet narrows
 * nothing, and with no date rule every day is in.
 *
 * Only sales rung up at a counter carry items and nationalities, so dealers'
 * and consignment partners' monthly figures are not in it.
 *
 * With `locationId`, the same report for one store, on its own page (client,
 * 20 October).
 */
export const selectSalesReport = (
  data: CrmData,
  rules: ReportRule[],
  locationId?: string,
): {
  rows: ReportRow[]
  units: number
  revenue: number
  days: { from: DateStr; to: DateStr } | null
  /** What the units were, product by product, most first (20 November: "unit should be in detailed"). */
  skus: { skuId: string; label: string; units: number; revenue: number }[]
} => {
  let days: { from: DateStr; to: DateStr } | null = null
  let stores: Extract<ReportRule, { field: 'store' }> | undefined
  let items: Extract<ReportRule, { field: 'item' }> | undefined
  let nations: Extract<ReportRule, { field: 'nationality' }> | undefined
  for (const r of rules) {
    if (r.field === 'date') days = spanDays(r.span)
    else if (r.field === 'store' && r.locationIds.length) stores = r
    else if (r.field === 'item' && r.skuIds.length) items = r
    else if (r.field === 'nationality' && r.countryCodes.length) nations = r
  }
  const inSpan = (day: DateStr) => !days || (day >= days.from && day <= days.to)
  const keep = (l: SaleLine) => {
    if (items && items.skuIds.includes(l.skuId) !== (items.op === 'equal')) return false
    if (nations && Boolean(l.countryCode && nations.countryCodes.includes(l.countryCode)) !== (nations.op === 'equal')) {
      return false
    }
    return true
  }
  const tally = new Map<string, ReportRow>()
  const products = new Map<string, { units: number; revenue: number }>()
  const add = (day: DateStr, locationId: string, l: SaleLine) => {
    if (!keep(l)) return
    const key = `${day}::${locationId}`
    const row = tally.get(key) ?? { day, locationId, units: 0, revenue: 0 }
    const value = l.qty * lineUnitPrice(l, basisOf(locationId))
    row.units += l.qty
    row.revenue += value
    tally.set(key, row)
    const p = products.get(l.skuId) ?? { units: 0, revenue: 0 }
    p.units += l.qty
    p.revenue += value
    products.set(l.skuId, p)
  }
  const here = (id: string) =>
    (!locationId || id === locationId) && (!stores || stores.locationIds.includes(id) === (stores.op === 'equal'))
  for (const c of data.closings) {
    if (c.periodType !== 'day' || c.period >= data.today || !inSpan(c.period) || !here(c.locationId)) continue
    for (const l of c.lines) add(c.period, c.locationId, l)
  }
  if (inSpan(data.today)) {
    for (const [id, lines] of Object.entries(data.liveLines)) if (here(id)) for (const l of lines) add(data.today, id, l)
  }
  const name = (id: string) => locationById(id)?.shortName ?? id
  const rows = [...tally.values()]
    .filter((r) => r.units > 0)
    .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
    .sort((a, b) => (a.day === b.day ? name(a.locationId).localeCompare(name(b.locationId)) : a.day < b.day ? -1 : 1))
  return {
    rows,
    units: rows.reduce((a, r) => a + r.units, 0),
    revenue: Math.round(rows.reduce((a, r) => a + r.revenue, 0) * 100) / 100,
    days,
    skus: [...products.entries()]
      .filter(([, p]) => p.units > 0)
      .map(([skuId, p]) => ({ skuId, label: skuById(skuId)?.label ?? skuId, units: p.units, revenue: Math.round(p.revenue * 100) / 100 }))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.label.localeCompare(b.label)),
  }
}

/** What one nationality bought, ranked — the question the airports raise. */
export const selectSkusForCountry = (data: CrmData, f: Filter, countryCode: string) => {
  const allowed = skuIdsFor(f)
  const tally = new Map<string, { units: number; revenue: number }>()

  for (const c of filteredClosings(data, f)) {
    for (const line of c.lines) {
      if (line.countryCode !== countryCode) continue
      if (!allowed.has(line.skuId)) continue
      const b = tally.get(line.skuId) ?? { units: 0, revenue: 0 }
      b.units += line.qty
      b.revenue += line.qty * lineUnitPrice(line, basisOf(c.locationId))
      tally.set(line.skuId, b)
    }
  }

  return [...tally.entries()]
    .map(([skuId, v]) => ({
      skuId,
      label: skuById(skuId)?.label ?? skuId,
      units: v.units,
      revenue: Math.round(v.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

// ── SKU performance ────────────────────────────────────────────────────────

export interface SkuPerformance {
  skuId: string
  label: string
  name: string
  collection: string
  variant: Variant
  units: number
  revenue: number
  /** Units per trading period across the filtered window. */
  velocity: number
}

export const selectSkuPerformance = (data: CrmData, f: Filter): SkuPerformance[] => {
  const allowed = skuIdsFor(f)
  const rows = filteredClosings(data, f)
  const periods = new Set(rows.map((c) => c.period)).size || 1
  const tally = new Map<string, { units: number; revenue: number }>()

  for (const c of rows) {
    for (const line of c.lines) {
      if (!lineMatches(line, allowed, f)) continue
      const b = tally.get(line.skuId) ?? { units: 0, revenue: 0 }
      b.units += line.qty
      b.revenue += line.qty * lineUnitPrice(line, basisOf(c.locationId))
      tally.set(line.skuId, b)
    }
  }

  return [...tally.entries()]
    .map(([skuId, v]) => {
      const sku = skuById(skuId)
      const product = productById(sku?.productId ?? '')
      return {
        skuId,
        label: sku?.label ?? skuId,
        name: product?.name ?? skuId,
        collection: product?.collection ?? '—',
        variant: sku?.variant ?? ('retail' as Variant),
        units: v.units,
        revenue: Math.round(v.revenue),
        velocity: v.units / periods,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

// ── Locations ──────────────────────────────────────────────────────────────

export interface LocationRow {
  locationId: string
  name: string
  shortName: string
  code: string
  channel: Channel
  region: Region
  cadence: 'daily' | 'monthly'
  revenue: number
  units: number
  /** Month-to-date against the pro-rata share of the target. 1.0 is on track. */
  targetPace: number | null
  /** The most recent day this location filed — its "daily sales". */
  dailyRevenue: number
  /** Which day that was, so the column can say so rather than imply today. */
  dailyPeriod: DateStr | null
  /** First of the month to today. */
  monthToDate: number
  monthlyTarget: number | null
  delta: number | null
  filedLatest: boolean
}

export const selectLocationRows = (
  data: CrmData,
  f: Filter,
  metric: Metric = 'revenue',
): LocationRow[] => {
  const month = monthKey(data.today)
  const dayOfMonth = Number(data.today.slice(8))
  const daysInMonth = new Date(
    Number(data.today.slice(0, 4)),
    Number(data.today.slice(5, 7)),
    0,
  ).getDate()
  const monthElapsed = dayOfMonth / daysInMonth
  const targetOf = (id: string) =>
    data.targets.find((t) => t.locationId === id && t.month === month)?.amountMYR ?? null

  const rows = tradingLocations
    .filter((l) => locationMatches(l.id, f))
    .map((l) => {
      const scoped: Filter = { ...f, locationIds: [l.id], channels: [], regions: [] }
      const t = totalsFor(data, scoped)
      const prev = totalsFor(data, previousWindow(scoped))

      const keyedThisMonth = data.partnerSales.find((p) => p.locationId === l.id && p.month === month)
      const mtd = keyedThisMonth
        ? keyedThisMonth.revenueMYR
        : data.closings
            .filter((c) => c.locationId === l.id && monthKey(c.period) === month)
            .reduce(
              (a, c) =>
                a + c.lines.reduce((s, ln) => s + ln.qty * lineUnitPrice(ln, l.priceBasis), 0),
              0,
            )

      // The last day actually filed, which is not always yesterday — a store
      // that missed a night should show the night it did file, not a zero.
      const latestFiled = data.closings
        .filter((c) => c.locationId === l.id)
        .sort((a, b) => (a.period < b.period ? 1 : -1))[0]

      const target = targetOf(l.id)
      const currentMetric = metricValue(t, metric)
      const prevMetric = metricValue(prev, metric)

      // Daily locations should have filed yesterday; monthly ones last month.
      const latestPeriod =
        l.cadence === 'daily' ? addDays(data.today, -1) : `${month}-01`
      const filedLatest = data.closings.some(
        (c) => c.locationId === l.id && c.period === latestPeriod,
      )

      return {
        locationId: l.id,
        name: l.name,
        shortName: l.shortName,
        code: l.code,
        channel: l.channel,
        region: l.region,
        cadence: l.cadence,
        revenue: t.revenue,
        units: t.units,
        targetPace: target ? mtd / (target * monthElapsed) : null,
        dailyRevenue: Math.round(latestFiled?.revenueMYR ?? 0),
        dailyPeriod: latestFiled?.period ?? null,
        monthToDate: Math.round(mtd),
        monthlyTarget: target,
        delta: prevMetric === 0 ? null : ((currentMetric - prevMetric) / prevMetric) * 100,
        filedLatest,
      }
    })

  return rows.sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
}

/** Revenue split by channel — the shape of the business in one figure. */
export const selectChannelSplit = (data: CrmData, f: Filter) =>
  CHANNELS.map((channel) => {
    const scoped: Filter = { ...f, channels: [channel] }
    const t = totalsFor(data, scoped)
    return { channel, revenue: t.revenue, units: t.units }
  }).filter((r) => r.revenue > 0)

// ── Stock ──────────────────────────────────────────────────────────────────

export interface StockRow {
  skuId: string
  label: string
  code: string
  collection: string
  variant: Variant
  /**
   * False until this product has been counted at this store. Before that
   * nothing is known about it, and "0 on hand" would raise a low-stock alert
   * on every product of every store the day the system starts — and on every
   * product added to the range since, at every store already trading.
   */
  counted: boolean
  onHand: number
  reorderPoint: number
  velocity: number
  daysCover: number | null
  status: 'ok' | 'low' | 'critical' | 'out'
  suggested: number
}

const VELOCITY_WINDOW = 30

/**
 * Stock on hand is the counted balance from the location's most recent closing,
 * plus anything already dispatched and not yet received.
 *
 * `asOf` asks what the shelf held when that day began — the count from the
 * closing before it. Closing a day needs that and nothing later: counting from
 * the day's own closing, as editing one used to, took the day's sales off
 * twice and showed every box short.
 *
 * This is a count for head office visibility only. The client was explicit that
 * once stock leaves the warehouse it is no longer theirs, and that this must
 * not be confused with SQL Accounting (Q35) — so nothing here is ever valued.
 */
export const selectStock = (data: CrmData, locationId: string, asOf?: DateStr): StockRow[] => {
  const history = data.closings
    .filter((c) => c.locationId === locationId && (!asOf || c.period < asOf))
    .sort((a, b) => (a.period < b.period ? 1 : -1))
  const latest = history[0]
  const since = addDays(asOf ?? data.today, -VELOCITY_WINDOW)
  const recent = history.filter((c) => daysBetween(since, c.period) >= 0)
  const periods = recent.length || 1

  const inbound = new Map<string, number>()
  for (const po of data.purchaseOrders) {
    if (po.locationId !== locationId) continue
    if (po.status !== 'in_transit' && po.status !== 'packed') continue
    for (const l of po.lines) inbound.set(l.skuId, (inbound.get(l.skuId) ?? 0) + effectiveQty(l))
  }

  // Received since that count: no longer on its way and in no count yet, but
  // on the shelf, so it is not asked for again (25 November).
  const arrived = asOf ? new Map<string, number>() : selectArrivalsForClosing(data, locationId, addDays(data.today, 1))

  const soldOf = (skuId: string) =>
    recent.reduce(
      (a, c) => a + c.lines.filter((l) => l.skuId === skuId).reduce((s, l) => s + l.qty, 0),
      0,
    )

  // Testers and vials are ordered but never counted on a shelf, so they are
  // not part of stock on hand.
  return countedSkus.map((s) => {
    const count = latest?.stockCount.find((m) => m.skuId === s.id)
    const counted = Boolean(count)
    const onHand = count?.counted ?? 0
    const velocity = soldOf(s.id) / periods
    const daysCover = velocity > 0 ? onHand / velocity : null
    const status: StockRow['status'] = !counted
      ? 'ok'
      : onHand === 0
        ? 'out'
        : onHand <= s.reorderPoint / 2
          ? 'critical'
          : onHand <= s.reorderPoint
            ? 'low'
            : 'ok'

    // Three weeks of cover, never below the reorder point, rounded to cases.
    const target = Math.max(s.reorderPoint * 2, Math.ceil(velocity * 21))
    const gap = Math.max(0, target - onHand - (arrived.get(s.id) ?? 0) - (inbound.get(s.id) ?? 0))
    const product = productById(s.productId)

    return {
      skuId: s.id,
      label: s.label,
      code: s.code,
      collection: product?.collection ?? '—',
      variant: s.variant,
      counted,
      onHand,
      reorderPoint: s.reorderPoint,
      velocity,
      daysCover,
      status,
      suggested: counted && gap > 0 ? Math.ceil(gap / s.caseSize) * s.caseSize : 0,
    }
  })
}

// ── One item, at one store ─────────────────────────────────────────────────

export interface StockMovement {
  date: DateStr
  /** Positive came in, negative went out. */
  change: number
  kind: 'sold' | 'received' | 'written off' | 'counted'
  note?: string
}

/**
 * Everything that happened to one product at one store: what came in, what went
 * out, and what the count said afterwards.
 *
 * All of it is derived from closings and delivered orders rather than kept as a
 * separate ledger, so it cannot drift away from the numbers on the rest of the
 * system — there is one set of facts and this reads them back.
 *
 * Note what "received" means here: the client's stock stops being theirs once
 * it leaves the warehouse (Q35), so an arrival is a movement onto the shop's
 * shelf, not a purchase. Nothing on this screen is ever valued.
 */
export const selectSkuMovements = (
  data: CrmData,
  locationId: string,
  skuId: string,
  days = 30,
): StockMovement[] => {
  const since = addDays(data.today, -days)
  const out: StockMovement[] = []

  for (const c of data.closings) {
    if (c.locationId !== locationId || c.period < since) continue

    const sold = c.lines.filter((l) => l.skuId === skuId).reduce((a, l) => a + l.qty, 0)
    if (sold > 0) out.push({ date: c.period, change: -sold, kind: 'sold' })

    for (const w of c.writeOffs) {
      if (w.skuId !== skuId) continue
      out.push({
        date: c.period,
        change: -w.qty,
        kind: 'written off',
        note: w.reason === 'tester' ? 'Tester used up' : w.reason === 'damaged' ? 'Damaged' : 'Free sample',
      })
    }

    const counted = c.stockCount.find((m) => m.skuId === skuId)
    if (counted) {
      out.push({
        date: c.period,
        change: 0,
        kind: 'counted',
        note: `${counted.counted} on the shelf`,
      })
    }
  }

  // An order that has been received put stock on the shelf.
  for (const po of data.purchaseOrders) {
    if (po.locationId !== locationId || po.status !== 'received') continue
    const line = po.lines.find((l) => l.skuId === skuId)
    if (!line) continue
    const arrived = po.events.find((e) => e.status === 'received')?.at.slice(0, 10)
    if (!arrived || arrived < since) continue
    out.push({
      date: arrived,
      change: effectiveQty(line),
      kind: 'received',
      note: po.id,
    })
  }

  // Newest first, and within a day the arrival before the count that followed.
  const order: Record<StockMovement['kind'], number> = {
    received: 0,
    sold: 1,
    'written off': 2,
    counted: 3,
  }
  return out.sort((a, b) =>
    a.date === b.date ? order[a.kind] - order[b.kind] : a.date < b.date ? 1 : -1,
  )
}

/** The day a store last filed, if it ever has. */
export const selectLastFiled = (data: CrmData, locationId: string): Closing | undefined =>
  data.closings
    .filter((c) => c.locationId === locationId && c.periodType === 'day')
    .reduce<Closing | undefined>((a, c) => (!a || c.period > a.period ? c : a), undefined)

export interface SoldAt {
  /** One unit, as charged. */
  unitPrice: number
  tier: PriceTier
  /** Units that went at this price; 0 for a list price nobody has paid yet. */
  qty: number
}

/**
 * The price each item actually went for at one store, read off the sales
 * themselves. A Wish added on at the RM 10 offer reads RM 10, as it does on
 * the sale, not its RM 88 list price (client, 13 October: a product's price
 * should be the same throughout the CRM).
 *
 * The day last filed comes first. Those are the sales the stock table's
 * Deducted column counts, so every price they went at is listed, most units
 * first. An item that did not sell that day shows the price most of it went
 * for here over 30 days. One that has not sold here lately shows its list
 * price at the store's own tier.
 */
export const selectPricesAt = (data: CrmData, locationId: string): ((skuId: string) => SoldAt[]) => {
  const basis = basisOf(locationId)
  const tally = (lines: SaleLine[]) => {
    const out = new Map<string, SoldAt[]>()
    for (const l of lines) {
      const unitPrice = lineUnitPrice(l, basis)
      const tier = l.priceTier ?? basis
      const prices = out.get(l.skuId) ?? []
      const same = prices.find((p) => p.unitPrice === unitPrice && p.tier === tier)
      if (same) same.qty += l.qty
      else prices.push({ unitPrice, tier, qty: l.qty })
      out.set(l.skuId, prices)
    }
    for (const prices of out.values()) prices.sort((a, b) => b.qty - a.qty)
    return out
  }
  const since = addDays(data.today, -30)
  const onTheDay = tally(selectLastFiled(data, locationId)?.lines ?? [])
  const lately = tally(
    data.closings
      .filter((c) => c.locationId === locationId && c.periodType === 'day' && c.period >= since)
      .flatMap((c) => c.lines),
  )
  return (skuId) => {
    const sold = onTheDay.get(skuId) ?? lately.get(skuId)?.slice(0, 1)
    if (sold?.length) return sold
    const sku = skuById(skuId)
    return [isFoc(sku) ? { unitPrice: 0, tier: 'foc', qty: 0 } : { unitPrice: priceOf(sku, basis), tier: basis, qty: 0 }]
  }
}

/**
 * Lines the closing flow pre-fills on its top-up step. Reorder points are the
 * client's own numbers for now; after a few months of real data these become
 * suggestions from sales velocity (Q37).
 */
export const selectSuggestedPoLines = (data: CrmData, locationId: string) =>
  selectStock(data, locationId)
    .filter((r) => r.status !== 'ok' && r.suggested > 0)
    .map((r) => ({
      skuId: r.skuId,
      qtyRequested: r.suggested,
      qtyApproved: null,
      qtyShipped: null,
    }))

// ── Purchase orders ────────────────────────────────────────────────────────

export const selectPosByStatus = (data: CrmData, statuses: string[]): PurchaseOrder[] =>
  data.purchaseOrders
    .filter((p) => statuses.includes(p.status))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

export const selectOpenPos = (data: CrmData, locationId?: string): PurchaseOrder[] =>
  data.purchaseOrders
    .filter((p) => isOpen(p) && (!locationId || p.locationId === locationId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

/**
 * What the store had on its shelf when it sent the order (Revision 10: "show
 * the store on hand quantity for each SKU, on the day PO placed"): the count
 * from its last closing before the day the order was first sent — or that
 * day's own, where the order went with the closing, filed before it. A day
 * filed late still counts for its own day. Null for a store that has never
 * filed.
 */
export const selectOnHandAtOrder = (
  data: Pick<CrmData, 'closings'>,
  po: PurchaseOrder,
): { day: DateStr; counts: Map<string, number> } | null => {
  const sentAt = po.events.find((e) => e.status === 'submitted')?.at ?? po.createdAt
  const placed = Date.parse(sentAt)
  const placedDay = Number.isNaN(placed) ? sentAt.slice(0, 10) : todayInMalaysia(new Date(placed))
  const latest = data.closings
    .filter((c) => c.locationId === po.locationId && c.periodType === 'day' && c.stockCount.length > 0)
    .filter((c) => {
      if (c.period < placedDay) return true
      if (c.period > placedDay) return false
      const filed = Date.parse(c.submittedAt)
      return !Number.isNaN(filed) && !Number.isNaN(placed) && filed <= placed
    })
    .reduce<Closing | undefined>((a, c) => (!a || c.period > a.period ? c : a), undefined)
  return latest ? { day: latest.period, counts: new Map(latest.stockCount.map((s) => [s.skuId, s.counted])) } : null
}

/**
 * What a store confirmed receiving after one count and up to the close of a
 * day, line by line: on the shelf, but in neither count's figures until the
 * second. An arrival on the day of the first count was in that count. Days
 * are Malaysian.
 */
export const selectArrivals = (
  data: Pick<CrmData, 'purchaseOrders'>,
  locationId: string,
  after: DateStr | undefined,
  upTo: DateStr,
): Map<string, number> => {
  const out = new Map<string, number>()
  for (const po of data.purchaseOrders) {
    if (po.locationId !== locationId || po.status !== 'received') continue
    const at = po.events.find((e) => e.status === 'received')?.at
    if (!at || Number.isNaN(Date.parse(at))) continue
    const day = todayInMalaysia(new Date(at))
    if ((after && day <= after) || day > upTo) continue
    for (const l of po.lines) out.set(l.skuId, (out.get(l.skuId) ?? 0) + effectiveQty(l))
  }
  return out
}

/**
 * What arrived since a store's last count before `day`, for that day's
 * closing. It goes into what the shelf should hold, so every box starts with
 * the delivery in it (20 November: "after promoter receive stock for PO, the
 * received quantity automatically adds into the closing quantity"), and a
 * three of vials counted together is shared out with it, so a vial the store
 * had run out of gets its own back when it comes in (Revision 10).
 *
 * A delivery confirmed on the day of that last count is in that count only if
 * it came before the count was filed; one confirmed after waits for the next.
 * `filedAt`, for a day already filed: nothing confirmed after it was.
 */
export const selectArrivalsForClosing = (
  data: Pick<CrmData, 'purchaseOrders' | 'closings'>,
  locationId: string,
  day: DateStr,
  filedAt?: string,
): Map<string, number> => {
  const last = data.closings
    .filter((c) => c.locationId === locationId && c.period < day && c.stockCount.length > 0)
    .reduce<Closing | undefined>((a, c) => (!a || c.period > a.period ? c : a), undefined)
  const countedAt = last ? Date.parse(last.submittedAt) : NaN
  const until = filedAt ? Date.parse(filedAt) : NaN
  const out = new Map<string, number>()
  for (const po of data.purchaseOrders) {
    if (po.locationId !== locationId || po.status !== 'received') continue
    const at = po.events.find((e) => e.status === 'received')?.at
    const when = at ? Date.parse(at) : NaN
    if (Number.isNaN(when)) continue
    const arrived = todayInMalaysia(new Date(when))
    if (arrived > day || when > until) continue
    if (last && (arrived < last.period || (arrived === last.period && !(when > countedAt)))) continue
    for (const l of po.lines) out.set(l.skuId, (out.get(l.skuId) ?? 0) + effectiveQty(l))
  }
  return out
}

/**
 * What sold on earlier days that were never closed, since a store's last count
 * before `day`: off the shelf, and in no count yet. It comes off what the
 * shelf should hold, as a delivery since then goes on (25 November). `unfiled`
 * is the store's sales on the days it did not close.
 */
export const selectSoldSinceCount = (
  data: Pick<CrmData, 'closings'>,
  unfiled: Record<DateStr, { skuId: string; qty: number }[]> | undefined,
  locationId: string,
  day: DateStr,
): Map<string, number> => {
  const last = data.closings
    .filter((c) => c.locationId === locationId && c.period < day && c.stockCount.length > 0)
    .reduce<DateStr | undefined>((a, c) => (!a || c.period > a ? c.period : a), undefined)
  const out = new Map<string, number>()
  for (const [d, lines] of Object.entries(unfiled ?? {})) {
    if (d >= day || (last && d <= last)) continue
    for (const l of lines) out.set(l.skuId, (out.get(l.skuId) ?? 0) + l.qty)
  }
  return out
}

/** What an order is worth, on the basis the destination store is counted on. */
export const poValue = (po: PurchaseOrder): number =>
  po.lines.reduce(
    (a, l) => a + effectiveQty(l) * priceOfId(l.skuId, basisOf(po.locationId)),
    0,
  )

export const poUnits = (po: PurchaseOrder): number =>
  po.lines.reduce((a, l) => a + effectiveQty(l), 0)

// ── Today ──────────────────────────────────────────────────────────────────

export const selectClosingFor = (data: CrmData, locationId: string, period: DateStr) =>
  data.closings.find((c) => c.locationId === locationId && c.period === period)

/**
 * Today's closing no longer matches the sales on record — one was added,
 * changed or taken back after it was filed. The store is asked to bring the
 * closing up to date rather than it being changed behind their back: the cash
 * they counted is theirs to confirm.
 */
export const selectClosingOutOfStep = (data: CrmData, locationId: string): boolean => {
  const filed = selectClosingFor(data, locationId, data.today)
  return Boolean(
    filed && linesDiffer(filed.lines, data.liveLines[locationId] ?? [], basisOf(locationId)),
  )
}

/**
 * Daily locations that have not filed for the given day.
 *
 * A store that has never filed anything is not "missing" a day — it has not
 * started. Only a store with a closing on record before `date` is expected to
 * file every day after it.
 */
export const selectNotFiled = (data: CrmData, date: DateStr): string[] =>
  tradingLocations
    .filter((l) => l.cadence === 'daily')
    .filter((l) => data.closings.some((c) => c.locationId === l.id && c.period < date))
    .filter((l) => !data.closings.some((c) => c.locationId === l.id && c.period === date))
    .map((l) => l.id)

// ── Alerts ─────────────────────────────────────────────────────────────────

/**
 * What needs attention, worked out from the data rather than stored.
 *
 * Stored alerts drift: a missed-closing alert has to be removed when the
 * closing arrives, a low-stock alert when the top-up lands. Deriving them
 * means they are right by construction. Only "read" is remembered, by id.
 */
export const deriveAlerts = (data: CrmData, readIds: Set<string>): Alert[] => {
  const alerts: Alert[] = []
  const stamp = (d: DateStr, hh: string) => `${d}T${hh}:00+08:00`
  const daily = tradingLocations.filter((l) => l.cadence === 'daily')

  // Stock at or under its reorder point, where a count exists to say so.
  for (const loc of daily) {
    for (const row of selectStock(data, loc.id)) {
      if (!row.counted || row.status === 'ok') continue
      alerts.push({
        id: `low-${loc.id}-${row.skuId}`,
        type: 'low_stock',
        severity: row.status === 'out' ? 'critical' : row.status === 'critical' ? 'serious' : 'warn',
        locationId: loc.id,
        skuId: row.skuId,
        message:
          row.status === 'out'
            ? `${row.label} is out of stock`
            : `${row.label} down to ${row.onHand}, at or below the reorder point of ${row.reorderPoint}`,
        at: stamp(data.today, '07:30'),
        read: false,
      })
    }
  }

  // Daily locations that did not file. Deadline is 11pm (Q18).
  for (let back = 1; back <= 4; back++) {
    const date = addDays(data.today, -back)
    for (const id of selectNotFiled(data, date)) {
      alerts.push({
        id: `missed-${id}-${date}`,
        type: 'missed_closing',
        severity: back === 1 ? 'serious' : 'critical',
        locationId: id,
        message: `No closing filed for ${date}`,
        at: stamp(addDays(date, 1), '08:00'),
        read: false,
      })
    }
  }

  // Orders sitting with Kelly.
  for (const po of data.purchaseOrders) {
    if (po.status !== 'submitted') continue
    alerts.push({
      id: `po-${po.id}`,
      type: 'po_waiting',
      severity: po.priority === 'urgent' ? 'serious' : 'warn',
      locationId: po.locationId,
      poId: po.id,
      message: `${po.id} is waiting for approval`,
      at: po.createdAt,
      read: false,
    })
  }

  // Corrections waiting on Kelly or Davy.
  for (const c of data.closings) {
    if (c.correction?.status !== 'pending') continue
    alerts.push({
      id: `correction-${c.id}`,
      type: 'correction_pending',
      severity: 'warn',
      locationId: c.locationId,
      message: `${c.correction.requestedBy} asked to correct the ${c.period} closing`,
      at: c.correction.requestedAt,
      read: false,
    })
  }

  return alerts
    .map((a) => (readIds.has(a.id) ? { ...a, read: true } : a))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** Sales logged at the counter today, before the close is filed. */
export const selectLiveLines = (data: CrmData, locationId: string) =>
  data.liveLines[locationId] ?? []

/** The last `n` periods for one location, oldest first — for sparklines. */
export const selectLocationSparkline = (
  data: CrmData,
  locationId: string,
  n = 14,
): SeriesPoint[] => {
  const to = data.today
  const from = addDays(to, -(n - 1))
  return selectTimeSeries(
    data,
    { ...emptyFilter(from, to), locationIds: [locationId] },
    'revenue',
  )
}

// ── Write-offs ─────────────────────────────────────────────────────────────

/** Testers used, damages and samples across the window (Q25). */
export const selectWriteOffs = (data: CrmData, f: Filter) => {
  const rows = filteredClosings(data, f)
  const tally = new Map<string, number>()
  let total = 0
  for (const c of rows) {
    for (const w of c.writeOffs) {
      tally.set(w.reason, (tally.get(w.reason) ?? 0) + w.qty)
      total += w.qty
    }
  }
  return { total, byReason: tally }
}

// ── Today, and the month so far ─────────────────────────────────────────────

export interface SalesFigure {
  revenue: number
  units: number
  /** Baskets: one customer, however much they bought. */
  customers: number
}

export interface StoreSales extends SalesFigure {
  locationId: string
}

const blank = (): SalesFigure & { baskets: Set<string> } => ({ revenue: 0, units: 0, customers: 0, baskets: new Set() })

const finish = (f: SalesFigure & { baskets: Set<string> }): SalesFigure => ({
  revenue: Math.round(f.revenue * 100) / 100,
  units: f.units,
  customers: f.baskets.size,
})

/**
 * Today so far, from every sale recorded at a counter — live, rising through
 * the day as promoters ring sales up (client's fifth revision: revenue
 * "change to daily"). Stores best first.
 */
export const selectToday = (data: CrmData): SalesFigure & { byStore: StoreSales[] } => {
  const total = blank()
  const byStore: StoreSales[] = []
  for (const [locationId, lines] of Object.entries(data.liveLines)) {
    const basis = basisOf(locationId)
    const here = blank()
    lines.forEach((l, i) => {
      const value = l.qty * lineUnitPrice(l, basis)
      const basket = l.saleId ?? l.id ?? `${locationId}#${i}`
      for (const f of [here, total]) {
        f.revenue += value
        f.units += l.qty
        f.baskets.add(basket)
      }
    })
    byStore.push({ locationId, ...finish(here) })
  }
  return { ...finish(total), byStore: byStore.sort((a, b) => b.revenue - a.revenue) }
}

/**
 * The month so far: every day filed from the 1st, and today as it stands —
 * today is read from the counter, not from its closing, so it is never
 * counted twice. Stores best first.
 */
export const selectMonthToDate = (data: CrmData): SalesFigure & { byStore: StoreSales[] } => {
  const month = monthKey(data.today)
  const keyed = keyedMonths(data)
  const stores = new Map<string, ReturnType<typeof blank>>()
  const total = blank()
  const add = (locationId: string, value: number, qty: number, basket: string) => {
    const here = stores.get(locationId) ?? blank()
    for (const f of [here, total]) {
      f.revenue += value
      f.units += qty
      f.baskets.add(basket)
    }
    stores.set(locationId, here)
  }
  for (const c of data.closings) {
    if (monthKey(c.period) !== month || c.period >= data.today) continue
    if (keyed.has(`${c.locationId}::${month}`)) continue
    const basis = basisOf(c.locationId)
    c.lines.forEach((l, i) => add(c.locationId, l.qty * lineUnitPrice(l, basis), l.qty, l.saleId ?? l.id ?? `${c.id}#${i}`))
  }
  for (const [locationId, lines] of Object.entries(data.liveLines)) {
    const basis = basisOf(locationId)
    lines.forEach((l, i) => add(locationId, l.qty * lineUnitPrice(l, basis), l.qty, l.saleId ?? l.id ?? `${locationId}#${i}`))
  }
  const byStore = [...stores.entries()].map(([locationId, f]) => ({ locationId, ...finish(f) }))
  return { ...finish(total), byStore: byStore.sort((a, b) => b.revenue - a.revenue) }
}

// ── Sales at a glance (client's seventh amendments, 1 November) ─────────────

/** A period's sales, with the days it covers. */
export interface PeriodSales extends SalesFigure {
  from: DateStr
  to: DateStr
}

/**
 * Sales in a window, for the four boxes and the stores table. Days that have
 * ended read what was filed; today, if the window takes it in, reads the
 * counter live, and its closing is never counted as well. A dealer's or
 * consignment partner's month keyed in at head office counts as one figure,
 * where nothing narrows the view to products or countries it cannot answer.
 */
const salesIn = (data: CrmData, f: Filter): SalesFigure => {
  const acc = blank()
  eachLineIn(data, f, (l, value, basket) => {
    acc.revenue += value
    acc.units += l.qty
    acc.baskets.add(basket)
  })
  if (!narrowsByProduct(f)) {
    for (const p of data.partnerSales) {
      if (inWindow(`${p.month}-01`, f) && locationMatches(p.locationId, f)) acc.revenue += p.revenueMYR
    }
  }
  return finish(acc)
}

/**
 * Every sale line in a window that the filter allows, by the same rules as
 * `salesIn`: filed days that have ended, unless a keyed-in month stands in
 * for them, and today live from the counter. Each comes with what it sold
 * for, the basket it was part of, the store that sold it, and its day.
 */
export const eachLineIn = (
  data: CrmData,
  f: Filter,
  visit: (l: SaleLine, value: number, basket: string, locationId: string, day: DateStr) => void,
) => {
  const allowed = skuIdsFor(f)
  const keyed = keyedMonths(data)
  const add = (locationId: string, l: SaleLine, basis: PriceBasis, fallback: string, day: DateStr) => {
    if (lineMatches(l, allowed, f)) visit(l, l.qty * lineUnitPrice(l, basis), basketOf(locationId, l, fallback), locationId, day)
  }
  for (const c of filteredClosings(data, f)) {
    if (c.period >= data.today) continue
    if (keyed.size && keyed.has(`${c.locationId}::${monthKey(c.period)}`)) continue
    const basis = basisOf(c.locationId)
    c.lines.forEach((l, i) => add(c.locationId, l, basis, `${c.id}#${i}`, c.period))
  }
  if (inWindow(data.today, f)) {
    for (const [locationId, lines] of Object.entries(data.liveLines)) {
      if (!locationMatches(locationId, f)) continue
      const basis = basisOf(locationId)
      lines.forEach((l, i) => add(locationId, l, basis, `live#${i}`, data.today))
    }
  }
}

export interface SalesPeriods {
  today: PeriodSales
  yesterday: PeriodSales
  monthToDate: PeriodSales
  lastMonth: PeriodSales
}

/** The four windows the boxes show, as dates. */
export const salesWindows = (today: DateStr) => {
  const monthStart = startOfMonth(today)
  return {
    today: { from: today, to: today },
    yesterday: { from: addDays(today, -1), to: addDays(today, -1) },
    monthToDate: { from: monthStart, to: today },
    lastMonth: { from: `${shiftMonth(monthKey(today), -1)}-01`, to: addDays(monthStart, -1) },
  }
}

/**
 * The four boxes on every main page (client, 1 November): today's sales,
 * live; yesterday's, as filed; the month so far; and last month. `base`
 * narrows them as a page's own filter does — one store, a nationality, a
 * product — and the dates are always these four.
 */
export const selectSalesPeriods = (data: CrmData, base: Partial<Filter> = {}): SalesPeriods => {
  const w = salesWindows(data.today)
  const period = (window: { from: DateStr; to: DateStr }): PeriodSales => ({
    ...window,
    ...salesIn(data, { ...emptyFilter(window.from, window.to), ...base, from: window.from, to: window.to }),
  })
  return {
    today: period(w.today),
    yesterday: period(w.yesterday),
    monthToDate: period(w.monthToDate),
    lastMonth: period(w.lastMonth),
  }
}

export interface StoreSalesRow extends SalesPeriods {
  locationId: string
}

/** Every trading location's four figures, for the Stores table. */
export const selectStoreSales = (data: CrmData): StoreSalesRow[] => {
  // Each store reads only its own records: sixty stores over months of
  // closings is otherwise a long walk, four times over.
  const byStore = new Map<string, Closing[]>()
  for (const c of data.closings) {
    const list = byStore.get(c.locationId)
    if (list) list.push(c)
    else byStore.set(c.locationId, [c])
  }
  return tradingLocations.map((l) => ({
    locationId: l.id,
    ...selectSalesPeriods(
      {
        ...data,
        closings: byStore.get(l.id) ?? [],
        liveLines: { [l.id]: data.liveLines[l.id] ?? [] },
        partnerSales: data.partnerSales.filter((p) => p.locationId === l.id),
      },
      { locationIds: [l.id] },
    ),
  }))
}

// ── A period, on Analytics (16 November) ───────────────────────────────────
//
// "If I chose one week, from 1st to 7th of November, of course I want to see
// the total": every figure on Analytics reads the dates chosen at the top and
// nothing else, by the rules of the four boxes — the days that have ended as
// filed, today live from the counter, and a dealer's keyed-in month where
// nothing narrows the view to products or countries.

/** Each store's sales in a window, with its customers. */
const storeTally = (data: CrmData, f: Filter): Map<string, ReturnType<typeof blank>> => {
  const out = new Map<string, ReturnType<typeof blank>>()
  const at = (id: string) => {
    const t = out.get(id) ?? blank()
    out.set(id, t)
    return t
  }
  eachLineIn(data, f, (l, value, basket, locationId) => {
    const t = at(locationId)
    t.revenue += value
    t.units += l.qty
    t.baskets.add(basket)
  })
  if (!narrowsByProduct(f)) {
    for (const p of data.partnerSales) {
      if (inWindow(`${p.month}-01`, f) && locationMatches(p.locationId, f)) at(p.locationId).revenue += p.revenueMYR
    }
  }
  return out
}

/** The period's sales, customers and units; how many stores sold; and the same days before it. */
export const selectPeriodTotals = (data: CrmData, f: Filter): SalesFigure & { stores: number; previous: number } => {
  const stores = [...storeTally(data, f).values()].filter((t) => t.revenue || t.units).length
  return { ...salesIn(data, f), stores, previous: salesIn(data, previousWindow(f)).revenue }
}

export interface StoreTotal extends SalesFigure {
  locationId: string
  /** Its sales over the same number of days before. */
  previous: number
  /** And its units then. */
  previousUnits: number
}

/** Every store the filter takes in, with its total for the period, the best first. */
export const selectStoreTotals = (data: CrmData, f: Filter): StoreTotal[] => {
  const now = storeTally(data, f)
  const before = storeTally(data, previousWindow(f))
  const name = (id: string) => locationById(id)?.shortName ?? id
  return tradingLocations
    .filter((l) => locationMatches(l.id, f))
    .map((l) => ({
      locationId: l.id,
      ...finish(now.get(l.id) ?? blank()),
      previous: Math.round((before.get(l.id)?.revenue ?? 0) * 100) / 100,
      previousUnits: before.get(l.id)?.units ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units || name(a.locationId).localeCompare(name(b.locationId)))
}

// ── One store, opened (20 November) ─────────────────────────────────────────
//
// "When click on any stores then its data should be open in pop-up with all
// the details ... it says 20 unit sold but it's not showing what 20 unit
// sold": a store's figures for some dates, read as Analytics reads them, and
// what is behind them.

export interface StorePeriod extends SalesFigure {
  locationId: string
  /** What sold, most units first, with every price each went at. */
  skus: { skuId: string; label: string; code: string; units: number; revenue: number; prices: SoldAt[] }[]
  /** Where the customers came from, most customers first. */
  countries: { countryCode: string; customers: number; units: number; revenue: number }[]
  /** The days it sold, oldest first. */
  days: { day: DateStr; revenue: number; units: number; customers: number }[]
  /**
   * How the days filed in the window were paid, as filed at each close. Null
   * where none was filed, or where the view is narrowed to products or
   * countries, which a day's payment cannot be split by.
   */
  tender: (Tender & { days: number }) | null
  /** A dealer's or consignment partner's months keyed in, each counted on its 1st. */
  months: { month: string; revenue: number; keyed?: PartnerSales }[]
}

/**
 * One store over the filter's dates, narrowed by its products and countries:
 * its sales, units and customers, the same as its row on Analytics; what it
 * sold and at which prices; who bought; the days; how it was paid; and a
 * partner's months keyed in, which have no products behind them.
 */
export const selectStorePeriod = (data: CrmData, f: Filter, locationId: string): StorePeriod => {
  const here: Filter = { ...f, locationIds: [locationId], channels: [], regions: [] }
  const basis = basisOf(locationId)
  const total = blank()
  const days = new Map<DateStr, ReturnType<typeof blank>>()
  const products = new Map<string, { units: number; revenue: number; prices: SoldAt[] }>()
  const nations = new Map<string, OriginTally>()

  eachLineIn(data, here, (l, value, basket, _id, day) => {
    const d = days.get(day) ?? blank()
    days.set(day, d)
    for (const t of [total, d]) {
      t.revenue += value
      t.units += l.qty
      t.baskets.add(basket)
    }
    const p = products.get(l.skuId) ?? { units: 0, revenue: 0, prices: [] }
    p.units += l.qty
    p.revenue += value
    const unitPrice = lineUnitPrice(l, basis)
    const tier = l.priceTier ?? basis
    const same = p.prices.find((x) => x.unitPrice === unitPrice && x.tier === tier)
    if (same) same.qty += l.qty
    else p.prices.push({ unitPrice, tier, qty: l.qty })
    products.set(l.skuId, p)
    if (l.countryCode) {
      const t = nations.get(l.countryCode) ?? newOriginTally()
      t.units += l.qty
      t.revenue += value
      t.baskets.add(basket)
      nations.set(l.countryCode, t)
    }
  })

  const narrowed = narrowsByProduct(here)
  const sen = (n: number) => Math.round(n * 100) / 100
  const months = narrowed
    ? []
    : data.partnerSales
        .filter((p) => p.locationId === locationId && inWindow(`${p.month}-01`, here))
        .map((p) => ({ month: p.month, revenue: p.revenueMYR, keyed: p }))
        .sort((a, b) => (a.month < b.month ? -1 : 1))
  for (const m of months) total.revenue += m.revenue

  let tender: StorePeriod['tender'] = null
  if (!narrowed) {
    const keyed = keyedMonths(data)
    const filed = data.closings.filter(
      (c) =>
        c.locationId === locationId &&
        c.periodType === 'day' &&
        c.period < data.today &&
        inWindow(c.period, here) &&
        c.tender &&
        !keyed.has(`${locationId}::${monthKey(c.period)}`),
    )
    if (filed.length) {
      const sum = (k: keyof Tender) => sen(filed.reduce((a, c) => a + (c.tender?.[k] ?? 0), 0))
      tender = { cash: sum('cash'), ewallet: sum('ewallet'), card: sum('card'), days: filed.length }
    }
  }

  return {
    locationId,
    ...finish(total),
    skus: [...products.entries()]
      .map(([skuId, p]) => ({
        skuId,
        label: skuById(skuId)?.label ?? skuId,
        code: skuById(skuId)?.code ?? '',
        units: p.units,
        revenue: sen(p.revenue),
        prices: [...p.prices].sort((a, b) => b.qty - a.qty || b.unitPrice - a.unitPrice),
      }))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.label.localeCompare(b.label)),
    countries: [...nations.entries()]
      .map(([countryCode, t]) => ({ countryCode, customers: t.baskets.size, units: t.units, revenue: sen(t.revenue) }))
      .sort((a, b) => b.customers - a.customers || b.units - a.units || a.countryCode.localeCompare(b.countryCode)),
    days: [...days.entries()]
      .map(([day, t]) => ({ day, ...finish(t) }))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
    tender,
    months,
  }
}

/**
 * One month by channel, for Finance's Revenue (20 November: "in By channel
 * section, dealers and Consignment should be seen"): the main stores' days,
 * today live in a month still running, and each partner channel's months
 * keyed in, with how many partners that is. Every channel is listed, at
 * nothing where nothing is in yet.
 */
export interface ChannelMonth {
  channel: Channel
  revenue: number
  units: number
  /** Dealers and consignment: how many partners have the month keyed in. */
  keyed?: { done: number; of: number }
}

export const selectChannelMonth = (data: CrmData, month: string): ChannelMonth[] =>
  selectChannelPeriod(data, `${month}-01`, addDays(`${shiftMonth(month, 1)}-01`, -1))

/** The months whose 1st falls from `from` to `to`, oldest first: those a partner's figures count in. */
export const monthsStartingIn = (from: DateStr, to: DateStr): string[] => {
  const out: string[] = []
  for (let m = monthKey(from); m <= monthKey(to); m = shiftMonth(m, 1)) {
    const first = `${m}-01`
    if (first >= from && first <= to) out.push(m)
  }
  return out
}

/**
 * Some dates by channel, for Revenue's By channel with its own From and To
 * (20 November, later): the main stores' days, today live, and each partner
 * channel's months whose 1st is in the dates, with how many partners have a
 * figure in them. Every channel is listed, at nothing where nothing is in.
 */
export const selectChannelPeriod = (data: CrmData, from: DateStr, to: DateStr): ChannelMonth[] => {
  const end = to < data.today ? to : data.today
  const totals = new Map(from <= end ? selectChannelTotals(data, emptyFilter(from, end)).map((c) => [c.channel, c]) : [])
  const months = monthsStartingIn(from, end)
  const figures = partnerFigures(data)
  const withFigure = (channel: PartnerChannel) =>
    partnersIn(channel).filter((l) => months.some((m) => figures.has(`${l.id}::${m}`))).length
  return CHANNELS.map((channel) => ({
    channel,
    revenue: totals.get(channel)?.revenue ?? 0,
    units: totals.get(channel)?.units ?? 0,
    ...(channel === 'main' ? {} : { keyed: { done: withFigure(channel), of: partnersIn(channel).length } }),
  }))
}

/** One partner over some dates: each month whose 1st is in them, with its figure. */
export interface PartnerPeriodRow {
  locationId: string
  revenue: number
  months: { month: string; revenue: number; keyed?: PartnerSales }[]
}

/**
 * The dealers, or the consignment partners, over the dates chosen on Revenue
 * (20 November, later: "only selected data should appear for both Dealers and
 * Consignment separately and for dealers ... top most is highest value").
 * Each partner's months whose 1st is in the dates, keyed in or — in the
 * sample history — filed, added up; every partner listed, highest first, and
 * those with nothing after them.
 */
export const selectPartnerPeriod = (
  data: CrmData,
  channel: PartnerChannel,
  from: DateStr,
  to: DateStr,
): { months: string[]; rows: PartnerPeriodRow[]; total: number; withFigure: number } => {
  const months = monthsStartingIn(from, to)
  const figures = partnerFigures(data)
  const sen = (n: number) => Math.round(n * 100) / 100
  const name = (id: string) => locationById(id)?.name ?? id
  const rows = partnersIn(channel)
    .map((l) => {
      const ms = months.flatMap((month) => {
        const f = figures.get(`${l.id}::${month}`)
        return f ? [{ month, revenue: sen(f.revenue), ...(f.keyed ? { keyed: f.keyed } : {}) }] : []
      })
      return { locationId: l.id, revenue: sen(ms.reduce((a, m) => a + m.revenue, 0)), months: ms }
    })
    .sort(
      (a, b) =>
        b.revenue - a.revenue || b.months.length - a.months.length || name(a.locationId).localeCompare(name(b.locationId)),
    )
  return {
    months,
    rows,
    total: sen(rows.reduce((a, r) => a + r.revenue, 0)),
    withFigure: rows.filter((r) => r.months.length > 0).length,
  }
}

/** Every product sold in the period, its units and sales, in the range's order. */
export const selectSkuTotals = (data: CrmData, f: Filter): { skuId: string; label: string; units: number; revenue: number }[] => {
  const at = rangeIndex()
  return [...skuSalesIn(data, f)]
    .map(([skuId, v]) => ({ skuId, label: skuById(skuId)?.label ?? skuId, units: v.units, revenue: v.revenue }))
    .filter((r) => r.units > 0 || r.revenue > 0)
    .sort((a, b) => (at.get(a.skuId) ?? LAST_IN_RANGE) - (at.get(b.skuId) ?? LAST_IN_RANGE))
}

/**
 * The ribbon's slices: the first `top` countries, and the rest as one "Other"
 * — the chart only; the table lists every country (16 November).
 */
export const foldOrigins = (slices: OriginSlice[], top = 6): OriginSlice[] => {
  if (slices.length <= top) return slices
  const tail = slices.slice(top)
  const sum = (k: 'customers' | 'units' | 'revenue' | 'share') => tail.reduce((a, s) => a + s[k], 0)
  return [
    ...slices.slice(0, top),
    {
      countryCode: 'OTHER',
      name: 'Other',
      flag: '🌍',
      customers: sum('customers'),
      units: sum('units'),
      revenue: Math.round(sum('revenue') * 100) / 100,
      share: sum('share'),
    },
  ]
}

/** Every country that bought in the period, none folded into "Other" (16 November). */
export const selectCountryTotals = (data: CrmData, f: Filter): OriginSlice[] =>
  originSlicesFrom(originsIn(data, f), Number.MAX_SAFE_INTEGER)

/** The period's sales by channel, in the channels' own order. */
export const selectChannelTotals = (data: CrmData, f: Filter): { channel: Channel; revenue: number; units: number }[] => {
  const by = new Map<Channel, { revenue: number; units: number }>()
  for (const [id, t] of storeTally(data, f)) {
    const channel = locationById(id)?.channel
    if (!channel) continue
    const c = by.get(channel) ?? { revenue: 0, units: 0 }
    c.revenue += t.revenue
    c.units += t.units
    by.set(channel, c)
  }
  return CHANNELS.map((channel) => ({ channel, ...(by.get(channel) ?? { revenue: 0, units: 0 }) }))
    .map((c) => ({ ...c, revenue: Math.round(c.revenue * 100) / 100 }))
    .filter((c) => c.revenue > 0 || c.units > 0)
}

/** The period day by day, today live. A dealer's month counts on its 1st. */
export const selectDailySeries = (data: CrmData, f: Filter, metric: Metric): SeriesPoint[] => {
  const by = new Map<DateStr, { revenue: number; units: number }>()
  const at = (day: DateStr) => {
    const b = by.get(day) ?? { revenue: 0, units: 0 }
    by.set(day, b)
    return b
  }
  eachLineIn(data, f, (l, value, _basket, _locationId, day) => {
    const b = at(day)
    b.revenue += value
    b.units += l.qty
  })
  if (!narrowsByProduct(f)) {
    for (const p of data.partnerSales) {
      const day = `${p.month}-01`
      if (inWindow(day, f) && locationMatches(p.locationId, f)) at(day).revenue += p.revenueMYR
    }
  }
  return dateRange(f.from, f.to).map((date) => {
    const b = by.get(date)
    return { date, value: b ? (metric === 'revenue' ? Math.round(b.revenue) : b.units) : 0 }
  })
}

// ── By the four windows (asked on 1 November, after Revision 9) ──────────────

/** The four boxes' windows, then the dates chosen on a page of its own: a table's columns. */
export const SALES_WINDOWS = ['today', 'yesterday', 'monthToDate', 'lastMonth', 'chosen'] as const
export type SalesWindow = (typeof SALES_WINDOWS)[number]
/** One figure for each window. */
export type ByWindow<T> = Record<SalesWindow, T>

/**
 * Reads each of the four boxes' windows, narrowed by `base` as the boxes are,
 * and the page's own `chosen` dates, then lines the tallies up by key: one
 * entry a key, with what it did in every window and `none` where it did
 * nothing. Without dates of the page's own, the last window stays empty.
 */
const byWindow = <T>(
  data: CrmData,
  base: Partial<Filter>,
  chosen: Filter | null,
  read: (f: Filter) => Map<string, T>,
  none: () => T,
): Map<string, ByWindow<T>> => {
  const w = salesWindows(data.today)
  const at = ({ from, to }: { from: DateStr; to: DateStr }): Filter => ({ ...emptyFilter(from, to), ...base, from, to })
  const filters: ByWindow<Filter | null> = {
    today: at(w.today),
    yesterday: at(w.yesterday),
    monthToDate: at(w.monthToDate),
    lastMonth: at(w.lastMonth),
    chosen,
  }
  const out = new Map<string, ByWindow<T>>()
  for (const window of SALES_WINDOWS) {
    const f = filters[window]
    if (!f) continue
    for (const [key, figure] of read(f)) {
      const row = out.get(key) ?? { today: none(), yesterday: none(), monthToDate: none(), lastMonth: none(), chosen: none() }
      row[window] = figure
      out.set(key, row)
    }
  }
  return out
}

/** What one product sold in a window. */
export interface SkuSales {
  units: number
  revenue: number
}

export interface SkuSalesRow extends ByWindow<SkuSales> {
  skuId: string
  label: string
}

/** Each product's units and sales in a window, by the rules of the four boxes. */
const skuSalesIn = (data: CrmData, f: Filter): Map<string, SkuSales> => {
  const out = new Map<string, SkuSales>()
  eachLineIn(data, f, (l, value) => {
    const s = out.get(l.skuId) ?? { units: 0, revenue: 0 }
    s.units += l.qty
    s.revenue += value
    out.set(l.skuId, s)
  })
  for (const s of out.values()) s.revenue = Math.round(s.revenue * 100) / 100
  return out
}

/**
 * Product performance by the four boxes' windows — today live, yesterday as
 * filed, the month so far and last month — and the page's own dates as well.
 * `base` narrows them as it narrows the boxes; `chosen` is the whole filter,
 * dates and all. A dealer's month keyed in at head office has no products
 * behind it, so it is not here. Best month so far first.
 */
export const selectSkuSales = (data: CrmData, base: Partial<Filter>, chosen: Filter): SkuSalesRow[] =>
  [...byWindow(data, base, chosen, (f) => skuSalesIn(data, f), () => ({ units: 0, revenue: 0 }))]
    .map(([skuId, w]) => ({ skuId, label: skuById(skuId)?.label ?? skuId, ...w }))
    .sort(
      (a, b) =>
        b.monthToDate.revenue - a.monthToDate.revenue ||
        b.lastMonth.revenue - a.lastMonth.revenue ||
        b.chosen.revenue - a.chosen.revenue ||
        b.monthToDate.units - a.monthToDate.units ||
        a.label.localeCompare(b.label),
    )

/** What one nationality bought in a window: its customers, what they bought, and what it came to. */
export interface OriginSales {
  customers: number
  units: number
  revenue: number
}

export interface OriginSalesRow extends ByWindow<OriginSales> {
  countryCode: string
  name: string
  flag: string
}

/**
 * Where the customers came from, by the four boxes' windows and the page's
 * own dates (asked on 1 November, after Revision 9): each nationality's
 * customers, units and sales. `base` narrows them as it narrows the boxes —
 * on a store's page, to that store. Most customers this month first.
 */
export const selectOriginSales = (data: CrmData, base: Partial<Filter>, chosen: Filter | null): OriginSalesRow[] => {
  const read = (f: Filter) =>
    new Map(
      [...originsIn(data, f)].map(([code, t]): [string, OriginSales] => [
        code,
        { customers: t.baskets.size, units: t.units, revenue: Math.round(t.revenue * 100) / 100 },
      ]),
    )
  return [...byWindow(data, base, chosen, read, () => ({ customers: 0, units: 0, revenue: 0 }))]
    .map(([countryCode, w]) => {
      const meta = countries.find((c) => c.code === countryCode)
      return { countryCode, name: meta?.name ?? countryCode, flag: meta?.flag ?? '🏳️', ...w }
    })
    .sort(
      (a, b) =>
        b.monthToDate.customers - a.monthToDate.customers ||
        b.lastMonth.customers - a.lastMonth.customers ||
        b.chosen.customers - a.chosen.customers ||
        b.monthToDate.units - a.monthToDate.units ||
        a.name.localeCompare(b.name),
    )
}

// ── One nationality, opened ─────────────────────────────────────────────────

export interface CountryDetail {
  countryCode: string
  customers: number
  units: number
  revenue: number
  /** Stores, most customers of this nationality first. */
  stores: { locationId: string; customers: number; units: number; revenue: number }[]
  /** Products, most bought by this nationality first. */
  skus: { skuId: string; label: string; units: number; revenue: number }[]
}

/**
 * Everything one nationality bought in a window: which stores they shopped
 * at, most customers first, and which products, most bought first (client,
 * 1 November: "which store had the most customers from the country, which
 * perfume SKU was bought the most from this country").
 *
 * Every day is read as filed, as *Which countries bought* reads it. With
 * `live`, it is read by the rules of the four boxes instead — today from the
 * counter, and its closing not counted as well — for a figure opened from a
 * table by the four windows.
 */
export const selectCountryDetail = (data: CrmData, f: Filter, countryCode: string, live = false): CountryDetail => {
  const total = newOriginTally()
  const stores = new Map<string, OriginTally>()
  const products = new Map<string, { units: number; revenue: number }>()
  const count = (l: SaleLine, value: number, basket: string, locationId: string) => {
    if (l.countryCode !== countryCode) return
    const store = stores.get(locationId) ?? newOriginTally()
    for (const t of [store, total]) {
      t.units += l.qty
      t.revenue += value
      t.baskets.add(basket)
    }
    stores.set(locationId, store)
    const p = products.get(l.skuId) ?? { units: 0, revenue: 0 }
    p.units += l.qty
    p.revenue += value
    products.set(l.skuId, p)
  }
  if (live) eachLineIn(data, f, count)
  else {
    const allowed = skuIdsFor(f)
    for (const c of filteredClosings(data, f)) {
      const basis = basisOf(c.locationId)
      c.lines.forEach((l, i) => {
        if (lineMatches(l, allowed, f)) count(l, l.qty * lineUnitPrice(l, basis), basketOf(c.locationId, l, `${c.id}#${i}`), c.locationId)
      })
    }
  }
  const sen = (n: number) => Math.round(n * 100) / 100
  return {
    countryCode,
    customers: total.baskets.size,
    units: total.units,
    revenue: sen(total.revenue),
    stores: [...stores.entries()]
      .map(([locationId, t]) => ({ locationId, customers: t.baskets.size, units: t.units, revenue: sen(t.revenue) }))
      .sort((a, b) => b.customers - a.customers || b.revenue - a.revenue),
    skus: [...products.entries()]
      .map(([skuId, p]) => ({ skuId, label: skuById(skuId)?.label ?? skuId, units: p.units, revenue: sen(p.revenue) }))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue),
  }
}

// ── The calendar ────────────────────────────────────────────────────────────

/** The lines of one day, store by store: as filed, or today's as they stand. */
const linesOfDay = (data: CrmData, day: DateStr, locationId?: string): [string, SaleLine[], boolean][] => {
  const filed = new Set(
    data.closings.filter((c) => c.period === day && c.periodType === 'day').map((c) => c.locationId),
  )
  if (day === data.today) {
    return Object.entries(data.liveLines)
      .filter(([id]) => !locationId || id === locationId)
      .map(([id, lines]) => [id, lines, filed.has(id)])
  }
  return data.closings
    .filter((c) => c.period === day && c.periodType === 'day' && (!locationId || c.locationId === locationId))
    .map((c) => [c.locationId, c.lines, true])
}

/**
 * Each day of a month, up to today, with its sales: what was filed for the
 * days that have ended, and today as it stands. Days with nothing on record
 * are left out.
 */
export const selectDailySales = (data: CrmData, month: string, locationId?: string): Map<DateStr, SalesFigure> => {
  const out = new Map<DateStr, SalesFigure>()
  const days = new Set<DateStr>(
    data.closings
      .filter((c) => c.periodType === 'day' && monthKey(c.period) === month && c.period < data.today)
      .filter((c) => !locationId || c.locationId === locationId)
      .map((c) => c.period),
  )
  if (monthKey(data.today) === month) days.add(data.today)
  for (const day of [...days].sort()) {
    const acc = blank()
    for (const [id, lines] of linesOfDay(data, day, locationId)) {
      const basis = basisOf(id)
      lines.forEach((l, i) => {
        acc.revenue += l.qty * lineUnitPrice(l, basis)
        acc.units += l.qty
        acc.baskets.add(basketOf(id, l, `${day}#${i}`))
      })
    }
    if (day !== data.today || acc.baskets.size || acc.units) out.set(day, finish(acc))
  }
  return out
}

export interface DayDetail extends SalesFigure {
  day: DateStr
  /** Each store that sold, or filed, that day — best first. */
  stores: (StoreSales & { filed: boolean })[]
  /** Each product sold, and which nationalities bought it. */
  skus: { skuId: string; label: string; units: number; revenue: number; countries: { countryCode: string; units: number }[] }[]
  /** Each nationality: how many customers, and what they bought. */
  countries: { countryCode: string; customers: number; units: number; revenue: number }[]
}

/**
 * One day, opened from the calendar (client, 1 November): each store's sales,
 * how many of each product went, and which countries the buyers came from.
 */
export const selectDayDetail = (data: CrmData, day: DateStr, locationId?: string): DayDetail => {
  const at = rangeIndex()
  const total = blank()
  const stores: DayDetail['stores'] = []
  const products = new Map<string, { units: number; revenue: number; countries: Map<string, number> }>()
  const nations = new Map<string, OriginTally>()
  for (const [id, lines, filed] of linesOfDay(data, day, locationId)) {
    const basis = basisOf(id)
    const here = blank()
    lines.forEach((l, i) => {
      const value = l.qty * lineUnitPrice(l, basis)
      const basket = basketOf(id, l, `${day}#${i}`)
      for (const f of [here, total]) {
        f.revenue += value
        f.units += l.qty
        f.baskets.add(basket)
      }
      const p = products.get(l.skuId) ?? { units: 0, revenue: 0, countries: new Map<string, number>() }
      p.units += l.qty
      p.revenue += value
      if (l.countryCode) p.countries.set(l.countryCode, (p.countries.get(l.countryCode) ?? 0) + l.qty)
      products.set(l.skuId, p)
      tallyOrigin(nations, id, l, value, `${day}#${i}`)
    })
    stores.push({ locationId: id, ...finish(here), filed })
  }
  const name = (id: string) => locationById(id)?.shortName ?? id
  const sen = (n: number) => Math.round(n * 100) / 100
  return {
    day,
    ...finish(total),
    stores: stores.sort((a, b) => b.revenue - a.revenue || b.units - a.units || name(a.locationId).localeCompare(name(b.locationId))),
    skus: [...products.entries()]
      .map(([skuId, p]) => ({
        skuId,
        label: skuById(skuId)?.label ?? skuId,
        units: p.units,
        revenue: sen(p.revenue),
        countries: [...p.countries.entries()]
          .map(([countryCode, units]) => ({ countryCode, units }))
          .sort((a, b) => b.units - a.units || a.countryCode.localeCompare(b.countryCode)),
      }))
      // In the range's order, as every list of products is (Revision 10).
      .sort((a, b) => (at.get(a.skuId) ?? LAST_IN_RANGE) - (at.get(b.skuId) ?? LAST_IN_RANGE)),
    countries: [...nations.entries()]
      .map(([countryCode, t]) => ({ countryCode, customers: t.baskets.size, units: t.units, revenue: sen(t.revenue) }))
      .sort((a, b) => b.customers - a.customers || b.units - a.units || a.countryCode.localeCompare(b.countryCode)),
  }
}

// ── A store's day (Revision 10) ─────────────────────────────────────────────

/** One product on a store's day: what it went for, what left the shelf, what was counted. */
export interface StoreDayRow {
  skuId: string
  label: string
  code: string
  /** Every price it went at that day, most units first; its usual price if it did not sell. */
  prices: SoldAt[]
  units: number
  revenue: number
  /** Off the shelf that day: sold, plus any tester, damage or sample written off. */
  deducted: number
  /** Counted at that day's close; null where nothing was counted — today, or a day not filed. */
  onHand: number | null
}

export interface StoreDay extends SalesFigure {
  day: DateStr
  /** Today, read from the counter as it stands. */
  live: boolean
  /** That day's closing, if it was filed. */
  closing?: Closing
  /** How the day was paid, as filed. */
  tender?: Closing['tender']
  /** Every product on the shelf, in the range's order, and anything else sold or counted that day. */
  rows: StoreDayRow[]
  countries: DayDetail['countries']
}

/**
 * One store's day, for its page (Revision 10, the client's eighth): "click on
 * the date, then only appear" that day — each product with the price it went
 * for, what the day took off the shelf, and the count at that day's close;
 * how it was paid; and where the customers came from. Days that have ended
 * read their closing; today reads the counter, with nothing counted yet.
 */
export const selectStoreDay = (data: CrmData, locationId: string, day: DateStr): StoreDay => {
  const live = day === data.today
  const closing = data.closings.find((c) => c.locationId === locationId && c.period === day && c.periodType === 'day')
  const lines = live ? (data.liveLines[locationId] ?? []) : (closing?.lines ?? [])
  const detail = selectDayDetail(data, day, locationId)
  const rows = storeDayRows(
    lines,
    closing ? [...closing.lines, ...closing.writeOffs] : lines,
    closing ? new Map(closing.stockCount.map((c) => [c.skuId, c.counted])) : null,
    basisOf(locationId),
  )

  return {
    day,
    live,
    closing,
    tender: closing?.tender,
    revenue: detail.revenue,
    units: detail.units,
    customers: detail.customers,
    rows,
    countries: detail.countries,
  }
}

/**
 * A store's day, product by product: every price each went at, what left the
 * shelf (`offShelf`: the sales, and anything written off), and the count at
 * the close (`counts`, or null where nothing was counted). For the store's
 * page, from what was filed; for the promoter's closing (20 November: "so that
 * they can refer back the deducted stocks and sales of the day"), from the
 * closing being filled in.
 */
export const storeDayRows = (
  lines: SaleLine[],
  offShelf: { skuId: string; qty: number }[],
  counts: Map<string, number> | null,
  basis: PriceBasis,
): StoreDayRow[] => {
  const sold = new Map<string, { units: number; revenue: number; prices: SoldAt[] }>()
  for (const l of lines) {
    const unitPrice = lineUnitPrice(l, basis)
    const tier = l.priceTier ?? basis
    const s = sold.get(l.skuId) ?? { units: 0, revenue: 0, prices: [] }
    s.units += l.qty
    s.revenue += l.qty * unitPrice
    const same = s.prices.find((p) => p.unitPrice === unitPrice && p.tier === tier)
    if (same) same.qty += l.qty
    else s.prices.push({ unitPrice, tier, qty: l.qty })
    sold.set(l.skuId, s)
  }
  const off = new Map<string, number>()
  for (const l of offShelf) off.set(l.skuId, (off.get(l.skuId) ?? 0) + l.qty)
  const count = counts ?? new Map<string, number>()

  const ids = [...countedSkus.map((s) => s.id)]
  for (const id of [...sold.keys(), ...count.keys()]) if (!ids.includes(id)) ids.push(id)
  const at = rangeIndex()
  ids.sort((a, b) => (at.get(a) ?? LAST_IN_RANGE) - (at.get(b) ?? LAST_IN_RANGE))

  return ids.map((skuId) => {
    const sku = skuById(skuId)
    const s = sold.get(skuId)
    const usual: SoldAt = isFoc(sku) ? { unitPrice: 0, tier: 'foc', qty: 0 } : { unitPrice: priceOf(sku, basis), tier: basis, qty: 0 }
    return {
      skuId,
      label: sku?.label ?? skuId,
      code: sku?.code ?? '',
      prices: s ? [...s.prices].sort((a, b) => b.qty - a.qty) : [usual],
      units: s?.units ?? 0,
      revenue: Math.round((s?.revenue ?? 0) * 100) / 100,
      deducted: off.get(skuId) ?? 0,
      onHand: counts ? (count.get(skuId) ?? null) : null,
    }
  })
}

/**
 * A closed day exactly as it was filed: its sales, what it took off the shelf
 * and its counts, all from the closing. The counter may have moved on since —
 * a sale changed after today was closed — and must not be read into it
 * (25 November).
 */
export const filedDayRows = (closing: Closing): StoreDayRow[] =>
  storeDayRows(
    closing.lines,
    [...closing.lines, ...closing.writeOffs],
    new Map(closing.stockCount.map((c) => [c.skuId, c.counted])),
    basisOf(closing.locationId),
  )

// ── Dealers and consignment, month by month ─────────────────────────────────

export type PartnerChannel = 'dealer' | 'consignment'

/** The dealers, or the consignment partners, that are trading. */
export const partnersIn = (channel: PartnerChannel) =>
  tradingLocations.filter((l) => l.channel === channel)

export interface PartnerMonthRow {
  locationId: string
  name: string
  shortName: string
  revenue: number
  /** Whether this partner has a figure for the month at all. */
  has: boolean
  /** The figure keyed in at head office, where that is where it came from. */
  keyed?: PartnerSales
}

/**
 * Every partner figure there is, by `locationId::YYYY-MM`: what head office
 * keyed in, or — where nothing was keyed — the month's filed closings, which
 * is how the sample history records partners. A keyed figure always stands.
 */
const partnerFigures = (data: CrmData): Map<string, { revenue: number; keyed?: PartnerSales }> => {
  const partners = new Set(
    tradingLocations.filter((l) => l.channel === 'dealer' || l.channel === 'consignment').map((l) => l.id),
  )
  const out = new Map<string, { revenue: number; keyed?: PartnerSales }>()
  for (const c of data.closings) {
    if (!partners.has(c.locationId)) continue
    const key = `${c.locationId}::${monthKey(c.period)}`
    const basis = basisOf(c.locationId)
    const figure = out.get(key) ?? { revenue: 0 }
    figure.revenue += c.lines.reduce((a, l) => a + l.qty * lineUnitPrice(l, basis), 0)
    out.set(key, figure)
  }
  for (const p of data.partnerSales) out.set(`${p.locationId}::${p.month}`, { revenue: p.revenueMYR, keyed: p })
  return out
}

/** One partner's months on record, the latest first: what was keyed in, or filed. */
export const selectPartnerMonths = (
  data: CrmData,
  locationId: string,
): { month: string; revenue: number; keyed?: PartnerSales }[] =>
  [...partnerFigures(data).entries()]
    .filter(([key]) => key.startsWith(`${locationId}::`))
    .map(([key, f]) => ({
      month: key.slice(locationId.length + 2),
      revenue: Math.round(f.revenue * 100) / 100,
      ...(f.keyed ? { keyed: f.keyed } : {}),
    }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))

/** Each dealer's (or consignment partner's) sales for a month, best first. */
export const selectPartnerMonth = (
  data: CrmData,
  channel: PartnerChannel,
  month: string,
  figures = partnerFigures(data),
): PartnerMonthRow[] =>
  partnersIn(channel)
    .map((l) => {
      const figure = figures.get(`${l.id}::${month}`)
      return {
        locationId: l.id,
        name: l.name,
        shortName: l.shortName,
        revenue: Math.round((figure?.revenue ?? 0) * 100) / 100,
        has: Boolean(figure),
        keyed: figure?.keyed,
      }
    })
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))

/**
 * The month the overview reports a channel for (client's fifth revision):
 * last month, once every partner's figure is in — "make sure all dealers'
 * sales data from the previous month is keyed in; if not complete yet, show
 * the latest completed month instead". This month never counts, being
 * unfinished. Null until some month is complete.
 */
export const latestCompleteMonth = (data: CrmData, channel: PartnerChannel, lookBack = 24): string | null => {
  const figures = partnerFigures(data)
  const partners = partnersIn(channel)
  if (!partners.length) return null
  let month = shiftMonth(monthKey(data.today), -1)
  for (let i = 0; i < lookBack; i++, month = shiftMonth(month, -1)) {
    if (partners.every((l) => figures.has(`${l.id}::${month}`))) return month
  }
  return null
}

/**
 * The month the overview shows a channel for, as soon as any partner of the
 * kind is keyed in (16 November: "even only three key in, you should show me
 * the three dealers"): the latest month up to last month with any figure, or
 * this month where nothing earlier has one. Null until something is in.
 */
export const latestPartnerMonth = (data: CrmData, channel: PartnerChannel): string | null => {
  const ids = new Set(partnersIn(channel).map((l) => l.id))
  const thisMonth = monthKey(data.today)
  const months = new Set<string>()
  for (const p of data.partnerSales) if (ids.has(p.locationId)) months.add(p.month)
  for (const c of data.closings) if (ids.has(c.locationId)) months.add(monthKey(c.period))
  const sorted = [...months].filter((m) => m <= thisMonth).sort()
  const finished = sorted.filter((m) => m < thisMonth)
  return finished.length ? finished[finished.length - 1] : (sorted[sorted.length - 1] ?? null)
}

/** The latest month, up to this one, in which any partner of the kind has a figure. */
export const latestMonthWithFigures = (data: CrmData, channel: PartnerChannel): string | null => {
  const ids = new Set(partnersIn(channel).map((l) => l.id))
  let latest: string | null = null
  const consider = (m: string) => {
    if (m <= monthKey(data.today) && (!latest || m > latest)) latest = m
  }
  for (const p of data.partnerSales) if (ids.has(p.locationId)) consider(p.month)
  for (const c of data.closings) if (ids.has(c.locationId)) consider(monthKey(c.period))
  return latest
}

/** How many partners have a figure for a month — "38 of 44 keyed in". */
export const partnersKeyed = (data: CrmData, channel: PartnerChannel, month: string): number => {
  const figures = partnerFigures(data)
  return partnersIn(channel).filter((l) => figures.has(`${l.id}::${month}`)).length
}

export { collections, locations }
