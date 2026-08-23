/**
 * The catalogue.
 *
 * The client confirmed 19 products, and that every variant — size, refill,
 * travel size, gift set, tester — is counted as its own line (discovery Q53,
 * Q54). So a *product* is the fragrance, and a *SKU* is a thing you can count
 * on a shelf. Stock, sales and orders all work at SKU level.
 *
 * Nine products are confirmed from the retail site with real prices. The
 * remaining ten are awaiting the client's full product list; they are absent
 * rather than invented, and `CATALOGUE_PENDING` records the gap so the UI can
 * say so honestly.
 *
 * There is deliberately no cost price anywhere. The client was explicit that
 * only revenue is recorded (Q58, Q65); the one margin figure in the system sits
 * on the consignment partner, not on the product.
 */

export type CollectionId = 'signature' | 'nyonya' | 'three-wishes' | 'spirit'

export type Variant = 'retail' | 'travel' | 'refill' | 'giftset' | 'tester'

export const VARIANT_LABEL: Record<Variant, string> = {
  retail: 'Retail',
  travel: 'Travel size',
  refill: 'Refill',
  giftset: 'Gift set',
  tester: 'Tester',
}

export interface Product {
  id: string
  name: string
  collection: string
  collectionId: CollectionId
  family: string
  audience: 'For Her' | 'For Him' | 'Unisex'
}

export interface Sku {
  id: string
  code: string
  productId: string
  /** "Orchid · 30ml" — what a promoter reads on the shelf. */
  label: string
  variant: Variant
  size: string
  /** Legendary's revenue per unit. Shops may retail at their own price (Q60). */
  priceMYR: number
  /** Units at or below which a top-up should be raised. */
  reorderPoint: number
  /** The warehouse ships in multiples of this. */
  caseSize: number
  /** Relative share of units sold, used by the demo data generator. */
  popularity: number
  bestseller: boolean
  /** Testers are counted and written off, never sold. */
  sellable: boolean
}

/** How many products the client says exist, against how many we have details for. */
export const CATALOGUE_PENDING = { confirmed: 9, total: 19 }

export const products: Product[] = [
  { id: 'orchid', name: 'Orchid', collection: 'Signature', collectionId: 'signature', family: 'Floral Fruity', audience: 'For Her' },
  { id: 'mahsuri', name: 'Mahsuri', collection: 'Signature', collectionId: 'signature', family: 'Fruity Floral', audience: 'For Her' },
  { id: 'violet', name: 'Violet', collection: 'Signature', collectionId: 'signature', family: 'Powdery Floral', audience: 'For Her' },
  { id: 'man', name: 'Man', collection: 'Signature', collectionId: 'signature', family: 'Woody Aromatic', audience: 'For Him' },
  { id: 'kebaya-blooms', name: 'Kebaya Blooms', collection: 'Nyonya', collectionId: 'nyonya', family: 'Floral', audience: 'For Her' },
  { id: 'ondeh-delights', name: 'Ondeh Delights', collection: 'Nyonya', collectionId: 'nyonya', family: 'Green Gourmand', audience: 'Unisex' },
  { id: 'nyonya-aromatic', name: 'Nyonya Aromatic', collection: 'Nyonya', collectionId: 'nyonya', family: 'Spicy Aromatic', audience: 'Unisex' },
  { id: '3-wishes', name: '3 Wishes', collection: '3 Wishes', collectionId: 'three-wishes', family: 'Clean Musk', audience: 'Unisex' },
  { id: 'spirit', name: 'Spirit', collection: 'Spirit', collectionId: 'spirit', family: 'Fresh Discovery', audience: 'Unisex' },
]

interface SkuSeed {
  productId: string
  variant: Variant
  size: string
  price: number
  reorderPoint: number
  caseSize: number
  popularity: number
  bestseller?: boolean
}

const skuSeeds: SkuSeed[] = [
  // Signature — the four icons, each with a travel size and a counter tester.
  { productId: 'orchid', variant: 'retail', size: '30ml', price: 159, reorderPoint: 24, caseSize: 12, popularity: 1.0, bestseller: true },
  { productId: 'orchid', variant: 'travel', size: '10ml', price: 69, reorderPoint: 18, caseSize: 12, popularity: 0.42 },
  { productId: 'orchid', variant: 'tester', size: '30ml', price: 0, reorderPoint: 4, caseSize: 6, popularity: 0 },

  { productId: 'mahsuri', variant: 'retail', size: '30ml', price: 159, reorderPoint: 24, caseSize: 12, popularity: 0.88, bestseller: true },
  { productId: 'mahsuri', variant: 'travel', size: '10ml', price: 69, reorderPoint: 18, caseSize: 12, popularity: 0.36 },
  { productId: 'mahsuri', variant: 'tester', size: '30ml', price: 0, reorderPoint: 4, caseSize: 6, popularity: 0 },

  { productId: 'violet', variant: 'retail', size: '30ml', price: 149, reorderPoint: 18, caseSize: 12, popularity: 0.61 },
  { productId: 'violet', variant: 'tester', size: '30ml', price: 0, reorderPoint: 4, caseSize: 6, popularity: 0 },

  { productId: 'man', variant: 'retail', size: '50ml', price: 189, reorderPoint: 20, caseSize: 12, popularity: 0.79, bestseller: true },
  { productId: 'man', variant: 'travel', size: '10ml', price: 79, reorderPoint: 16, caseSize: 12, popularity: 0.31 },
  { productId: 'man', variant: 'tester', size: '50ml', price: 0, reorderPoint: 4, caseSize: 6, popularity: 0 },

  // Nyonya
  { productId: 'kebaya-blooms', variant: 'retail', size: '30ml', price: 159, reorderPoint: 20, caseSize: 12, popularity: 0.83, bestseller: true },
  { productId: 'kebaya-blooms', variant: 'tester', size: '30ml', price: 0, reorderPoint: 4, caseSize: 6, popularity: 0 },
  { productId: 'ondeh-delights', variant: 'retail', size: '30ml', price: 159, reorderPoint: 18, caseSize: 12, popularity: 0.57 },
  { productId: 'nyonya-aromatic', variant: 'retail', size: '30ml', price: 159, reorderPoint: 18, caseSize: 12, popularity: 0.49 },

  // Boxed sets — packed in advance, counted as one item (Q55).
  { productId: '3-wishes', variant: 'giftset', size: '3 × 15ml', price: 199, reorderPoint: 16, caseSize: 8, popularity: 0.72, bestseller: true },
  { productId: 'spirit', variant: 'giftset', size: '3 × 15ml', price: 179, reorderPoint: 16, caseSize: 8, popularity: 0.44 },

  // Refills — sold against the signature bottles.
  { productId: 'orchid', variant: 'refill', size: '30ml pouch', price: 109, reorderPoint: 12, caseSize: 12, popularity: 0.23 },
  { productId: 'mahsuri', variant: 'refill', size: '30ml pouch', price: 109, reorderPoint: 12, caseSize: 12, popularity: 0.19 },
]

const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id

const VARIANT_CODE: Record<Variant, string> = {
  retail: 'R',
  travel: 'T',
  refill: 'F',
  giftset: 'G',
  tester: 'X',
}

export const skus: Sku[] = skuSeeds.map((s) => {
  const name = productName(s.productId)
  const shortProduct = s.productId.slice(0, 3).toUpperCase()
  return {
    id: `${s.productId}-${s.variant}`,
    code: `LGD-${shortProduct}-${VARIANT_CODE[s.variant]}${s.size.replace(/[^0-9]/g, '').slice(0, 3) || '00'}`,
    productId: s.productId,
    label: s.variant === 'retail' ? `${name} · ${s.size}` : `${name} · ${VARIANT_LABEL[s.variant]}`,
    variant: s.variant,
    size: s.size,
    priceMYR: s.price,
    reorderPoint: s.reorderPoint,
    caseSize: s.caseSize,
    popularity: s.popularity,
    bestseller: Boolean(s.bestseller),
    sellable: s.variant !== 'tester',
  }
})

export const collections: { id: CollectionId; name: string; slot: 1 | 2 | 3 | 4 }[] = [
  { id: 'signature', name: 'Signature', slot: 1 },
  { id: 'nyonya', name: 'Nyonya', slot: 2 },
  { id: 'three-wishes', name: '3 Wishes', slot: 3 },
  { id: 'spirit', name: 'Spirit', slot: 4 },
]

export const skuById = (id: string) => skus.find((s) => s.id === id)

export const skuLabel = (id: string) => skuById(id)?.label ?? id

export const productById = (id: string) => products.find((p) => p.id === id)

/** Everything a shop can actually sell — testers are counted but never sold. */
export const sellableSkus = skus.filter((s) => s.sellable)

export const collectionOfSku = (skuId: string): CollectionId | undefined =>
  productById(skuById(skuId)?.productId ?? '')?.collectionId
