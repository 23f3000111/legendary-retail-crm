/**
 * The catalogue, from the price list in "CRM Revision 2".
 *
 * A *product* is the fragrance; a *SKU* is a thing you can count on a shelf.
 * Stock, sales and orders all work at SKU level (discovery Q54).
 *
 * ── Two prices, and which one counts ────────────────────────────────────────
 *
 * Every sellable item has a **retail price** and a **promotion price**, and the
 * store list says which of the two each location's revenue is counted on:
 * BSAS and Sasa on retail, everybody else on promotion. So a price is never a
 * single number here — `priceOf` takes the basis, and the basis comes from the
 * location. Getting this wrong would misstate revenue by more than 20%.
 *
 * ── What is sold, what is counted, what is ordered ──────────────────────────
 *
 *   retail / set / travel   sold, counted, ordered
 *   vial                    given free (FOC), counted, ordered
 *   tester                  ordered only — not sold, and not counted
 *
 * Vials were in Revision 2 as counted-but-never-sold, then taken out at the
 * client's request. The client's fourth revision (October) brought the 3ml
 * vial back for sales and orders, and the follow-up of 6 October settled the
 * rest: every vial goes free of charge — one tap, "FOC", RM 0, nothing to
 * type — and vials are counted on the shelf every night like everything else.
 *
 * There is deliberately no cost price anywhere. The client was explicit that
 * only revenue is recorded (Q58, Q65); the one margin figure in the system sits
 * on the location, not on the product.
 */

export type CollectionId = 'signature' | 'nyonya' | 'three-wishes' | 'spirit'

export type Variant = 'retail' | 'set' | 'travel' | 'vial' | 'tester'

export const VARIANT_LABEL: Record<Variant, string> = {
  retail: 'Bottle',
  set: 'Set',
  travel: 'Travel kit',
  vial: 'Vial',
  tester: 'Tester',
}

/** Which price a location's revenue is counted on (the store list's column). */
export type PriceBasis = 'retail' | 'promotion'

/**
 * What was actually charged for one line of a sale.
 *
 * The store's basis is the default — most things go at the promotion price —
 * but the counter decides per sale. A customer paying full price is a retail
 * line; a Wish added on to a bottle goes at the offer price. Recording which
 * one was charged is the only way the revenue can be right, and it is also the
 * only way to answer "how much did we sell at full price?"
 */
export type PriceTier = 'retail' | 'promotion' | 'offer' | 'other' | 'foc'

export const TIER_LABEL: Record<PriceTier, string> = {
  retail: 'Retail',
  promotion: 'Promotion',
  offer: 'Offer',
  // "All items add an 'others' section for them to fill up other amount" —
  // the counter types what was actually charged.
  other: 'Other',
  // Free of charge: the only price a vial has (client, 6 October).
  foc: 'FOC',
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
  /** Full price. What BSAS and Sasa are counted on. */
  retailPriceMYR: number
  /** The everyday price. What every other location is counted on. */
  promotionPriceMYR: number
  /** The extra the client's list shows against the Wishes. */
  offerMYR?: number
  /** Units at or below which a top-up should be raised. */
  reorderPoint: number
  /** The warehouse ships in multiples of this. */
  caseSize: number
  /** Relative share of units sold, used by the demo data generator. */
  popularity: number
  bestseller: boolean
  /** Testers are never sold. */
  sellable: boolean
  /** Testers are ordered but never counted on the shelf (Revision 2). */
  counted: boolean
}

export const products: Product[] = [
  // Signature
  { id: 'orchid', name: 'Orchid', collection: 'Signature', collectionId: 'signature', family: 'Floral Fruity', audience: 'For Her' },
  { id: 'mahsuri', name: 'Mahsuri', collection: 'Signature', collectionId: 'signature', family: 'Fruity Floral', audience: 'For Her' },
  { id: 'violet', name: 'Violet', collection: 'Signature', collectionId: 'signature', family: 'Powdery Floral', audience: 'For Her' },
  { id: 'man', name: 'Man', collection: 'Signature', collectionId: 'signature', family: 'Woody Aromatic', audience: 'For Him' },

  // Nyonya
  { id: 'nyonya-aromatic', name: 'Nyonya Aromatic', collection: 'Nyonya', collectionId: 'nyonya', family: 'Spicy Floral', audience: 'Unisex' },
  { id: 'kebaya-blooms', name: 'Kebaya Blooms', collection: 'Nyonya', collectionId: 'nyonya', family: 'Floral', audience: 'For Her' },
  { id: 'ondeh-delights', name: 'Ondeh Delights', collection: 'Nyonya', collectionId: 'nyonya', family: 'Green Gourmand', audience: 'Unisex' },
  // The collection's travel kit (fourth revision).
  { id: 'nyonya', name: 'Nyonya', collection: 'Nyonya', collectionId: 'nyonya', family: 'Gift set', audience: 'Unisex' },

  // Spirit
  { id: 'life', name: 'Life', collection: 'Spirit', collectionId: 'spirit', family: 'Fresh Citrus', audience: 'Unisex' },
  { id: 'passion', name: 'Passion', collection: 'Spirit', collectionId: 'spirit', family: 'Warm Amber', audience: 'Unisex' },
  { id: 'dream', name: 'Dream', collection: 'Spirit', collectionId: 'spirit', family: 'Soft Musk', audience: 'Unisex' },
  { id: 'love', name: 'Love', collection: 'Spirit', collectionId: 'spirit', family: 'Rose Amber', audience: 'Unisex' },
  { id: 'hope', name: 'Hope', collection: 'Spirit', collectionId: 'spirit', family: 'Green Floral', audience: 'Unisex' },
  { id: 'confidence', name: 'Confidence', collection: 'Spirit', collectionId: 'spirit', family: 'Woody Spice', audience: 'Unisex' },
  { id: 'spirit-1', name: 'Spirit 1', collection: 'Spirit', collectionId: 'spirit', family: 'Gift set', audience: 'Unisex' },
  { id: 'spirit-2', name: 'Spirit 2', collection: 'Spirit', collectionId: 'spirit', family: 'Gift set', audience: 'Unisex' },

  // 3 Wishes
  { id: 'three-wishes', name: '3 Wishes', collection: '3 Wishes', collectionId: 'three-wishes', family: 'Gift set', audience: 'Unisex' },
  { id: 'wish-1', name: 'Wish 1', collection: '3 Wishes', collectionId: 'three-wishes', family: 'Floral', audience: 'For Her' },
  { id: 'wish-2', name: 'Wish 2', collection: '3 Wishes', collectionId: 'three-wishes', family: 'Fruity', audience: 'For Her' },
  { id: 'wish-3', name: 'Wish 3', collection: '3 Wishes', collectionId: 'three-wishes', family: 'Musk', audience: 'Unisex' },
]

/** The sellable lines, exactly as the client's price lists have them. */
interface SellableSeed {
  productId: string
  size: string
  variant: 'retail' | 'set' | 'travel'
  retail: number
  promotion: number
  offer?: number
  popularity: number
  bestseller?: boolean
  /** Where the usual `product-variant` id is taken, or must not change. */
  id?: string
  /** Where the usual code would clash with another line's. */
  code?: string
}

const sellableSeeds: SellableSeed[] = [
  { productId: 'orchid', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 15, bestseller: true },
  { productId: 'violet', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 9 },
  { productId: 'mahsuri', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 13, bestseller: true },
  // Fourth revision: the Spirit 1 set already on sale is the old one, and a
  // new one comes alongside it. No price was given for the new set, so it is
  // the old one's until the client says otherwise.
  { productId: 'spirit-1', size: 'Set (old)', variant: 'set', retail: 238, promotion: 188, popularity: 6 },
  { productId: 'spirit-1', size: 'Set (new)', variant: 'set', retail: 238, promotion: 188, popularity: 3, id: 'spirit-1-set-new', code: 'LGD-SPI1-SN' },
  { productId: 'spirit-2', size: 'Set', variant: 'set', retail: 238, promotion: 188, popularity: 5 },
  { productId: 'life', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 7 },
  { productId: 'passion', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 7 },
  { productId: 'dream', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 6 },
  { productId: 'nyonya-aromatic', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 8 },
  { productId: 'kebaya-blooms', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 11, bestseller: true },
  { productId: 'ondeh-delights', size: '30ml', variant: 'retail', retail: 238, promotion: 188, popularity: 8 },
  { productId: 'man', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 12, bestseller: true },
  // Fourth revision: on sale at last, at the same two prices as the rest.
  { productId: 'love', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 4 },
  { productId: 'hope', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 4 },
  { productId: 'confidence', size: '50ml', variant: 'retail', retail: 238, promotion: 188, popularity: 4 },
  { productId: 'three-wishes', size: 'Set', variant: 'set', retail: 238, promotion: 188, popularity: 9, bestseller: true },
  // Added in the client's third revision, with a promotional price only. The
  // retail price is set to the same figure until the client gives one.
  { productId: 'three-wishes', size: 'Travel Kit', variant: 'travel', retail: 68, promotion: 68, popularity: 4 },
  // The fourth revision corrects this one: it is Spirit 1's travel kit, not
  // Spirit 2's. The id stays as it was, because every count, order and sale
  // since 29 September is filed under it — moving the product is enough to
  // put all of them under Spirit 1.
  { productId: 'spirit-1', size: 'Travel Kit', variant: 'travel', retail: 68, promotion: 68, popularity: 3, id: 'spirit-2-travel' },
  // Fourth revision. No price was given; it is the other two kits' RM 68 until
  // the client says otherwise.
  { productId: 'nyonya', size: 'Travel Kit', variant: 'travel', retail: 68, promotion: 68, popularity: 3 },
  // Single 15ml bottles, not sets (client, 6 October). The ids stay as they
  // were, so every sale, count and order already filed stays with them.
  { productId: 'wish-1', size: '15ml', variant: 'retail', retail: 128, promotion: 88, offer: 10, popularity: 6, id: 'wish-1-set' },
  { productId: 'wish-2', size: '15ml', variant: 'retail', retail: 128, promotion: 88, offer: 10, popularity: 5, id: 'wish-2-set' },
  { productId: 'wish-3', size: '15ml', variant: 'retail', retail: 128, promotion: 88, offer: 10, popularity: 5, id: 'wish-3-set' },
]

/**
 * The 3ml vial, one per fragrance, exactly as the fourth revision lists them.
 *
 * Given free of charge — rung up at "FOC", RM 0, with nothing to type —
 * counted on the shelf every night, and ordered like anything else.
 */
const vialProducts = [
  'orchid', 'violet', 'mahsuri', 'man',
  'nyonya-aromatic', 'kebaya-blooms', 'ondeh-delights',
  'dream', 'passion', 'life', 'love', 'hope', 'confidence',
  'wish-1', 'wish-2', 'wish-3',
]

/**
 * The tester list, exactly as Revision 2 gives it.
 *
 * Testers are ordered from HQ and are deliberately **not** part of the nightly
 * stock count. Love, Hope and Confidence had testers here and nothing on sale
 * until the fourth revision added their 50ml bottles.
 */
const testerSeeds: [productId: string, size: string][] = [
  ['orchid', '30ml'],
  ['violet', '30ml'],
  ['man', '50ml'],
  ['mahsuri', '30ml'],
  ['nyonya-aromatic', '30ml'],
  ['kebaya-blooms', '30ml'],
  ['ondeh-delights', '30ml'],
  ['love', '15ml'],
  ['love', '50ml'],
  ['hope', '15ml'],
  ['hope', '50ml'],
  ['confidence', '15ml'],
  ['confidence', '50ml'],
  ['life', '15ml'],
  ['life', '50ml'],
  ['passion', '15ml'],
  ['passion', '50ml'],
  ['dream', '15ml'],
  ['dream', '50ml'],
  ['wish-1', '15ml'],
  ['wish-1', '50ml'],
  ['wish-2', '15ml'],
  ['wish-2', '50ml'],
  ['wish-3', '15ml'],
  ['wish-3', '50ml'],
]

const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id

const VARIANT_CODE: Record<Variant, string> = {
  retail: 'R',
  set: 'S',
  travel: 'T',
  vial: 'V',
  tester: 'X',
}

/**
 * A shelf code that is actually unique.
 *
 * The product id carries its own number where there is one — "wish-1",
 * "spirit-2" — so it goes into the code. Slicing the name alone gave Wish 1, 2
 * and 3 the same code, which is worse than no code at all on a stock sheet.
 */
const codeFor = (productId: string, variant: Variant, size: string) => {
  const parts = productId.split('-')
  const letters = parts[0].replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase()
  const suffix = parts.length > 1 && /^\d+$/.test(parts[1]) ? parts[1] : ''
  const digits = size.replace(/[^0-9]/g, '').slice(0, 3) || 'S'
  return `LGD-${letters}${suffix}-${VARIANT_CODE[variant]}${digits}`
}

const sellable: Sku[] = sellableSeeds.map((s) => ({
  id: s.id ?? `${s.productId}-${s.variant}`,
  code: s.code ?? codeFor(s.productId, s.variant, s.size),
  productId: s.productId,
  // "Spirit 1 · Set (old)", "Nyonya · Travel Kit", "Orchid · 30ml".
  label: `${productName(s.productId)} · ${s.size}`,
  variant: s.variant,
  size: s.size,
  retailPriceMYR: s.retail,
  promotionPriceMYR: s.promotion,
  ...(s.offer ? { offerMYR: s.offer } : {}),
  reorderPoint: 24,
  caseSize: 12,
  popularity: s.popularity,
  bestseller: Boolean(s.bestseller),
  sellable: true,
  counted: true,
}))

const vials: Sku[] = vialProducts.map((productId) => ({
  id: `${productId}-vial`,
  code: codeFor(productId, 'vial', '3ml'),
  productId,
  label: `${productName(productId)} · 3ml Vial`,
  variant: 'vial' as const,
  size: '3ml',
  // Free of charge, always: rung up at "FOC".
  retailPriceMYR: 0,
  promotionPriceMYR: 0,
  // No reorder level was given. At 0 the store is told only when one runs
  // out entirely; the client can give a real figure later.
  reorderPoint: 0,
  caseSize: 12,
  popularity: 0,
  bestseller: false,
  sellable: true,
  // On the nightly count since 6 October.
  counted: true,
}))

const testers: Sku[] = testerSeeds.map(([productId, size]) => ({
  id: `${productId}-tester-${size}`,
  code: codeFor(productId, 'tester', size),
  productId,
  label: `${productName(productId)} · Tester ${size}`,
  variant: 'tester' as const,
  size,
  retailPriceMYR: 0,
  promotionPriceMYR: 0,
  reorderPoint: 2,
  caseSize: 6,
  popularity: 0,
  bestseller: false,
  sellable: false,
  // Revision 2: testers come out of the nightly stock count.
  counted: false,
}))

export const skus: Sku[] = [...sellable, ...vials, ...testers]

export const collections: { id: CollectionId; name: string; slot: 1 | 2 | 3 | 4 }[] = [
  { id: 'signature', name: 'Signature', slot: 1 },
  { id: 'nyonya', name: 'Nyonya', slot: 2 },
  { id: 'three-wishes', name: '3 Wishes', slot: 3 },
  { id: 'spirit', name: 'Spirit', slot: 4 },
]

export const skuById = (id: string) => skus.find((s) => s.id === id)

export const skuLabel = (id: string) => skuById(id)?.label ?? id

export const productById = (id: string) => products.find((p) => p.id === id)

/** Everything a shop can actually sell. */
export const sellableSkus = skus.filter((s) => s.sellable)

/** Everything counted on the shelf at night — no testers, per Revision 2. */
export const countedSkus = skus.filter((s) => s.counted)

/** Everything a shop can ask HQ for, which is everything including testers. */
export const orderableSkus = skus

export const testerSkus = skus.filter((s) => s.variant === 'tester')

export const vialSkus = skus.filter((s) => s.variant === 'vial')

/** An item with no list price — a vial — is only ever rung up at a typed price. */
export const hasListPrice = (sku: Sku | undefined): boolean =>
  Boolean(sku && (sku.retailPriceMYR > 0 || sku.promotionPriceMYR > 0))

/** Given away, never sold: every vial (client, 6 October). */
export const isFoc = (sku: Sku | undefined): boolean => sku?.variant === 'vial'

/**
 * What the counter calls one variant of a product, next to its name:
 * "30ml", "Set", "Set (old)", "Travel Kit", "3ml Vial".
 */
export const variantName = (sku: Sku): string => (sku.variant === 'vial' ? '3ml Vial' : sku.size)

export const collectionOfSku = (skuId: string): CollectionId | undefined =>
  productById(skuById(skuId)?.productId ?? '')?.collectionId

/**
 * What one unit is worth, on the basis the location is counted on.
 *
 * There is no single "price" in this system, so nothing should ever reach for
 * one. Passing the basis explicitly is what stops a report quietly counting
 * BSAS on the promotion price.
 */
export const priceOf = (sku: Sku | undefined, basis: PriceBasis): number =>
  !sku ? 0 : basis === 'retail' ? sku.retailPriceMYR : sku.promotionPriceMYR

export const priceOfId = (skuId: string, basis: PriceBasis): number =>
  priceOf(skuById(skuId), basis)

/**
 * What one unit costs at a named tier. "Other" has no list price — the counter
 * types it — so it comes back as 0 here and the line carries its own figure.
 */
export const priceAtTier = (sku: Sku | undefined, tier: PriceTier): number => {
  if (!sku) return 0
  if (tier === 'retail') return sku.retailPriceMYR
  if (tier === 'offer') return sku.offerMYR ?? sku.promotionPriceMYR
  if (tier === 'other' || tier === 'foc') return 0
  return sku.promotionPriceMYR
}

/**
 * The tiers this item can be sold at, in the order the counter should see them.
 *
 * The store's own basis comes first, since that is the price it charges nine
 * times in ten. Only the three Wishes carry an offer price, so only they get a
 * third button.
 */
export const tiersFor = (sku: Sku | undefined, basis: PriceBasis = 'promotion'): PriceTier[] => {
  if (!sku) return []
  // A vial is free: one button, nothing to type.
  if (isFoc(sku)) return ['foc']
  if (!hasListPrice(sku)) return ['other']
  const usual: PriceTier[] = basis === 'retail' ? ['retail', 'promotion'] : ['promotion', 'retail']
  return [...(sku.offerMYR ? [...usual, 'offer' as const] : usual), 'other']
}

/**
 * What one unit of a sale line is worth.
 *
 * In order: the price the counter actually charged, where the line carries
 * one; the line's tier, where a tier was chosen; and the store's own basis
 * where neither was — which is every dealer and consignment line, since those
 * report a figure rather than ringing up a sale.
 */
export const lineUnitPrice = (
  line: { skuId: string; priceTier?: PriceTier; unitPriceMYR?: number },
  basis: PriceBasis,
): number => {
  if (typeof line.unitPriceMYR === 'number') return line.unitPriceMYR
  if (line.priceTier && line.priceTier !== 'other') return priceAtTier(skuById(line.skuId), line.priceTier)
  return priceOfId(line.skuId, basis)
}
