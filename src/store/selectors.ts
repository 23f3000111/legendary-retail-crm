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
  lineUnitPrice,
  priceOfId,
  productById,
  type CollectionId,
  type Variant,
} from '../data/products'
import { countries } from '../data/countries'
import { addDays, dateRange, daysBetween, monthKey } from '../lib/dates'
import { effectiveQty, isOpen } from '../lib/po-machine'
import type { Alert, Closing, CrmData, DateStr, PurchaseOrder } from '../data/types'

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

const locationMatches = (locationId: string, f: Filter): boolean => {
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

const inWindow = (date: DateStr, f: Filter) =>
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

export const totalsFor = (data: CrmData, f: Filter): Totals => {
  const allowed = skuIdsFor(f)
  const t = emptyTotals()

  for (const c of filteredClosings(data, f)) {
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

  t.revenue = Math.round(t.revenue)
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

  for (const c of filteredClosings(data, f)) {
    const bucket = byDate.get(c.period) ?? { revenue: 0, units: 0 }
    for (const line of c.lines) {
      if (!lineMatches(line, allowed, f)) continue
      bucket.revenue += line.qty * lineUnitPrice(line, basisOf(c.locationId))
      bucket.units += line.qty
    }
    byDate.set(c.period, bucket)
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
  /** Units bought by this nationality — exact, from the sale lines. */
  units: number
  revenue: number
  share: number
}

export const originSlicesFrom = (
  tally: Map<string, { units: number; revenue: number }>,
  top = 6,
): OriginSlice[] => {
  const total = [...tally.values()].reduce((a, b) => a + b.units, 0)
  const sorted = [...tally.entries()].sort((a, b) => b[1].units - a[1].units)
  const head = sorted.slice(0, top)
  const tail = sorted.slice(top)

  const slice = (code: string, units: number, revenue: number): OriginSlice => {
    const meta = countries.find((c) => c.code === code)
    return {
      countryCode: code,
      name: meta?.name ?? code,
      flag: meta?.flag ?? '🏳️',
      units,
      revenue: Math.round(revenue),
      share: total ? (units / total) * 100 : 0,
    }
  }

  const out = head.map(([code, v]) => slice(code, v.units, v.revenue))
  if (tail.length) {
    const units = tail.reduce((a, [, v]) => a + v.units, 0)
    const revenue = tail.reduce((a, [, v]) => a + v.revenue, 0)
    if (units > 0) {
      out.push({
        countryCode: 'OTHER',
        name: 'Other',
        flag: '🌍',
        units,
        revenue: Math.round(revenue),
        share: total ? (units / total) * 100 : 0,
      })
    }
  }
  return out
}

/** Units and revenue by nationality across the filtered window. */
export const selectOriginMix = (data: CrmData, f: Filter, top = 6): OriginSlice[] => {
  const allowed = skuIdsFor(f)
  const tally = new Map<string, { units: number; revenue: number }>()

  for (const c of filteredClosings(data, f)) {
    for (const line of c.lines) {
      if (!line.countryCode) continue
      if (!lineMatches(line, allowed, f)) continue
      const bucket = tally.get(line.countryCode) ?? { units: 0, revenue: 0 }
      bucket.units += line.qty
      bucket.revenue += line.qty * lineUnitPrice(line, basisOf(c.locationId))
      tally.set(line.countryCode, bucket)
    }
  }

  return originSlicesFrom(tally, top)
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

      const mtd = data.closings
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
   * False until the store has filed its first count. Before that nothing is
   * known about the shelf, and "0 on hand" would raise a low-stock alert on
   * every product of every store the day the system starts.
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
 * This is a count for head office visibility only. The client was explicit that
 * once stock leaves the warehouse it is no longer theirs, and that this must
 * not be confused with SQL Accounting (Q35) — so nothing here is ever valued.
 */
export const selectStock = (data: CrmData, locationId: string): StockRow[] => {
  const history = data.closings
    .filter((c) => c.locationId === locationId)
    .sort((a, b) => (a.period < b.period ? 1 : -1))
  const latest = history[0]
  const since = addDays(data.today, -VELOCITY_WINDOW)
  const recent = history.filter((c) => daysBetween(since, c.period) >= 0)
  const periods = recent.length || 1

  const inbound = new Map<string, number>()
  for (const po of data.purchaseOrders) {
    if (po.locationId !== locationId) continue
    if (po.status !== 'in_transit' && po.status !== 'packed') continue
    for (const l of po.lines) inbound.set(l.skuId, (inbound.get(l.skuId) ?? 0) + effectiveQty(l))
  }

  const soldOf = (skuId: string) =>
    recent.reduce(
      (a, c) => a + c.lines.filter((l) => l.skuId === skuId).reduce((s, l) => s + l.qty, 0),
      0,
    )

  // Testers are ordered but never counted on a shelf (Revision 2), so they are
  // not part of stock on hand.
  const counted = Boolean(latest && latest.stockCount.length > 0)
  return countedSkus.map((s) => {
    const onHand = latest?.stockCount.find((m) => m.skuId === s.id)?.counted ?? 0
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
    const gap = Math.max(0, target - onHand - (inbound.get(s.id) ?? 0))
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

export { collections, locations }
