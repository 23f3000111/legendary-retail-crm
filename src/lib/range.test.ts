import { afterEach, describe, expect, it } from 'vitest'
import { inRangeOrder, pickerGroups, rangeIndex } from './range'
import { applyCatalogue, sellableSkus, skus } from '../data/products'
import { selectDayDetail } from '../store/selectors'
import type { CrmData, SaleLine } from '../data/types'

/**
 * Revision 10: "In every page, product order shows following this order.
 * After products followed by Vials." Every list of products reads the range's
 * own order; the pickers group the bottles by fragrance and put the vials last.
 */

afterEach(() => applyCatalogue([]))

describe('the range order, for any list of products', () => {
  it('knows where every line sits', () => {
    const at = rangeIndex()
    expect(at.get('orchid-retail')).toBe(0)
    expect(at.get('violet-retail')).toBe(1)
    expect(at.size).toBe(skus.length)
  })

  it('puts rows that name a line in the range order, anything unknown last', () => {
    const rows = [{ skuId: 'man-retail' }, { skuId: 'nope' }, { skuId: 'orchid-retail' }, { skuId: 'orchid-vial' }]
    expect(inRangeOrder(rows).map((r) => r.skuId)).toEqual(['orchid-retail', 'man-retail', 'orchid-vial', 'nope'])
  })

  it('follows the order head office saved', () => {
    applyCatalogue([], ['man-retail'])
    expect(inRangeOrder([{ skuId: 'orchid-retail' }, { skuId: 'man-retail' }])[0].skuId).toBe('man-retail')
  })
})

describe('the pickers', () => {
  it('groups the bottles by fragrance and lists the vials after them, together', () => {
    const groups = pickerGroups(sellableSkus)
    expect(groups[0]).toMatchObject({ key: 'orchid', label: 'Orchid' })
    expect(groups[0].skus.map((s) => s.id)).toEqual(['orchid-retail'])
    expect(groups[2].skus.map((s) => s.id)).toEqual(['spirit-1-set', 'spirit-1-set-new', 'spirit-2-travel'])
    const last = groups[groups.length - 1]
    expect(last).toMatchObject({ key: 'vials', label: '3ml vials' })
    expect(last.skus).toHaveLength(16)
    expect(last.skus[0].id).toBe('orchid-vial')
    expect(groups.slice(0, -1).every((g) => g.skus.every((s) => s.variant !== 'vial'))).toBe(true)
  })
})

describe('a day opened from the calendar', () => {
  const line = (skuId: string, qty: number, saleId: string): SaleLine => ({
    skuId,
    qty,
    priceTier: 'promotion',
    unitPriceMYR: 188,
    countryCode: 'MY',
    saleId,
  })
  const data: CrmData = {
    today: '2026-11-03',
    closings: [
      {
        id: 'bsas-2026-11-02',
        locationId: 'bsas',
        channel: 'main',
        period: '2026-11-02',
        periodType: 'day',
        revenueMYR: 564,
        lines: [line('man-retail', 2, 'a'), line('orchid-retail', 1, 'b')],
        staffSales: { qty: 0, revenueMYR: 0 },
        stockCount: [],
        writeOffs: [],
        submittedBy: 'x',
        submittedAt: 'x',
      },
    ],
    purchaseOrders: [],
    alerts: [],
    targets: [],
    promotions: [],
    audit: [],
    users: [],
    liveLines: {},
    partnerSales: [],
  }

  it('lists its products in the range order, not by what they sold', () => {
    expect(selectDayDetail(data, '2026-11-02').skus.map((s) => s.skuId)).toEqual(['orchid-retail', 'man-retail'])
  })
})
