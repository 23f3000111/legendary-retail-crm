import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { settle, signInAs, startFixture, written } from './testing'
import {
  emptyFilter,
  latestCompleteMonth,
  latestMonthWithFigures,
  partnersIn,
  partnersKeyed,
  selectMonthToDate,
  selectPartnerMonth,
  selectToday,
  totalsFor,
} from './selectors'
import type { LocalBackend } from '../api/local'
import type { Closing, CrmData, PartnerSales, SaleLine } from '../data/types'

/**
 * The client's fifth revision (October): dealers and consignment partners are
 * keyed in at head office, a month at a time, and the overview shows a month
 * only once every partner of the kind is in. Main stores are read live.
 */

const data = (over: Partial<CrmData> = {}): CrmData => ({
  today: '2026-10-12',
  closings: [],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  liveLines: {},
  users: [],
  partnerSales: [],
  ...over,
})

const keyed = (locationId: string, month: string, revenueMYR: number): PartnerSales => ({
  locationId,
  month,
  revenueMYR,
  enteredBy: 'Kelly Tew',
  enteredAt: `${month}-28T10:00:00.000Z`,
})

const everyDealer = (month: string, revenue = (i: number) => 1000 + i) =>
  partnersIn('dealer').map((l, i) => keyed(l.id, month, revenue(i)))

describe('the month the overview shows for a channel', () => {
  it('is last month, once every dealer is in', () => {
    expect(latestCompleteMonth(data({ partnerSales: everyDealer('2026-09') }), 'dealer')).toBe('2026-09')
  })

  it('falls back to the latest complete month while last month is still coming in', () => {
    const september = everyDealer('2026-09').slice(1) // one dealer missing
    const d = data({ partnerSales: [...everyDealer('2026-08'), ...september] })
    expect(latestCompleteMonth(d, 'dealer')).toBe('2026-08')
    expect(partnersKeyed(d, 'dealer', '2026-09')).toBe(partnersIn('dealer').length - 1)
  })

  it('never counts this month, however complete', () => {
    expect(latestCompleteMonth(data({ partnerSales: everyDealer('2026-10') }), 'dealer')).toBeNull()
  })

  it('counts a dealer keyed in at 0 — one that sold nothing is still in', () => {
    const d = data({ partnerSales: everyDealer('2026-09', (i) => (i % 2 ? 0 : 500)) })
    expect(latestCompleteMonth(d, 'dealer')).toBe('2026-09')
  })

  it('treats consignment on its own', () => {
    const cons = partnersIn('consignment').map((l) => keyed(l.id, '2026-09', 2000))
    const d = data({ partnerSales: cons })
    expect(latestCompleteMonth(d, 'consignment')).toBe('2026-09')
    expect(latestCompleteMonth(d, 'dealer')).toBeNull()
    expect(latestMonthWithFigures(d, 'consignment')).toBe('2026-09')
  })
})

describe('a partner month', () => {
  it('ranks partners best first, and a keyed figure stands over anything filed', () => {
    const dealer = partnersIn('dealer')[0].id
    const filed: Closing = {
      id: `${dealer}-2026-09-03`,
      locationId: dealer,
      channel: 'dealer',
      period: '2026-09-03',
      periodType: 'day',
      revenueMYR: 188,
      lines: [{ skuId: 'orchid-retail', qty: 1 }],
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount: [],
      writeOffs: [],
      submittedBy: 'x',
      submittedAt: 'x',
    }
    const d = data({ closings: [filed], partnerSales: [keyed(dealer, '2026-09', 900)] })
    const rows = selectPartnerMonth(d, 'dealer', '2026-09')
    expect(rows[0]).toMatchObject({ locationId: dealer, revenue: 900, has: true })
    expect(rows[0].keyed?.enteredBy).toBe('Kelly Tew')
    expect(rows.slice(1).every((r) => !r.has)).toBe(true)

    // Totals count the keyed figure once, not the closing as well.
    const sept = { ...emptyFilter('2026-09-01', '2026-09-30'), locationIds: [dealer] }
    expect(totalsFor(d, sept).revenue).toBe(900)
  })

  it('counts in revenue only where nothing narrows the view to products or countries', () => {
    const dealer = partnersIn('dealer')[0].id
    const d = data({ partnerSales: [keyed(dealer, '2026-09', 900)] })
    const sept = emptyFilter('2026-09-01', '2026-09-30')
    expect(totalsFor(d, sept).revenue).toBe(900)
    expect(totalsFor(d, { ...sept, skuIds: ['orchid-retail'] }).revenue).toBe(0)
    expect(totalsFor(d, { ...sept, countryCodes: ['CN'] }).revenue).toBe(0)
    expect(totalsFor(d, { ...sept, channels: ['main'] }).revenue).toBe(0)
    expect(totalsFor(d, { ...sept, channels: ['dealer'] }).revenue).toBe(900)
  })
})

describe('today, and the month so far', () => {
  const line = (over: Partial<SaleLine>): SaleLine => ({ skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188, ...over })

  it('reads today live from the counter, store by store, best first', () => {
    const d = data({
      liveLines: {
        'pavilion-5': [line({ saleId: 'a', qty: 2 }), line({ saleId: 'b', unitPriceMYR: 150.5 })],
        'klia-t2': [line({ saleId: 'c' })],
      },
    })
    const today = selectToday(d)
    expect(today).toMatchObject({ revenue: 714.5, units: 4, customers: 3 })
    expect(today.byStore.map((s) => s.locationId)).toEqual(['pavilion-5', 'klia-t2'])
    expect(today.byStore[0]).toMatchObject({ revenue: 526.5, customers: 2 })
  })

  it('adds the days filed this month to today as it stands, counting today once', () => {
    const closing = (period: string, qty: number): Closing => ({
      id: `pavilion-5-${period}`,
      locationId: 'pavilion-5',
      channel: 'main',
      period,
      periodType: 'day',
      revenueMYR: qty * 188,
      lines: [line({ saleId: period, qty })],
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount: [],
      writeOffs: [],
      submittedBy: 'x',
      submittedAt: 'x',
    })
    const d = data({
      // Last month, earlier this month, and today's own closing.
      closings: [closing('2026-09-30', 5), closing('2026-10-03', 2), closing('2026-10-12', 1)],
      liveLines: { 'pavilion-5': [line({ saleId: 'today', qty: 1 })] },
    })
    const mtd = selectMonthToDate(d)
    expect(mtd.units).toBe(3)
    expect(mtd.revenue).toBe(564)
  })
})

describe('keying in a month', () => {
  let lb: LocalBackend
  beforeEach(() => {
    lb = startFixture('siew-fang')
  })
  const dealers = () => partnersIn('dealer')

  it('lets Finance key in a figure per partner, logged with before and after', async () => {
    const [a, b] = dealers()
    const result = useData.getState().savePartnerSales({
      month: '2026-07',
      figures: [
        { locationId: a.id, revenueMYR: 1200.5 },
        { locationId: b.id, revenueMYR: 0 },
      ],
    })
    expect(result.ok).toBe(true)
    const july = useData.getState().partnerSales.filter((p) => p.month === '2026-07')
    expect(july.map((p) => p.revenueMYR).sort()).toEqual([0, 1200.5])
    expect(july[0].enteredBy).toBe('Siew Fang')

    const entry = written()[0]
    expect(entry.action).toBe('partner.keyed')
    expect(entry.summary).toBe('Keyed in Jul 2026 sales for 2 partners')
    expect(entry.detail).toContain(`${a.shortName}: nothing → RM 1,200.50`)

    await settle()
    expect(lb.allDocs().some((d) => d.kind === 'partner_sales' && d.id === `${a.id}::2026-07`)).toBe(true)
  })

  it('changes a figure, takes one back, and refuses a save that changes nothing', () => {
    const [a] = dealers()
    const save = (revenueMYR: number | null) =>
      useData.getState().savePartnerSales({ month: '2026-07', figures: [{ locationId: a.id, revenueMYR }] })
    save(500)
    expect(save(500).ok).toBe(false)
    expect(save(650).ok).toBe(true)
    expect(written()[0].detail).toContain('RM 500 → RM 650')
    expect(save(null).ok).toBe(true)
    expect(useData.getState().partnerSales.some((p) => p.locationId === a.id)).toBe(false)
    expect(written()[0].detail).toContain('taken off')
  })

  it('refuses a month not yet begun, a main store, and a negative figure', () => {
    const [a] = dealers()
    const save = (month: string, locationId: string, revenueMYR: number) =>
      useData.getState().savePartnerSales({ month, figures: [{ locationId, revenueMYR }] })
    expect(save('2027-01', a.id, 10).error).toMatch(/not started/)
    expect(save('2026-07', 'pavilion-5', 10).error).toMatch(/dealers and consignment/)
    expect(save('2026-07', a.id, -1).error).toMatch(/0 or more/)
  })

  it('is checked again on the server, and signed by whoever sent it', () => {
    const [a] = dealers()
    const token = lb.openSessionForTests('siew-fang')
    const send = (over: { id?: string; locationId?: string; day?: string; doc?: Record<string, unknown> }) => {
      const locationId = over.locationId ?? a.id
      return lb.putSync(token, [
        {
          kind: 'partner_sales',
          id: over.id ?? `${locationId}::2026-07`,
          locationId,
          day: over.day ?? '2026-07-01',
          doc: { ...keyed(locationId, '2026-07', 500), ...over.doc },
        },
      ])
    }

    // A main store's sales come from its counter, never from a typed figure.
    expect(send({ locationId: 'pavilion-5' }).error).toMatch(/dealers and consignment/)
    expect(send({ doc: { month: '2027-01' }, id: `${a.id}::2027-01`, day: '2027-01-01' }).error).toMatch(/not started/)
    expect(send({ doc: { month: '2026-13' } }).error).toMatch(/Choose a month/)
    expect(send({ id: `${a.id}::2026-08` }).error).toMatch(/does not match/)
    expect(send({ day: '2026-07-15' }).error).toMatch(/does not match/)
    expect(send({ doc: { locationId: dealers()[1].id } }).error).toMatch(/does not match/)
    expect(send({ doc: { revenueMYR: -1 } }).error).toMatch(/0 or more/)
    expect(send({ doc: { revenueMYR: '500' } }).error).toMatch(/0 or more/)
    expect(lb.allDocs().some((d) => d.kind === 'partner_sales')).toBe(false)

    // Whatever name the figure claims, it is filed under the session's.
    expect(send({ doc: { enteredBy: 'Lim Davy' } }).ok).toBe(true)
    const filed = lb.allDocs().find((d) => d.kind === 'partner_sales')?.doc as PartnerSales
    expect(filed).toMatchObject({ revenueMYR: 500, enteredBy: 'Siew Fang' })
  })

  it('is head office’s job — not a promoter’s or the warehouse’s, in the app or on the server', () => {
    const [a] = dealers()
    signInAs(lb, 'teokoknian', 'klia-t2')
    expect(
      useData.getState().savePartnerSales({ month: '2026-07', figures: [{ locationId: a.id, revenueMYR: 1 }] }).ok,
    ).toBe(false)

    for (const [who, at] of [
      ['teokoknian', 'klia-t2'],
      ['an', undefined],
    ] as const) {
      const token = lb.openSessionForTests(who, at)
      const direct = lb.putSync(token, [
        {
          kind: 'partner_sales',
          id: `${a.id}::2026-07`,
          locationId: a.id,
          day: '2026-07-01',
          doc: keyed(a.id, '2026-07', 1),
        },
      ])
      expect(direct.ok, who).toBe(false)
    }
  })
})
