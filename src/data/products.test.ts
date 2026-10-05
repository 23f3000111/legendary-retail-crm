import { describe, expect, it } from 'vitest'
import {
  countedSkus,
  hasListPrice,
  lineUnitPrice,
  priceAtTier,
  priceOf,
  priceOfId,
  products,
  sellableSkus,
  skuById,
  skus,
  testerSkus,
  tiersFor,
  variantName,
  vialSkus,
} from './products'
import { basisOf, locationById } from './locations'

/**
 * The catalogue comes from the client's own price list in "CRM Revision 2", so
 * these tests are checking that we transcribed it faithfully — and that the two
 * prices never get confused with one another.
 */

describe('the price list', () => {
  it('carries the priced lines, the travel kits and the fourth revision’s additions, plus the vials', () => {
    // Sixteen from Revision 2, two travel kits from the third revision, and
    // from the fourth: Love, Hope and Confidence 50ml, the new Spirit 1 set and
    // the Nyonya travel kit — with sixteen 3ml vials alongside.
    expect(sellableSkus.filter(hasListPrice)).toHaveLength(23)
    expect(vialSkus).toHaveLength(16)
    expect(sellableSkus).toHaveLength(39)
  })

  it('prices the main lines at 238 retail and 188 promotion', () => {
    const main = sellableSkus.filter((s) => s.retailPriceMYR === 238)
    expect(main).toHaveLength(17)
    expect(main.every((s) => s.promotionPriceMYR === 188)).toBe(true)
  })

  it('sells Love, Hope and Confidence in 50ml at 188 and 238 — fourth revision', () => {
    for (const id of ['love-retail', 'hope-retail', 'confidence-retail']) {
      const sku = skuById(id)
      expect(sku, id).toBeDefined()
      expect(sku!.size).toBe('50ml')
      expect(sku!.promotionPriceMYR).toBe(188)
      expect(sku!.retailPriceMYR).toBe(238)
      expect(tiersFor(sku)).toEqual(['promotion', 'retail', 'other'])
    }
  })

  it('has the Spirit 1 set twice: the old one, and the new one beside it', () => {
    // The old one keeps its id, so everything already sold and counted stays with it.
    expect(skuById('spirit-1-set')?.label).toBe('Spirit 1 · Set (old)')
    expect(skuById('spirit-1-set-new')?.label).toBe('Spirit 1 · Set (new)')
    expect(variantName(skuById('spirit-1-set')!)).toBe('Set (old)')
    expect(variantName(skuById('spirit-1-set-new')!)).toBe('Set (new)')
    expect(skuById('spirit-2-set')?.label).toBe('Spirit 2 · Set')
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
    for (const id of ['pavilion-5', 'bsas', 'cons-sas', 'cons-wat', 'dlr-beauty-scent']) {
      expect(['retail', 'promotion']).toContain(locationById(id)!.priceBasis)
    }
  })
})

describe('the price the counter chooses', () => {
  const orchid = skuById('orchid-retail')
  const wish = skuById('wish-1-set')

  it('offers every item at promotion and retail, the store’s own price first, then other', () => {
    expect(tiersFor(orchid, 'promotion')).toEqual(['promotion', 'retail', 'other'])
    expect(tiersFor(orchid, 'retail')).toEqual(['retail', 'promotion', 'other'])
    expect(tiersFor(undefined)).toEqual([])
  })

  it('offers the Wishes at the offer price as well, and nothing else', () => {
    expect(tiersFor(wish, 'promotion')).toEqual(['promotion', 'retail', 'offer', 'other'])
    for (const s of sellableSkus.filter((k) => !k.productId.startsWith('wish-'))) {
      expect(tiersFor(s), s.label).not.toContain('offer')
    }
  })

  it('has three travel kits at RM 68, counted and sold', () => {
    for (const id of ['three-wishes-travel', 'spirit-2-travel', 'nyonya-travel']) {
      const kit = skuById(id)
      expect(kit, id).toBeDefined()
      expect(kit!.promotionPriceMYR).toBe(68)
      expect(kit!.sellable).toBe(true)
      expect(kit!.counted).toBe(true)
    }
    expect(skuById('nyonya-travel')?.label).toBe('Nyonya · Travel Kit')
  })

  it('has the travel kit under Spirit 1, not Spirit 2, keeping the id it was filed under', () => {
    const kit = skuById('spirit-2-travel')!
    expect(kit.productId).toBe('spirit-1')
    expect(kit.label).toBe('Spirit 1 · Travel Kit')
    expect(sellableSkus.some((s) => s.productId === 'spirit-2' && s.variant === 'travel')).toBe(false)
  })

  it('rings a vial up at a typed price only, RM 0 included', () => {
    const vial = skuById('orchid-vial')!
    expect(hasListPrice(vial)).toBe(false)
    expect(tiersFor(vial, 'promotion')).toEqual(['other'])
    expect(tiersFor(vial, 'retail')).toEqual(['other'])
    expect(lineUnitPrice({ skuId: 'orchid-vial', priceTier: 'other', unitPriceMYR: 0 }, 'promotion')).toBe(0)
    expect(lineUnitPrice({ skuId: 'orchid-vial', priceTier: 'other', unitPriceMYR: 15 }, 'promotion')).toBe(15)
  })

  it('prices each tier off the list', () => {
    expect(priceAtTier(orchid, 'retail')).toBe(238)
    expect(priceAtTier(orchid, 'promotion')).toBe(188)
    expect(priceAtTier(wish, 'offer')).toBe(10)
    expect(priceAtTier(undefined, 'retail')).toBe(0)
  })

  it('never lets an item without an offer price be sold for nothing', () => {
    // Asking for a tier the item does not have falls back to the everyday price.
    expect(priceAtTier(orchid, 'offer')).toBe(188)
  })

  it('counts a line at the price the counter chose, whatever the store is on', () => {
    expect(lineUnitPrice({ skuId: 'orchid-retail', priceTier: 'retail' }, 'promotion')).toBe(238)
    expect(lineUnitPrice({ skuId: 'orchid-retail', priceTier: 'promotion' }, 'retail')).toBe(188)
  })

  it('counts an "other" line at the figure the counter typed, and never at nothing', () => {
    expect(lineUnitPrice({ skuId: 'orchid-retail', priceTier: 'other', unitPriceMYR: 150 }, 'promotion')).toBe(150)
    // A line that carries its own price is counted at it, whatever the tier says.
    expect(lineUnitPrice({ skuId: 'orchid-retail', priceTier: 'retail', unitPriceMYR: 200 }, 'promotion')).toBe(200)
    // An "other" line that somehow lost its figure falls back to the store's price.
    expect(lineUnitPrice({ skuId: 'orchid-retail', priceTier: 'other' }, 'promotion')).toBe(188)
  })

  it('falls back to the store’s basis where nobody chose — dealers and consignment', () => {
    expect(lineUnitPrice({ skuId: 'orchid-retail' }, 'retail')).toBe(238)
    expect(lineUnitPrice({ skuId: 'orchid-retail' }, 'promotion')).toBe(188)
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

  it('has the 3ml vial for the sixteen fragrances the fourth revision lists, sold and ordered but not counted', () => {
    expect(vialSkus.map((s) => s.productId)).toEqual([
      'orchid', 'violet', 'mahsuri', 'man',
      'nyonya-aromatic', 'kebaya-blooms', 'ondeh-delights',
      'dream', 'passion', 'life', 'love', 'hope', 'confidence',
      'wish-1', 'wish-2', 'wish-3',
    ])
    for (const v of vialSkus) {
      expect(v.label, v.id).toMatch(/· 3ml Vial$/)
      expect(v.sellable, v.label).toBe(true)
      expect(v.counted, v.label).toBe(false)
    }
    expect(skuById('wish-2-vial')?.label).toBe('Wish 2 · 3ml Vial')
  })

  it('counts every priced line on the shelf, travel kits included — not vials or testers', () => {
    expect(countedSkus).toHaveLength(23)
    expect(countedSkus.every((s) => s.sellable && hasListPrice(s))).toBe(true)
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
