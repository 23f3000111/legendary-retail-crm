import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { settle, signInAs, startFixture, written } from './testing'
import { applyCatalogue, countedSkus, sellableSkus, skuById, tiersFor, type CatalogueEntry } from '../data/products'
import type { LocalBackend } from '../api/local'

/**
 * Client, 20 October: "Can let 3 of us able to add and remove products?" —
 * Davy, Kelly and Chloe add products, change their prices and reorder levels,
 * and take them off, without waiting for us.
 */

let lb: LocalBackend
beforeEach(() => {
  lb = startFixture('kelly')
})
afterEach(() => applyCatalogue([]))

const save = useData.getState

describe('adding a product', () => {
  it('puts a new size of a fragrance on the counter, the count and the order list', async () => {
    const result = save().saveProduct({
      productId: 'orchid',
      variant: 'retail',
      size: '50ml',
      retailPriceMYR: 288,
      promotionPriceMYR: 238,
      reorderPoint: 12,
      caseSize: 6,
    })
    expect(result.ok).toBe(true)
    const added = sellableSkus.find((s) => s.label === 'Orchid · 50ml')!
    expect(added).toMatchObject({ retailPriceMYR: 288, promotionPriceMYR: 238, reorderPoint: 12, added: true })
    expect(countedSkus.some((s) => s.id === added.id)).toBe(true)
    expect(written()[0]).toMatchObject({ kind: 'product', action: 'product.added' })
    expect(written()[0].summary).toBe('Added Orchid · 50ml to the range')

    await settle()
    const doc = lb.allDocs().find((d) => d.kind === 'product' && d.id === added.id)?.doc as CatalogueEntry
    // Signed by the server with whoever was signed in.
    expect(doc.changedBy).toBe('Kelly Tew')
  })

  it('adds a new fragrance, with RM 198 as Promotion 2 when it sells at RM 188', () => {
    expect(
      save().saveProduct({
        newProduct: { name: 'Jasmine', collectionId: 'signature' },
        variant: 'retail',
        size: '30ml',
        retailPriceMYR: 238,
        promotionPriceMYR: 188,
        promotion2MYR: 198,
        reorderPoint: 24,
        caseSize: 12,
      }).ok,
    ).toBe(true)
    const jasmine = sellableSkus.find((s) => s.label === 'Jasmine · 30ml')!
    expect(tiersFor(jasmine, 'promotion')).toEqual(['promotion', 'promotion2', 'retail', 'other'])
  })

  it('refuses a line that is already on the range, a missing name or size, and prices that make no sense', () => {
    const base = { variant: 'retail' as const, retailPriceMYR: 238, promotionPriceMYR: 188, reorderPoint: 24, caseSize: 12 }
    expect(save().saveProduct({ ...base, productId: 'orchid', size: '30ml' }).error).toMatch(/already on the range/)
    expect(save().saveProduct({ ...base, newProduct: { name: ' ', collectionId: 'signature' }, size: '30ml' }).error).toMatch(
      /name/,
    )
    expect(save().saveProduct({ ...base, productId: 'orchid', size: '' }).error).toMatch(/size/)
    expect(save().saveProduct({ ...base, productId: 'orchid', size: '75ml', promotionPriceMYR: 0 }).error).toMatch(
      /price/,
    )
    expect(save().saveProduct({ ...base, productId: 'orchid', size: '75ml', caseSize: 0 }).error).toMatch(/case/)
  })
})

describe('changing and taking off a product', () => {
  it('changes the price of one of the client’s own lines, and logs before and after', () => {
    const kit = skuById('nyonya-travel')!
    const result = save().saveProduct({
      skuId: kit.id,
      retailPriceMYR: 88,
      promotionPriceMYR: 78,
      reorderPoint: kit.reorderPoint,
      caseSize: kit.caseSize,
    })
    expect(result.ok).toBe(true)
    expect(skuById('nyonya-travel')).toMatchObject({ promotionPriceMYR: 78, retailPriceMYR: 88 })
    expect(written()[0]).toMatchObject({ action: 'product.changed', summary: 'Changed Nyonya · Travel Kit' })
    expect(written()[0].detail).toContain('Promotion RM 68 → RM 78')
    expect(written()[0].detail).toContain('Retail RM 68 → RM 88')
  })

  it('takes a product off and brings it back, keeping it on record throughout', () => {
    expect(save().removeProduct('violet-retail').ok).toBe(true)
    expect(sellableSkus.some((s) => s.id === 'violet-retail')).toBe(false)
    expect(skuById('violet-retail')?.label).toBe('Violet · 30ml')
    expect(written()[0]).toMatchObject({ action: 'product.removed', summary: 'Took Violet · 30ml off the range' })

    expect(save().restoreProduct('violet-retail').ok).toBe(true)
    expect(sellableSkus.some((s) => s.id === 'violet-retail')).toBe(true)
    expect(written()[0]).toMatchObject({ action: 'product.restored' })
  })

  it('is Davy’s, Kelly’s and Chloe’s to do — not Finance’s, a promoter’s, or the founder’s', () => {
    for (const [who, at] of [
      ['davy', undefined],
      ['chloe', undefined],
    ] as const) {
      signInAs(lb, who, at)
      expect(save().removeProduct('violet-retail').ok, who).toBe(true)
      expect(save().restoreProduct('violet-retail').ok, who).toBe(true)
    }
    for (const [who, at] of [
      ['siew-fang', undefined],
      ['teokoknian', 'klia-t2'],
      ['vins', undefined],
    ] as const) {
      signInAs(lb, who, at)
      expect(save().removeProduct('violet-retail').ok, who).toBe(false)
    }
  })
})

describe('the server’s side of it', () => {
  const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
    skuId: 'orchid-retail-50ml',
    productId: 'orchid',
    variant: 'retail',
    size: '50ml',
    code: 'LGD-ORC-R50',
    retailPriceMYR: 288,
    promotionPriceMYR: 238,
    reorderPoint: 12,
    caseSize: 6,
    ...over,
  })
  const put = (who: string, at: string | undefined, e: CatalogueEntry, id = e.skuId) =>
    lb.putSync(lb.openSessionForTests(who, at), [{ kind: 'product', id, doc: e }])

  it('takes a product only from Davy, Kelly or Chloe', () => {
    expect(put('kelly', undefined, entry()).ok).toBe(true)
    expect(put('siew-fang', undefined, entry()).ok).toBe(false)
    expect(put('teokoknian', 'klia-t2', entry()).ok).toBe(false)
  })

  it('checks the product itself, however it was sent', () => {
    expect(put('kelly', undefined, entry({ promotionPriceMYR: -1 })).error).toMatch(/price/)
    expect(put('kelly', undefined, entry({ caseSize: 0 })).error).toMatch(/case/)
    expect(put('kelly', undefined, entry({ size: '' })).error).toMatch(/size/)
    expect(put('kelly', undefined, entry({ variant: 'gift' as never })).error).toMatch(/kind/)
    expect(put('kelly', undefined, entry(), 'something-else').error).toMatch(/match/)
  })

  it('never deletes a product — it is taken off, so its history keeps its name', () => {
    const token = lb.openSessionForTests('kelly')
    lb.putSync(token, [{ kind: 'product', id: 'orchid-retail-50ml', doc: entry() }])
    expect(lb.removeSync(token, 'product', ['orchid-retail-50ml']).error).toMatch(/taken off/)
  })
})
