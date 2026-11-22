import { describe, expect, it } from 'vitest'
import { inOutletOrder } from './outletOrder'
import { tradingLocations } from '../data/locations'

/**
 * 20 November: "there should be a drag option for all the outlets,
 * Consignment, Dealers, stores, in analytics page, everywhere ... so client
 * can drag the things and placed as per their choice". A person's own order:
 * what they arranged first, in that order, and the rest after in the usual
 * order; main stores, then consignment, then dealers (22 November: consignment
 * on the left and dealers on the right, "consistent with the entire CRM").
 */

const main = tradingLocations.filter((l) => l.channel === 'main').map((l) => l.id)
const dealers = tradingLocations.filter((l) => l.channel === 'dealer').map((l) => l.id)
const consignment = tradingLocations.filter((l) => l.channel === 'consignment').map((l) => l.id)
const rows = (ids: string[]) => ids.map((id) => ({ id }))
const order = (ids: string[], arranged: Parameters<typeof inOutletOrder>[2]) =>
  inOutletOrder(rows(ids), (r) => r.id, arranged).map((r) => r.id)

describe('outlets in a person’s own order', () => {
  it('keeps the usual order where nothing is arranged', () => {
    expect(order([...main].reverse(), {})).toEqual(main)
  })

  it('puts what was arranged first, in that order, and the rest after in the usual order', () => {
    const arranged = [main[3], main[0]]
    expect(order(main, { main: arranged })).toEqual([main[3], main[0], ...main.filter((id) => !arranged.includes(id))])
  })

  it('lists main stores, then consignment, then dealers', () => {
    const mixed = [dealers[0], consignment[0], main[1], main[0]]
    expect(order(mixed, { main: [main[1]] })).toEqual([main[1], main[0], consignment[0], dealers[0]])
  })

  it('ignores an outlet arranged that is no longer there', () => {
    expect(order(main.slice(0, 2), { main: ['closed-long-ago', main[1]] })).toEqual([main[1], main[0]])
  })
})
