import { afterEach, describe, expect, it } from 'vitest'
import { countsFromBoxes, knownLines, nothingCounted, shelfExpected, shelfRows, splitCount, startingBoxes } from './counting'
import { applyCatalogue, COUNT_GROUPS, entryOf, groupOf, skuById } from '../data/products'
import { selectStock } from '../store/selectors'
import type { StockRow } from '../store/selectors'
import type { CrmData } from '../data/types'

/**
 * Revision 10, the promoter's closing: "Combine these 3 to Spirit 1 — Love,
 * Hope, Confidence 3ml vials", the same for Spirit 2 and 3 Wishes, "ONLY for
 * stock counting at the end of the day, others remain untouched." One count
 * box for each three; every vial still gets a count of its own.
 */

afterEach(() => applyCatalogue([]))

const empty: CrmData = {
  today: '2026-11-18',
  closings: [],
  purchaseOrders: [],
  alerts: [],
  targets: [],
  promotions: [],
  audit: [],
  users: [],
  liveLines: {},
  partnerSales: [],
}
const stock = (): StockRow[] => selectStock(empty, 'bsas')

describe('the three groups', () => {
  it('puts Love, Hope and Confidence under Spirit 1, Passion, Dream and Life under Spirit 2, the Wishes under 3 Wishes', () => {
    expect(COUNT_GROUPS.map((g) => [g.label, g.members, g.skuIds])).toEqual([
      ['Spirit 1 · 3ml Vials', 'Love, Hope, Confidence', ['love-vial', 'hope-vial', 'confidence-vial']],
      ['Spirit 2 · 3ml Vials', 'Passion, Dream, Life', ['passion-vial', 'dream-vial', 'life-vial']],
      ['3 Wishes · 3ml Vials', 'Wish 1, Wish 2, Wish 3', ['wish-1-vial', 'wish-2-vial', 'wish-3-vial']],
    ])
    expect(groupOf('hope-vial')?.id).toBe('spirit-1-vials')
    // Only the vials: the bottles are counted one by one, as before.
    expect(groupOf('hope-retail')).toBeUndefined()
  })
})

describe('splitting one count across three vials', () => {
  it('gives each its expected figure when the count matches', () => {
    expect(splitCount(176, [77, 54, 45])).toEqual([77, 54, 45])
  })

  it('spreads a difference by each one’s share, adding up to what was counted', () => {
    const split = splitCount(170, [77, 54, 45])
    expect(split.reduce((a, n) => a + n, 0)).toBe(170)
    split.forEach((n, i) => expect(n).toBeLessThanOrEqual([77, 54, 45][i]))
    expect(splitCount(5, [0, 7, 0])).toEqual([0, 5, 0])
  })

  it('shares a first count out evenly, the odd ones first, and never goes below 0', () => {
    expect(splitCount(30, [0, 0, 0])).toEqual([10, 10, 10])
    expect(splitCount(31, [0, 0, 0])).toEqual([11, 10, 10])
    expect(splitCount(0, [4, 2, 1])).toEqual([0, 0, 0])
    expect(splitCount(-3, [4, 2, 1])).toEqual([0, 0, 0])
  })
})

describe('the shelf, as the closing lists it', () => {
  it('has one row for each three, where its first vial sits, and no vial of them alone', () => {
    const rows = shelfRows(stock())
    const keys = rows.map((r) => r.key)
    expect(keys.indexOf('group:spirit-1-vials')).toBe(keys.indexOf('mahsuri-vial') + 1)
    expect(keys.slice(keys.indexOf('group:spirit-1-vials'), keys.indexOf('group:spirit-1-vials') + 3)).toEqual([
      'group:spirit-1-vials',
      'group:spirit-2-vials',
      'group:three-wishes-vials',
    ])
    expect(rows.find((r) => r.key === 'group:spirit-1-vials')!.skus.map((s) => s.skuId)).toEqual([
      'love-vial',
      'hope-vial',
      'confidence-vial',
    ])
    for (const id of ['love-vial', 'hope-vial', 'confidence-vial', 'wish-2-vial', 'dream-vial']) {
      expect(keys).not.toContain(id)
    }
    // Bottles stay one row each.
    expect(keys).toContain('love-retail')
    expect(rows).toHaveLength(39 - 9 + 3)
  })

  it('keeps the other two together when one of a three is off the range, and a lone one as itself', () => {
    applyCatalogue([{ ...entryOf(skuById('hope-vial')!), removed: true }])
    const two = shelfRows(stock()).find((r) => r.key === 'group:spirit-1-vials')!
    expect(two.skus.map((s) => s.skuId)).toEqual(['love-vial', 'confidence-vial'])

    applyCatalogue([
      { ...entryOf(skuById('wish-1-vial')!), removed: true },
      { ...entryOf(skuById('wish-2-vial')!), removed: true },
    ])
    const keys = shelfRows(stock()).map((r) => r.key)
    expect(keys).not.toContain('group:three-wishes-vials')
    expect(keys).toContain('wish-3-vial')
  })
})

describe('turning the boxes into counts', () => {
  const rows = () => shelfRows(stock())
  const expected: Record<string, number> = { 'love-vial': 77, 'hope-vial': 54, 'confidence-vial': 45 }
  const weightOf = (id: string) => expected[id] ?? 0

  it('writes a count for every vial of a three, from its one box', () => {
    const counts = countsFromBoxes(rows(), { 'group:spirit-1-vials': '170', 'orchid-retail': '12' }, weightOf)
    expect(counts.get('orchid-retail')).toBe(12)
    const trio = ['love-vial', 'hope-vial', 'confidence-vial'].map((id) => counts.get(id)!)
    expect(trio.reduce((a, n) => a + n, 0)).toBe(170)
  })

  it('keeps what was filed when the three’s total did not change, and splits by it when it did', () => {
    const filed = new Map([
      ['love-vial', 70],
      ['hope-vial', 60],
      ['confidence-vial', 46],
    ])
    const same = countsFromBoxes(rows(), { 'group:spirit-1-vials': '176' }, weightOf, filed)
    expect(['love-vial', 'hope-vial', 'confidence-vial'].map((id) => same.get(id))).toEqual([70, 60, 46])
    const less = countsFromBoxes(rows(), { 'group:spirit-1-vials': '175' }, weightOf, filed)
    const trio = ['love-vial', 'hope-vial', 'confidence-vial'].map((id) => less.get(id)!)
    expect(trio.reduce((a, n) => a + n, 0)).toBe(175)
  })

  it('leaves out a box that is empty', () => {
    const counts = countsFromBoxes(rows(), { 'group:spirit-1-vials': '' }, weightOf)
    expect(counts.has('love-vial')).toBe(false)
  })
})

describe('a three after a delivery', () => {
  it('shares the count by what each should hold with what arrived, so a vial that had none gets its own back', () => {
    // Passion 49 and Life 58 on the shelf, Dream none, and 24 Dream arrived.
    const rows = shelfRows(stock())
    const weights: Record<string, number> = { 'passion-vial': 49, 'dream-vial': 24, 'life-vial': 58 }
    const counts = countsFromBoxes(rows, { 'group:spirit-2-vials': '131' }, (id) => weights[id] ?? 0)
    expect(['passion-vial', 'dream-vial', 'life-vial'].map((id) => counts.get(id))).toEqual([49, 24, 58])
  })
})

// The client, 20 November: "After promoter receive stock for PO, the received
// quantity automatically adds into the closing quantity."
describe('what the shelf should hold at the close', () => {
  const opening = (counts: Record<string, number>): StockRow[] =>
    stock().map((s) => ({ ...s, counted: s.skuId in counts, onHand: counts[s.skuId] ?? 0 }))

  it('is the last count, with what the store confirmed receiving added and what sold taken off', () => {
    const expected = shelfExpected(
      opening({ 'orchid-retail': 20, 'man-retail': 5 }),
      new Map([['orchid-retail', 3]]),
      new Map([
        ['orchid-retail', 24],
        ['man-retail', 12],
      ]),
    )
    expect(expected.get('orchid-retail')).toBe(41)
    expect(expected.get('man-retail')).toBe(17)
  })

  it('never goes below nothing', () => {
    const expected = shelfExpected(opening({ 'orchid-retail': 2 }), new Map([['orchid-retail', 5]]), new Map())
    expect(expected.get('orchid-retail')).toBe(0)
  })

  it('starts a three’s box at the three’s total, the delivery in it', () => {
    const shelf = opening({ 'passion-vial': 49, 'dream-vial': 0, 'life-vial': 58 })
    const expected = shelfExpected(shelf, new Map(), new Map([['dream-vial', 24]]))
    const three = shelfRows(shelf).find((r) => r.key === 'group:spirit-2-vials')!
    expect(three.skus.reduce((a, s) => a + expected.get(s.skuId)!, 0)).toBe(131)
  })
})

// The client's Revision #9 again, 25 November: "After promoter receive stock
// for PO, the received quantity automatically adds into the closing quantity."
// A store that had never counted (TRX), or a product new to a store, started
// with an empty box whatever had been received.
describe('what each box starts at', () => {
  const shelf = (counts: Record<string, number>): StockRow[] =>
    stock().map((s) => ({ ...s, counted: s.skuId in counts, onHand: counts[s.skuId] ?? 0 }))
  const boxes = (counts: Record<string, number>, sold: [string, number][], arrived: [string, number][]) => {
    const rows = shelf(counts)
    const known = knownLines(rows, new Map(arrived), new Map(sold))
    return startingBoxes(shelfRows(rows), shelfExpected(rows, new Map(sold), new Map(arrived)), known)
  }

  it('is what a counted line should hold, the delivery in it', () => {
    expect(boxes({ 'orchid-retail': 20 }, [['orchid-retail', 3]], [['orchid-retail', 24]])['orchid-retail']).toBe('41')
  })

  it('is what was received, less what sold, for a line the store has never counted', () => {
    const b = boxes({}, [['orchid-retail', 1]], [['orchid-retail', 48]])
    expect(b['orchid-retail']).toBe('47')
  })

  it('is empty for a line that was never counted and never received: nothing is known of it', () => {
    const b = boxes({ 'orchid-retail': 20 }, [['man-retail', 1]], [['orchid-retail', 48]])
    expect(b['man-retail']).toBe('')
    expect(boxes({}, [], [['orchid-retail', 48]])['violet-retail']).toBe('')
  })

  it('is the three’s total once every vial of it is known, and empty until then', () => {
    const all: [string, number][] = [['passion-vial', 10], ['dream-vial', 24], ['life-vial', 12]]
    expect(boxes({}, [], all)['group:spirit-2-vials']).toBe('46')
    expect(boxes({}, [], [['dream-vial', 24]])['group:spirit-2-vials']).toBe('')
    // Two counted before, the third new to the store and just received.
    expect(boxes({ 'passion-vial': 10, 'life-vial': 12 }, [], [['dream-vial', 24]])['group:spirit-2-vials']).toBe('46')
  })
})

// The client's Revision #10, 26 November: "For KLIA T2, On hand quantity not
// displaying (Help to make sure ALL stores shows correct on hand quantity)".
// KLIA T2 filed every product at 0 from 3 October on, selling every day: each
// box started at what the shelf "should" hold — 0 — and was left as it was.
describe('a box whose figure the record cannot stand behind', () => {
  const shelf = (counts: Record<string, number>): StockRow[] =>
    stock().map((s) => ({ ...s, counted: s.skuId in counts, onHand: counts[s.skuId] ?? 0 }))

  it('is known where the store counted it, or confirmed receiving it, and the record adds up', () => {
    const known = knownLines(shelf({ 'orchid-retail': 20 }), new Map([['man-retail', 12]]), new Map([['orchid-retail', 3]]))
    expect(known.has('orchid-retail')).toBe(true)
    expect(known.has('man-retail')).toBe(true)
    expect(known.has('violet-retail')).toBe(false)
  })

  it('is not known where more has sold since the last count than it and the deliveries come to', () => {
    const rows = shelf({ 'orchid-retail': 0, 'man-retail': 2 })
    const sold = new Map([['orchid-retail', 3], ['man-retail', 5]])
    const known = knownLines(rows, new Map([['man-retail', 2]]), sold)
    expect(known.has('orchid-retail')).toBe(false)
    expect(known.has('man-retail')).toBe(false)
    // So its box starts empty, to be counted, rather than at 0.
    const b = startingBoxes(shelfRows(rows), shelfExpected(rows, sold, new Map([['man-retail', 2]])), known)
    expect(b['orchid-retail']).toBe('')
    expect(b['man-retail']).toBe('')
    // Exactly what the record says is fine: it sold out.
    expect(knownLines(rows, new Map([['man-retail', 3]]), sold).has('man-retail')).toBe(true)
  })

  it('takes a three’s box as unknown when one of its vials is', () => {
    const rows = shelf({ 'passion-vial': 10, 'dream-vial': 0, 'life-vial': 12 })
    const sold = new Map([['dream-vial', 2]])
    const b = startingBoxes(shelfRows(rows), shelfExpected(rows, sold, new Map()), knownLines(rows, new Map(), sold))
    expect(b['group:spirit-2-vials']).toBe('')
  })

  // 28 November: KLIA T2's ≈65 Orchid is the 120 delivered on 12 November less
  // the 55 sold since — after 158 sold from stock the app was never told of.
  // What is left of that stock is on the shelf too, so the figure is the least
  // there can be, not a count. Started in its box, it would be filed as one.
  it('is not known where on hand is only worked out from the record, delivered since or not', () => {
    const rows = stock().map((s) => ({ ...s, counted: true, workedOut: true, onHand: s.skuId === 'orchid-retail' ? 65 : 0 }))
    const sold = new Map([['orchid-retail', 2]])
    const arrived = new Map([['violet-retail', 24]])
    const known = knownLines(rows, arrived, sold)
    expect(known.size).toBe(0)
    const b = startingBoxes(shelfRows(rows), shelfExpected(rows, sold, arrived), known)
    expect(b['orchid-retail']).toBe('')
    expect(b['violet-retail']).toBe('')
    expect(Object.values(b).every((v) => v === '')).toBe(true)
  })
})

describe('a count of nothing', () => {
  const rows = () => shelfRows(stock())
  const all = (value: string) => Object.fromEntries(rows().map((r) => [r.key, value]))

  it('is every box typed in, and every one 0', () => {
    expect(nothingCounted(rows(), all('0'))).toBe(true)
    expect(nothingCounted(rows(), { ...all('0'), 'orchid-retail': '3' })).toBe(false)
    // A box still empty is still to count, not a count of 0.
    expect(nothingCounted(rows(), { ...all('0'), 'orchid-retail': '' })).toBe(false)
    expect(nothingCounted([], {})).toBe(false)
  })
})
