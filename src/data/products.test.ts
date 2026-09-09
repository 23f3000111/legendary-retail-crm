import { describe, expect, it } from 'vitest'
import {
  countedSkus,
  priceOf,
  priceOfId,
  products,
  sellableSkus,
  skuById,
  skus,
  testerSkus,
} from './products'
import { basisOf, locationById } from './locations'

/**
 * The catalogue comes from the client's own price list in "CRM Revision 2", so
 * these tests are checking that we transcribed it faithfully — and that the two
 * prices never get confused with one another.
 */

describe('the price list', () => {
  it('carries the sixteen sellable lines the client priced', () => {
    expect(sellableSkus).toHaveLength(16)
  })

  it('prices the thirteen main lines at 238 retail and 188 promotion', () => {
    const main = sellableSkus.filter((s) => s.retailPriceMYR === 238)
    expect(main).toHaveLength(13)
    expect(main.every((s) => s.promotionPriceMYR === 188)).toBe(true)
  })

  it('prices the three Wishes at 128 and 88, with the offer', () => {
    const wishes = sellableSkus.filter((s) => s.retailPriceMYR === 128)
    expect(wishes.map((s) => s.label).sort()).toEqual([
      'Wish 1 · Set',
      'Wish 2 · Set',
      'Wish 3 · Set',
    ])
    expect(wishes.every((s) => s.promotionPriceMYR === 88)).toBe(true)
    expect(wishes.every((s) => s.offerMYR === 10)).toBe(true)
  })

  it('gives every SKU its own code — no two share one', () => {
    const codes = skus.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('gives every SKU its own id', () => {
    const ids = skus.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never prices something that is not for sale', () => {
    for (const s of skus.filter((x) => !x.sellable)) {
      expect(s.retailPriceMYR, s.label).toBe(0)
      expect(s.promotionPriceMYR, s.label).toBe(0)
    }
  })
})

describe('which price counts', () => {
  it('returns the retail price for a location counted on retail', () => {
    // BSAS and Sasa are the two the client put on the retail price.
    expect(basisOf('bsas')).toBe('retail')
    expect(basisOf('cons-sas')).toBe('retail')
    expect(priceOfId('orchid-retail', basisOf('bsas'))).toBe(238)
  })

  it('returns the promotion price everywhere else', () => {
    expect(basisOf('pavilion-5')).toBe('promotion')
    expect(priceOfId('orchid-retail', basisOf('pavilion-5'))).toBe(188)
  })

  it('is the difference between right and wrong by more than 20%', () => {
    const retail = priceOfId('orchid-retail', 'retail')
    const promotion = priceOfId('orchid-retail', 'promotion')
    expect((retail - promotion) / retail).toBeGreaterThan(0.2)
  })

  it('gives nothing for a SKU that does not exist', () => {
    expect(priceOf(undefined, 'retail')).toBe(0)
    expect(priceOfId('no-such-sku', 'promotion')).toBe(0)
  })

  it('puts every location on one basis or the other', () => {
    for (const id of ['pavilion-5', 'bsas', 'cons-sas', 'cons-wat', 'web-shp']) {
      expect(['retail', 'promotion']).toContain(locationById(id)!.priceBasis)
    }
  })
})

describe('what is counted, and what is only ordered', () => {
  it('keeps testers out of the nightly count', () => {
    expect(testerSkus.length).toBeGreaterThan(0)
    for (const s of testerSkus) expect(s.counted, s.label).toBe(false)
    expect(countedSkus.some((s) => s.variant === 'tester')).toBe(false)
  })

  it('carries the 25 testers the client listed', () => {
    expect(testerSkus).toHaveLength(25)
  })

  it('counts a vial for every fragrance', () => {
    const vials = skus.filter((s) => s.variant === 'vial')
    expect(vials).toHaveLength(13)
    for (const v of vials) {
      expect(v.counted, v.label).toBe(true)
      expect(v.sellable, v.label).toBe(false)
      expect(v.label).toMatch(/· Vial$/)
    }
  })

  it('has no travel size or refill left — Revision 2 removed them', () => {
    for (const s of skus) {
      expect(s.label, s.label).not.toMatch(/Travel size|Refill/)
    }
  })

  it('points every SKU at a real product', () => {
    for (const s of skus) {
      expect(products.some((p) => p.id === s.productId), s.label).toBe(true)
    }
  })

  it('labels a set as a set and a bottle by its size', () => {
    expect(skuById('orchid-retail')?.label).toBe('Orchid · 30ml')
    expect(skuById('wish-1-set')?.label).toBe('Wish 1 · Set')
  })
})
