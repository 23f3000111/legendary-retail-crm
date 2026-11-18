import { afterEach, describe, expect, it } from 'vitest'
import { countsFromBoxes, shelfRows, splitCount } from './counting'
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
