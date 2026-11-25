/**
 * Add a product's two dropdowns (25 November: "put add collection, make new
 * collection, make new product dropdown in add a product card"): the product's
 * name, and the collection it is in. Each ends with making a new one.
 *
 * Choosing one keeps the other making sense: a product shows its collection, a
 * collection lists its products, and a new collection starts with a new
 * product.
 */
import { collections, products, type Product } from '../data/products'

/** "Make a new product…", "Make a new collection…". */
export const MAKE_NEW = '__new'

export interface AddChoice {
  /** A product's id, `MAKE_NEW`, or empty until one is chosen. */
  productId: string
  /** A collection's id, `MAKE_NEW`, or empty until there is one. */
  collectionId: string
  /**
   * The collection was chosen, rather than shown for the product chosen. Only
   * then are the products narrowed to it, so one picked by mistake can be
   * changed for any other.
   */
  chosen: boolean
}

export const NOTHING_CHOSEN: AddChoice = { productId: '', collectionId: '', chosen: false }

/** The products to choose from, under their collections: all of them, or the chosen collection's. */
export const productGroups = (choice: AddChoice): { id: string; name: string; products: Product[] }[] =>
  collections
    .filter((c) => !choice.chosen || c.id === choice.collectionId)
    .map((c) => ({ id: c.id, name: c.name, products: products.filter((p) => p.collectionId === c.id) }))
    .filter((g) => g.products.length > 0)

export const pickProduct = (was: AddChoice, productId: string): AddChoice => {
  if (productId === MAKE_NEW) return { ...was, productId }
  const product = products.find((p) => p.id === productId)
  if (product) return { ...was, productId, collectionId: product.collectionId }
  return { ...was, productId: '', collectionId: was.chosen ? was.collectionId : '' }
}

export const pickCollection = (was: AddChoice, collectionId: string): AddChoice => {
  if (collectionId === MAKE_NEW) return { productId: MAKE_NEW, collectionId, chosen: true }
  const product = products.find((p) => p.id === was.productId)
  // Cleared: every product is listed again, and one already chosen shows its own.
  if (!collectionId) return { productId: was.productId, collectionId: product?.collectionId ?? '', chosen: false }
  const keep = !product || product.collectionId === collectionId
  return { productId: keep ? was.productId : '', collectionId, chosen: true }
}
