import { describe, it, expect } from 'vitest'
import { buildSeed, DEMO_TODAY } from '../data/seed'
import { basisOf, locationsInChannel, tradingLocations } from '../data/locations'
import { priceOfId, skuById, skus } from '../data/products'
import { addDays, dateRange } from '../lib/dates'
import {
  countryCoverage,
  emptyFilter,
  metricValue,
  originSlicesFrom,
  previousWindow,
  selectKpis,
  selectLocationRows,
  selectOriginMix,
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
