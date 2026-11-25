import { afterEach, describe, expect, it } from 'vitest'
import { MAKE_NEW, NOTHING_CHOSEN, pickCollection, pickProduct, productGroups } from './addProduct'
import { applyCatalogue, collections, products } from '../data/products'

/**
 * Add a product's two dropdowns (25 November): the product's name, and its
 * collection. Choosing one keeps the other making sense.
 */

afterEach(() => applyCatalogue([]))

/** The names the product dropdown lists them under. */
const listed = (c: Parameters<typeof productGroups>[0]) => productGroups(c).map((g) => g.name)

describe('the two dropdowns of Add a product', () => {
  it('lists every product under its collection until a collection is chosen', () => {
    expect(listed(NOTHING_CHOSEN)).toEqual(collections.map((c) => c.name))
    expect(productGroups(NOTHING_CHOSEN).flatMap((g) => g.products)).toHaveLength(products.length)
  })

  it('lists only that collection’s products once one is chosen, and none for a new one', () => {
    const spirit = pickCollection(NOTHING_CHOSEN, 'spirit')
    expect(listed(spirit)).toEqual(['Spirit'])
    expect(productGroups(spirit)[0].products.every((p) => p.collectionId === 'spirit')).toBe(true)
    expect(listed(pickCollection(NOTHING_CHOSEN, MAKE_NEW))).toEqual([])
    // Cleared again: everything.
    expect(listed(pickCollection(spirit, ''))).toHaveLength(4)
  })

  it('shows the collection of a product that is chosen, and still lists the others to change to', () => {
    const orchid = pickProduct(NOTHING_CHOSEN, 'orchid')
    expect(orchid).toMatchObject({ productId: 'orchid', collectionId: 'signature' })
    expect(listed(orchid)).toHaveLength(4)
    const life = pickProduct(orchid, 'life')
    expect(life).toMatchObject({ productId: 'life', collectionId: 'spirit' })
    expect(listed(life)).toHaveLength(4)
  })

  it('keeps listing the chosen collection’s while its products are tried', () => {
    expect(listed(pickProduct(pickCollection(NOTHING_CHOSEN, 'spirit'), 'life'))).toEqual(['Spirit'])
  })

  it('keeps the collection for a product being made', () => {
    expect(pickProduct(pickCollection(NOTHING_CHOSEN, 'spirit'), MAKE_NEW)).toMatchObject({ productId: MAKE_NEW, collectionId: 'spirit' })
    expect(pickProduct(NOTHING_CHOSEN, MAKE_NEW)).toMatchObject({ productId: MAKE_NEW, collectionId: '' })
    // From a product chosen by mistake: its collection is only a start, and can be changed.
    expect(pickProduct(pickProduct(NOTHING_CHOSEN, 'orchid'), MAKE_NEW)).toMatchObject({ productId: MAKE_NEW, collectionId: 'signature' })
  })

  it('starts a new collection with a new product', () => {
    expect(pickCollection(pickProduct(NOTHING_CHOSEN, 'orchid'), MAKE_NEW)).toMatchObject({ productId: MAKE_NEW, collectionId: MAKE_NEW })
  })

  it('lets go of a product that is not in the collection chosen, and keeps one that is', () => {
    expect(pickCollection(pickProduct(NOTHING_CHOSEN, 'orchid'), 'spirit')).toMatchObject({ productId: '', collectionId: 'spirit' })
    expect(pickCollection(pickProduct(NOTHING_CHOSEN, 'life'), 'spirit')).toMatchObject({ productId: 'life', collectionId: 'spirit' })
    expect(pickCollection(pickProduct(pickCollection(NOTHING_CHOSEN, 'spirit'), MAKE_NEW), 'nyonya')).toMatchObject({
      productId: MAKE_NEW,
      collectionId: 'nyonya',
    })
  })

  it('forgets everything when nothing is chosen again', () => {
    expect(pickProduct(pickProduct(NOTHING_CHOSEN, 'orchid'), '')).toMatchObject({ productId: '', collectionId: '' })
    expect(pickProduct(pickCollection(NOTHING_CHOSEN, 'spirit'), '')).toMatchObject({ productId: '', collectionId: 'spirit' })
  })
})
