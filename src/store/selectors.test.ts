import { describe, it, expect } from 'vitest'
import { buildSeed, DEMO_TODAY } from '../data/seed'
import { basisOf, locationsInChannel, tradingLocations } from '../data/locations'
import { priceOfId, skuById, skus } from '../data/products'
import { addDays, dateRange, startOfMonth, startOfWeek } from '../lib/dates'
import type { Closing, SaleLine } from '../data/types'
import {
  deriveAlerts,
  selectNotFiled,
  countryCoverage,
  emptyFilter,
  metricValue,
  originSlicesFrom,
  previousWindow,
  selectKpis,
  selectLocationRows,
  selectOriginMix,
  selectOriginsBetween,
  selectPricesAt,
  selectSalesReport,
  type ReportRule,
  selectSkuPerformance,
  selectSkusForCountry,
  selectStock,
  selectSuggestedPoLines,
  selectTimeSeries,
  totalsFor,
  type Filter,
} from './selectors'

const data = buildSeed()
const last30 = (): Filter => emptyFilter(addDays(DEMO_TODAY, -29), DEMO_TODAY)

/** Revenue counted straight off the raw closings, as an independent check. */
const bruteForce = (from: string, to: string, locationId?: string) =>
  data.closings
    .filter((c) => c.period >= from && c.period <= to && (!locationId || c.locationId === locationId))
    .reduce(
      (a, c) => a + c.lines.reduce((s, l) => s + l.qty * priceOfId(l.skuId, basisOf(c.locationId)), 0),
      0,
    )

describe('totals', () => {
  it('matches a brute-force count over the same window', () => {
    const f = last30()
    expect(totalsFor(data, f).revenue).toBe(Math.round(bruteForce(f.from, f.to)))
  })

  it('scopes to a single store', () => {
    const f = { ...last30(), locationIds: ['pavilion-5'] }
    expect(totalsFor(data, f).revenue).toBe(Math.round(bruteForce(f.from, f.to, 'pavilion-5')))
  })

  it('splits the group across its channels without losing revenue', () => {
    const f = last30()
    const whole = totalsFor(data, f).revenue
    const parts = (['main', 'dealer', 'consignment'] as const).reduce(
      (a, channel) => a + totalsFor(data, { ...f, channels: [channel] }).revenue,
      0,
    )
    expect(Math.abs(whole - parts)).toBeLessThanOrEqual(3)
  })

  it('splits the group across its products the same way', () => {
    const f = last30()
    const whole = totalsFor(data, f).revenue
    const parts = skus.reduce((a, s) => a + totalsFor(data, { ...f, skuIds: [s.id] }).revenue, 0)
    expect(Math.abs(whole - parts)).toBeLessThanOrEqual(skus.length)
  })

  it('makes a product filter exact rather than approximate', () => {
    const f = { ...last30(), skuIds: ['orchid-retail'] }
    const t = totalsFor(data, f)
    // Not units × one price: BSAS is counted on the retail price and everybody
    // else on the promotion price, so the two differ. Counted line by line.
    const expected = data.closings
      .filter((c) => c.period >= f.from && c.period <= f.to)
      .reduce(
        (a, c) =>
          a +
          c.lines
            .filter((l) => l.skuId === 'orchid-retail')
            .reduce((s, l) => s + l.qty * priceOfId(l.skuId, basisOf(c.locationId)), 0),
        0,
      )
    expect(t.revenue).toBe(Math.round(expected))
    expect(t.units).toBeGreaterThan(0)
  })

  it('returns zeroes for a window with no trading', () => {
    const t = totalsFor(data, emptyFilter('2020-01-01', '2020-01-31'))
    expect(t).toMatchObject({ revenue: 0, units: 0, attributedUnits: 0 })
  })

  it('counts a line at the price the counter chose, not the store’s usual one', () => {
    // Pavilion is counted on the promotion price. A customer who paid full
    // price is a retail line, and the takings must say so.
    const day = '2031-01-01'
    const closing = {
      ...data.closings.find((c) => c.locationId === 'pavilion-5')!,
      id: 'test-tier',
      period: day,
      lines: [
        { skuId: 'orchid-retail', qty: 1, priceTier: 'retail' as const },
        { skuId: 'orchid-retail', qty: 1, priceTier: 'promotion' as const },
        { skuId: 'orchid-retail', qty: 1 },
        { skuId: 'wish-1-set', qty: 2, priceTier: 'offer' as const },
      ],
    }
    const withTiers = { ...data, closings: [...data.closings, closing] }
    const t = totalsFor(withTiers, emptyFilter(day, day))
    expect(t.revenue).toBe(238 + 188 + 188 + 2 * 10)
    expect(t.units).toBe(5)
  })
})

describe('country attribution is exact, not estimated', () => {
  const f = { ...last30(), countryCodes: ['CN'] }

  it('counts only lines that actually carry that country', () => {
    const expected = data.closings
      .filter((c) => c.period >= f.from && c.period <= f.to)
      .reduce(
        (a, c) =>
          a +
          c.lines
            .filter((l) => l.countryCode === 'CN')
            .reduce((s, l) => s + l.qty * priceOfId(l.skuId, basisOf(c.locationId)), 0),
        0,
      )
    expect(totalsFor(data, f).revenue).toBe(Math.round(expected))
  })

  it('excludes dealers and consignment rather than estimating them', () => {
    // Those channels never record a country, so a country filter must return
    // nothing for them at all.
    const dealersOnly = { ...f, channels: ['dealer' as const] }
    expect(totalsFor(data, dealersOnly).revenue).toBe(0)
  })

  it('reports partial coverage so the screen can say so', () => {
    const all = countryCoverage(data, last30())
    expect(all.partial).toBe(true)
    expect(all.capableLocations).toBe(locationsInChannel('main').filter((l) => l.status === 'open').length)

    const mainOnly = countryCoverage(data, { ...last30(), channels: ['main'] })
    expect(mainOnly.partial).toBe(false)
  })

  it('reassembles to the main-store whole when every country is selected', () => {
    const main = { ...last30(), channels: ['main' as const] }
    const codes = [
      ...new Set(
        data.closings.flatMap((c) => c.lines.map((l) => l.countryCode).filter(Boolean) as string[]),
      ),
    ]
    const all = totalsFor(data, { ...main, countryCodes: codes }).revenue
    expect(Math.abs(all - totalsFor(data, main).revenue)).toBeLessThanOrEqual(2)
  })

  it('answers what one country bought', () => {
    const rows = selectSkusForCountry(data, { ...last30(), channels: ['main'] }, 'CN')
    expect(rows.length).toBeGreaterThan(0)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].revenue).toBeGreaterThanOrEqual(rows[i].revenue)
    }
  })
})

describe('period comparison', () => {
  it('shifts the window back by exactly its own length', () => {
    const prev = previousWindow(emptyFilter('2026-07-01', '2026-07-30'))
    expect(prev.from).toBe('2026-06-01')
    expect(prev.to).toBe('2026-06-30')
  })

  it('reports null rather than zero when there is no prior period', () => {
    expect(selectKpis(data, emptyFilter('2020-02-01', '2020-02-29')).delta.revenue).toBeNull()
  })
})

describe('time series', () => {
  it('emits one point per calendar day, including days nobody traded', () => {
    const f = last30()
    const series = selectTimeSeries(data, f, 'revenue')
    expect(series.length).toBe(dateRange(f.from, f.to).length)
    expect(series[series.length - 1].date).toBe(f.to)
  })

  it('sums to the same revenue as the totals selector', () => {
    const f = last30()
    const summed = selectTimeSeries(data, f, 'revenue').reduce((a, p) => a + p.value, 0)
    expect(Math.abs(summed - totalsFor(data, f).revenue)).toBeLessThanOrEqual(40)
  })
})

describe('country mix', () => {
  it('caps the palette at six and folds the rest into Other', () => {
    const mix = selectOriginMix(data, last30())
    expect(mix.length).toBeLessThanOrEqual(7)
    if (mix.length === 7) expect(mix[6].countryCode).toBe('OTHER')
  })

  it('shares sum to 100 and rank largest first', () => {
    const mix = selectOriginMix(data, last30())
    expect(mix.reduce((a, s) => a + s.share, 0)).toBeCloseTo(100, 4)
    const ranked = mix.filter((s) => s.countryCode !== 'OTHER')
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].units).toBeGreaterThanOrEqual(ranked[i].units)
    }
  })

  it('returns nothing for an empty tally', () => {
    expect(originSlicesFrom(new Map())).toEqual([])
  })
})

describe('product performance', () => {
  it('ranks by revenue and reconciles with the window total', () => {
    const f = last30()
    const rows = selectSkuPerformance(data, f)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].revenue).toBeGreaterThanOrEqual(rows[i].revenue)
    }
    const summed = rows.reduce((a, r) => a + r.revenue, 0)
    expect(Math.abs(summed - totalsFor(data, f).revenue)).toBeLessThanOrEqual(rows.length)
  })
})

describe('stock', () => {
  const locationId = 'klcc-isetan'

  it('reads on-hand from the store’s most recent count', () => {
    const latest = data.closings
      .filter((c) => c.locationId === locationId)
      .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
    for (const row of selectStock(data, locationId)) {
      expect(row.onHand).toBe(latest.stockCount.find((m) => m.skuId === row.skuId)?.counted ?? 0)
    }
  })

  it('classifies status against the reorder level', () => {
    for (const row of selectStock(data, locationId)) {
      if (row.onHand === 0) expect(row.status).toBe('out')
      else if (row.onHand <= row.reorderPoint / 2) expect(row.status).toBe('critical')
      else if (row.onHand <= row.reorderPoint) expect(row.status).toBe('low')
      else expect(row.status).toBe('ok')
    }
  })

  it('suggests whole cases only', () => {
    for (const row of selectStock(data, locationId)) {
      if (row.suggested > 0) expect(row.suggested % (skuById(row.skuId)!.caseSize)).toBe(0)
    }
  })

  it('only offers to order what is below the reorder level', () => {
    const offered = selectSuggestedPoLines(data, locationId).map((l) => l.skuId)
    const flagged = selectStock(data, locationId)
      .filter((r) => r.status !== 'ok' && r.suggested > 0)
      .map((r) => r.skuId)
    expect(offered).toEqual(flagged)
  })
})

describe('location rows', () => {
  it('sorts by the chosen measure, descending', () => {
    for (const metric of ['revenue', 'units'] as const) {
      const rows = selectLocationRows(data, last30(), metric)
      for (let i = 1; i < rows.length; i++) {
        expect(metricValue(rows[i - 1], metric)).toBeGreaterThanOrEqual(metricValue(rows[i], metric))
      }
    }
  })

  it('covers every trading location when nothing is filtered', () => {
    expect(selectLocationRows(data, last30()).length).toBe(tradingLocations.length)
  })

  it('gives a target pace only to the stores that carry a target', () => {
    for (const r of selectLocationRows(data, last30())) {
      if (r.channel === 'main') expect(r.targetPace).not.toBeNull()
      else expect(r.targetPace).toBeNull()
    }
  })

  it('narrows to the filtered channel', () => {
    const rows = selectLocationRows(data, { ...last30(), channels: ['consignment'] })
    expect(rows.every((r) => r.channel === 'consignment')).toBe(true)
    expect(rows.length).toBe(locationsInChannel('consignment').length)
  })
})

// ── A store that has not started ────────────────────────────────────────────

describe('before a store has ever filed', () => {
  /** The system on day one: the people exist, nothing else does. */
  const empty = {
    ...data,
    closings: [],
    purchaseOrders: [],
    liveLines: {},
    today: DEMO_TODAY,
  }

  it('says the shelf is unknown rather than empty', () => {
    const rows = selectStock(empty, 'pavilion-5')
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.counted, r.label).toBe(false)
      // Not "out of stock" — nobody has looked yet.
      expect(r.status, r.label).toBe('ok')
      expect(r.suggested, r.label).toBe(0)
    }
  })

  it('raises no alert about stock nobody has counted', () => {
    const alerts = deriveAlerts(empty, new Set())
    expect(alerts.filter((a) => a.type === 'low_stock')).toHaveLength(0)
  })

  it('does not call a store late before it has filed anything', () => {
    // A store with no history has not "missed" yesterday; it has not started.
    expect(selectNotFiled(empty, addDays(DEMO_TODAY, -1))).toEqual([])
    expect(deriveAlerts(empty, new Set()).filter((a) => a.type === 'missed_closing')).toHaveLength(0)
  })

  it('starts counting missed days only after the first closing', () => {
    const started = {
      ...empty,
      closings: data.closings.filter(
        (c) => c.locationId === 'pavilion-5' && c.period === addDays(DEMO_TODAY, -3),
      ),
    }
    expect(selectNotFiled(started, addDays(DEMO_TODAY, -1))).toEqual(['pavilion-5'])
  })

  it('shows nothing and breaks nothing across the figures', () => {
    const t = totalsFor(empty, last30())
    expect(t).toMatchObject({ revenue: 0, units: 0, attributedUnits: 0 })
    expect(selectKpis(empty, last30()).current.revenue).toBe(0)
    expect(selectTimeSeries(empty, last30(), 'revenue').every((p) => p.value === 0)).toBe(true)
    expect(selectOriginMix(empty, last30())).toEqual([])
    expect(selectLocationRows(empty, last30()).length).toBeGreaterThan(0)
  })
})

// ── A product added to the range after a store started ──────────────────────

describe('a product new to the range', () => {
  // Pavilion's last closing, counted before Love 50ml was on sale there.
  const latest = data.closings
    .filter((c) => c.locationId === 'pavilion-5')
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
  const before = {
    ...data,
    closings: [
      {
        ...latest,
        stockCount: latest.stockCount.filter((s) => s.skuId !== 'love-retail'),
      },
    ],
    purchaseOrders: [],
  }

  it('is unknown at a store that has not counted it yet, not out of stock', () => {
    const rows = selectStock(before, 'pavilion-5')
    const love = rows.find((r) => r.skuId === 'love-retail')!
    expect(love.counted).toBe(false)
    expect(love.status).toBe('ok')
    expect(love.suggested).toBe(0)
    // Everything that was counted still is.
    expect(rows.find((r) => r.skuId === 'orchid-retail')!.counted).toBe(true)
  })

  it('raises no alert for it at that store', () => {
    const alerts = deriveAlerts(before, new Set())
    expect(alerts.some((a) => a.locationId === 'pavilion-5' && a.skuId === 'love-retail')).toBe(false)
  })
})

describe('the price an item went for, at one store', () => {
  // Client, 13 October: a Wish added on to a bottle went at the RM 10 offer,
  // but the store page priced it at its RM 88 list price. A product's price
  // should be the same throughout the CRM.
  const sold = (skuId: string, qty: number, priceTier: SaleLine['priceTier'], unitPriceMYR: number): SaleLine => ({
    skuId,
    qty,
    priceTier,
    unitPriceMYR,
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
  const at = (closings: Closing[]) =>
    selectPricesAt({ ...data, today: '2026-10-13', closings }, 'pavilion-5')

  it('reads a Wish sold at the offer as RM 10, the price on the sale', () => {
    const prices = at([closing('pavilion-5', '2026-10-12', [sold('wish-3-set', 20, 'offer', 10)])])
    expect(prices('wish-3-set')).toEqual([{ unitPrice: 10, tier: 'offer', qty: 20 }])
  })

  it('lists every price the day filed went at, most units first', () => {
    const prices = at([
      closing('pavilion-5', '2026-10-12', [
        sold('wish-3-set', 1, 'promotion', 88),
        sold('wish-3-set', 12, 'offer', 10),
        sold('wish-3-set', 8, 'offer', 10),
      ]),
    ])
    expect(prices('wish-3-set')).toEqual([
      { unitPrice: 10, tier: 'offer', qty: 20 },
      { unitPrice: 88, tier: 'promotion', qty: 1 },
    ])
  })

  it('reads the day last filed, not an earlier one', () => {
    const prices = at([
      closing('pavilion-5', '2026-10-12', [sold('orchid-retail', 1, 'retail', 238)]),
      closing('pavilion-5', '2026-10-11', [sold('orchid-retail', 5, 'promotion', 188)]),
    ])
    expect(prices('orchid-retail')).toEqual([{ unitPrice: 238, tier: 'retail', qty: 1 }])
  })

  it('shows what most of it went for over 30 days when it did not sell that day', () => {
    const prices = at([
      closing('pavilion-5', '2026-10-12', [sold('orchid-retail', 1, 'promotion', 188)]),
      closing('pavilion-5', '2026-10-05', [sold('wish-1-set', 3, 'offer', 10), sold('wish-1-set', 1, 'promotion', 88)]),
      closing('pavilion-5', '2026-10-04', [sold('wish-1-set', 2, 'offer', 10)]),
    ])
    expect(prices('wish-1-set')).toEqual([{ unitPrice: 10, tier: 'offer', qty: 5 }])
  })

  it('falls back to the list price at the store’s own tier when it has not sold lately', () => {
    const prices = at([
      closing('pavilion-5', '2026-10-12', [sold('orchid-retail', 1, 'promotion', 188)]),
      // Older than 30 days, so it does not count.
      closing('pavilion-5', '2026-08-01', [sold('mahsuri-retail', 5, 'retail', 238)]),
    ])
    expect(prices('mahsuri-retail')).toEqual([{ unitPrice: 188, tier: 'promotion', qty: 0 }])
    expect(selectPricesAt({ ...data, today: '2026-10-13', closings: [] }, 'bsas')('mahsuri-retail')).toEqual([
      { unitPrice: 238, tier: 'retail', qty: 0 },
    ])
  })

  it('keeps a vial free of charge', () => {
    expect(at([])('wish-3-vial')).toEqual([{ unitPrice: 0, tier: 'foc', qty: 0 }])
  })

  it('counts only this store', () => {
    const prices = at([closing('klia-t2', '2026-10-12', [sold('wish-3-set', 4, 'offer', 10)])])
    expect(prices('wish-3-set')).toEqual([{ unitPrice: 88, tier: 'promotion', qty: 0 }])
  })
})

describe('where one store’s customers came from, today, this week, this month', () => {
  // Client, 15 October: the store page's "Where they came from" by day,
  // week and month to date, as well as over the page's range.
  const line = (countryCode: string, qty: number, day: string): SaleLine => ({
    skuId: 'orchid-retail',
    qty,
    priceTier: 'promotion',
    unitPriceMYR: 188,
    countryCode,
    day,
  })
  const closing = (locationId: string, period: string, lines: SaleLine[]): Closing => ({
    id: `${locationId}-${period}`,
    locationId,
    channel: 'main',
    period,
    periodType: 'day',
    revenueMYR: 0,
    lines,
    staffSales: { qty: 0, revenueMYR: 0 },
    stockCount: [],
    writeOffs: [],
    submittedBy: 'x',
    submittedAt: 'x',
  })
  // Wednesday 14 October 2026.
  const today = '2026-10-14'
  const d = {
    ...data,
    today,
    closings: [
      closing('pavilion-5', '2026-09-30', [line('CN', 50, '2026-09-30')]),
      closing('pavilion-5', '2026-10-09', [line('ID', 4, '2026-10-09')]), // last Friday
      closing('pavilion-5', '2026-10-12', [line('CN', 3, '2026-10-12')]), // Monday
      closing('pavilion-5', '2026-10-13', [line('SG', 2, '2026-10-13')]),
      // Today filed already: its sales are the live ones, counted once.
      closing('pavilion-5', today, [line('CN', 1, today)]),
      closing('klia-t2', '2026-10-13', [line('KR', 9, '2026-10-13')]),
    ],
    liveLines: { 'pavilion-5': [line('CN', 1, today), line('MY', 2, today)], 'klia-t2': [line('KR', 5, today)] },
  }
  const units = (from: string, to = today) =>
    Object.fromEntries(selectOriginsBetween(d, 'pavilion-5', from, to).map((s) => [s.countryCode, s.units]))

  it('starts the week on Monday', () => {
    expect(startOfWeek('2026-10-14')).toBe('2026-10-12')
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12')
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12') // Sunday
  })

  it('reads today live, as the promoters ring sales up', () => {
    expect(units(today)).toEqual({ CN: 1, MY: 2 })
  })

  it('adds the days filed this week to today', () => {
    expect(units(startOfWeek(today))).toEqual({ CN: 4, SG: 2, MY: 2 })
  })

  it('adds the days filed this month', () => {
    expect(units(startOfMonth(today))).toEqual({ CN: 4, SG: 2, MY: 2, ID: 4 })
  })

  // Client, 20 October: "Today" becomes "Yesterday", plus any date, or any
  // two dates and the days between.
  it('reads yesterday from what was filed for it', () => {
    expect(units('2026-10-13', '2026-10-13')).toEqual({ SG: 2 })
  })

  it('reads any day, or any span of days, that has ended from what was filed', () => {
    expect(units('2026-10-09', '2026-10-09')).toEqual({ ID: 4 })
    expect(units('2026-10-09', '2026-10-12')).toEqual({ ID: 4, CN: 3 })
    expect(units('2026-09-01', '2026-09-30')).toEqual({ CN: 50 })
    // Nothing filed on the day: nothing to show.
    expect(units('2026-10-10', '2026-10-11')).toEqual({})
  })

  it('reaches today live only when the span takes it in', () => {
    expect(units('2026-10-13', today)).toEqual({ SG: 2, CN: 1, MY: 2 })
    expect(units('2026-10-12', '2026-10-13')).toEqual({ CN: 3, SG: 2 })
  })
})

describe('Finance’s sales report: every store, day by day', () => {
  // Client, 20 October, after Zeoniq: rules for business date (equal or
  // between), item and nationality, each with its own delete.
  const line = (skuId: string, qty: number, unitPriceMYR: number, countryCode?: string): SaleLine => ({
    skuId,
    qty,
    priceTier: 'promotion',
    unitPriceMYR,
    ...(countryCode ? { countryCode } : {}),
  })
  const closing = (locationId: string, period: string, lines: SaleLine[]): Closing => ({
    id: `${locationId}-${period}`,
    locationId,
    channel: 'main',
    period,
    periodType: 'day',
    revenueMYR: 0,
    lines,
    staffSales: { qty: 0, revenueMYR: 0 },
    stockCount: [],
    writeOffs: [],
    submittedBy: 'x',
    submittedAt: 'x',
  })
  const today = '2026-10-20'
  const d = {
    ...data,
    today,
    closings: [
      closing('pavilion-5', '2026-10-18', [line('orchid-retail', 2, 188, 'CN'), line('wish-1-set', 1, 0, 'CN')]),
      closing('pavilion-5', '2026-10-19', [line('orchid-retail', 1, 198, 'MY'), line('violet-retail', 1, 188, 'CN')]),
      closing('klia-t2', '2026-10-19', [line('orchid-retail', 3, 188, 'ID')]),
      // Today's closing is not read: today comes live from the counter.
      closing('klia-t2', today, [line('orchid-retail', 99, 188, 'ID')]),
    ],
    liveLines: { 'klia-t2': [line('violet-retail', 1, 188, 'CN')] },
  }
  const date = (op: 'equal' | 'between', from: string, to = from): ReportRule => ({ id: 'd', field: 'date', span: { op, from, to } })
  const rowsOf = (rules: ReportRule[]) =>
    selectSalesReport(d, rules).rows.map((r) => `${r.day} ${r.locationId} ${r.units} ${r.revenue}`)

  it('gives one row per store per business date', () => {
    expect(rowsOf([date('equal', '2026-10-19')])).toEqual([
      '2026-10-19 klia-t2 3 564',
      '2026-10-19 pavilion-5 2 386',
    ])
  })

  it('takes every day between two dates, oldest first, and today live', () => {
    expect(rowsOf([date('between', '2026-10-18', today)])).toEqual([
      '2026-10-18 pavilion-5 3 376',
      '2026-10-19 klia-t2 3 564',
      '2026-10-19 pavilion-5 2 386',
      '2026-10-20 klia-t2 1 188',
    ])
    const all = selectSalesReport(d, [date('between', '2026-10-18', today)])
    expect(all).toMatchObject({ units: 9, revenue: 1514 })
  })

  it('narrows to the items chosen, or leaves them out', () => {
    const orchid: ReportRule = { id: 'i', field: 'item', op: 'equal', skuIds: ['orchid-retail'] }
    expect(rowsOf([date('equal', '2026-10-19'), orchid])).toEqual([
      '2026-10-19 klia-t2 3 564',
      '2026-10-19 pavilion-5 1 198',
    ])
    expect(rowsOf([date('equal', '2026-10-19'), { ...orchid, op: 'not_equal' }])).toEqual([
      '2026-10-19 pavilion-5 1 188',
    ])
  })

  it('narrows to the nationalities chosen, or leaves them out', () => {
    const china: ReportRule = { id: 'n', field: 'nationality', op: 'equal', countryCodes: ['CN'] }
    expect(rowsOf([date('between', '2026-10-18', '2026-10-19'), china])).toEqual([
      '2026-10-18 pavilion-5 3 376',
      '2026-10-19 pavilion-5 1 188',
    ])
    expect(rowsOf([date('equal', '2026-10-19'), { ...china, op: 'not_equal' }])).toEqual([
      '2026-10-19 klia-t2 3 564',
      '2026-10-19 pavilion-5 1 198',
    ])
  })

  it('treats a rule with nothing chosen yet as no rule, and no date rule as every day', () => {
    const empty: ReportRule = { id: 'i', field: 'item', op: 'equal', skuIds: [] }
    expect(rowsOf([date('equal', '2026-10-19'), empty])).toHaveLength(2)
    expect(rowsOf([])).toHaveLength(4)
  })

  // The same report on each store's own page (20 October).
  it('reads one store alone, day by day, today live', () => {
    const rows = (locationId: string) =>
      selectSalesReport(d, [date('between', '2026-10-18', today)], locationId).rows.map(
        (r) => `${r.day} ${r.locationId} ${r.units} ${r.revenue}`,
      )
    expect(rows('pavilion-5')).toEqual(['2026-10-18 pavilion-5 3 376', '2026-10-19 pavilion-5 2 386'])
    expect(rows('klia-t2')).toEqual(['2026-10-19 klia-t2 3 564', '2026-10-20 klia-t2 1 188'])
    expect(selectSalesReport(d, [date('between', '2026-10-18', today)], 'klia-t2')).toMatchObject({ units: 4, revenue: 752 })
  })
})
