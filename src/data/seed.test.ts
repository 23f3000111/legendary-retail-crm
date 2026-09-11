import { describe, it, expect } from 'vitest'
import { buildSeed, DEMO_TODAY, SEED_VALUE } from './seed'
import { basisOf, tradingLocations, locationById, locationsInChannel } from './locations'
import { countedSkus, priceOfId, skuById } from './products'
import { seedPeople } from './people'
import { PO_STATUSES } from './types'

const data = buildSeed()

describe('determinism', () => {
  it('produces identical data on every run', () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(buildSeed()))
  })

  it('produces different data for a different seed', () => {
    expect(JSON.stringify(buildSeed(SEED_VALUE))).not.toBe(
      JSON.stringify(buildSeed(SEED_VALUE + 1)),
    )
  })
})

describe('the estate', () => {
  it('matches the store list the client sent', () => {
    expect(locationsInChannel('main').length).toBe(12)
    // Revision 2 replaced the original 56 dealers with 44.
    expect(locationsInChannel('dealer').length).toBe(44)
    expect(locationsInChannel('consignment').length).toBe(6)
  })

  it('carries no online channel — the client asked for it to go', () => {
    expect(tradingLocations.some((l) => l.id.startsWith('web-'))).toBe(false)
  })

  it('only trades at open locations — the three coming soon file nothing', () => {
    const coming = tradingLocations.filter((l) => l.status === 'coming')
    expect(coming.length).toBe(0)
    for (const c of data.closings) {
      expect(locationById(c.locationId)?.status).toBe('open')
    }
  })
})

describe('daily channels', () => {
  const daily = data.closings.filter((c) => c.periodType === 'day')
  const counted = daily

  it('covers 90 days ending on the demo today', () => {
    const dates = [...new Set(daily.map((c) => c.period))].sort()
    expect(dates.length).toBe(90)
    expect(dates[dates.length - 1]).toBe(DEMO_TODAY)
  })

  it('reconciles revenue against its own sale lines', () => {
    for (const c of daily) {
      const fromLines = c.lines.reduce(
        (a, l) => a + l.qty * priceOfId(l.skuId, basisOf(c.locationId)),
        0,
      )
      expect(fromLines).toBe(c.revenueMYR)
    }
  })

  it('splits payment three ways, adding up to the revenue', () => {
    for (const c of daily) {
      expect(c.tender).toBeDefined()
      const { cash, ewallet, card } = c.tender!
      expect(cash + ewallet + card).toBeCloseTo(c.revenueMYR, 6)
    }
  })

  it('counts every product every night', () => {
    for (const c of counted) {
      // Testers are ordered but never counted on a shelf (Revision 2).
      expect(c.stockCount.length).toBe(countedSkus.length)
      for (const m of c.stockCount) expect(m.counted).toBeGreaterThanOrEqual(0)
    }
  })

  it('never sells stock the store did not have', () => {
    for (const c of counted) {
      for (const m of c.stockCount) {
        const sold = c.lines.filter((l) => l.skuId === m.skuId).reduce((a, l) => a + l.qty, 0)
        expect(sold).toBeLessThanOrEqual(m.opening)
      }
    }
  })

  it('never sells a tester', () => {
    for (const c of data.closings) {
      for (const l of c.lines) expect(skuById(l.skuId)?.sellable).toBe(true)
    }
  })
})

describe('country capture', () => {
  it('records a country on every main-store line, and on no other line', () => {
    for (const c of data.closings) {
      const recordsCountries = locationById(c.locationId)?.recordsCountries
      for (const l of c.lines) {
        if (recordsCountries) expect(l.countryCode).toBeTruthy()
        else expect(l.countryCode).toBeUndefined()
      }
    }
  })

  it('is exact — attributed units equal total units in a main store', () => {
    const main = data.closings.filter((c) => locationById(c.locationId)?.channel === 'main')
    for (const c of main.slice(0, 50)) {
      const total = c.lines.reduce((a, l) => a + l.qty, 0)
      const attributed = c.lines
        .filter((l) => l.countryCode)
        .reduce((a, l) => a + l.qty, 0)
      expect(attributed).toBe(total)
    }
  })
})

describe('consignment', () => {
  const monthly = data.closings.filter((c) => c.periodType === 'month')

  it('reports monthly, and only for consignment partners', () => {
    expect(monthly.length).toBeGreaterThan(0)
    for (const c of monthly) {
      expect(locationById(c.locationId)?.channel).toBe('consignment')
      expect(c.period.endsWith('-01')).toBe(true)
    }
  })

  it('holds no counted stock and no payment split', () => {
    for (const c of monthly) {
      expect(c.stockCount.length).toBe(0)
      expect(c.tender).toBeUndefined()
    }
  })

  it('carries a margin rate on every partner', () => {
    for (const l of locationsInChannel('consignment')) {
      expect(l.marginPct).toBeGreaterThan(0)
    }
  })
})

describe('unfiled days', () => {
  it('leaves a promoter’s own store open today so the closing is reachable', () => {
    // The seed deliberately holds Pavilion open. A walkthrough needs at least
    // one promoter whose store has not filed, or "Close the day" is a dead end.
    const open = seedPeople.filter(
      (p) =>
        p.role === 'promoter' &&
        !data.closings.some(
          (c) => c.locationId === p.locationId && c.period === DEMO_TODAY,
        ),
    )
    expect(open.length).toBeGreaterThan(0)
  })

  it('raises a missed-closing alert for each back-dated gap', () => {
    const missed = data.alerts.filter((a) => a.type === 'missed_closing')
    expect(missed.length).toBe(2)
  })
})

describe('purchase orders', () => {
  it('populates every queue so no desk opens an empty inbox', () => {
    const live = new Set(data.purchaseOrders.map((p) => p.status))
    // Draft is the only status the seed never leaves an order in — a draft
    // belongs to a promoter mid-flow, not to history.
    for (const s of PO_STATUSES.filter((x) => x !== 'draft')) {
      expect(live.has(s), `no seeded order in status "${s}"`).toBe(true)
    }
  })

  it('gives every order an event trail ending at its status', () => {
    for (const po of data.purchaseOrders) {
      expect(po.events.length).toBeGreaterThan(0)
      expect(po.events[po.events.length - 1].status).toBe(po.status)
      expect(po.lines.every((l) => l.qtyRequested > 0)).toBe(true)
    }
  })

  it('always records a reason when an order was rejected', () => {
    const rejected = data.purchaseOrders.filter((p) => p.status === 'rejected')
    expect(rejected.length).toBeGreaterThan(0)
    for (const po of rejected) {
      expect(po.events[po.events.length - 1].note?.trim()).toBeTruthy()
    }
  })

  it('only ever orders to a location that exists', () => {
    for (const po of data.purchaseOrders) expect(locationById(po.locationId)).toBeDefined()
  })
})

describe('write-offs and staff sales', () => {
  it('records an approver on every write-off', () => {
    const all = data.closings.flatMap((c) => c.writeOffs)
    expect(all.length).toBeGreaterThan(0)
    for (const w of all) expect(w.approvedBy).toBeTruthy()
  })

  it('keeps staff purchases out of the sale lines', () => {
    const withStaff = data.closings.filter((c) => c.staffSales.qty > 0)
    expect(withStaff.length).toBeGreaterThan(0)
    for (const c of withStaff) {
      // Staff revenue is recorded separately and never folded into the lines.
      const fromLines = c.lines.reduce(
        (a, l) => a + l.qty * priceOfId(l.skuId, basisOf(c.locationId)),
        0,
      )
      expect(fromLines).toBe(c.revenueMYR)
    }
  })
})

describe('targets', () => {
  it('sets one for every main store', () => {
    const main = locationsInChannel('main')
    for (const l of main) {
      expect(data.targets.some((t) => t.locationId === l.id)).toBe(true)
    }
  })
})
