/**
 * A product as head office keys it in (client, 20 October): Davy, Kelly and
 * Chloe add products, change their prices and reorder levels, and take them
 * off.
 *
 * The screen and the store check a product before it is sent, and the server
 * checks it again, so a product that arrives by any other route meets the same
 * rules. `catalogueRefusal` is the local backend's twin of
 * `_catalogue_refusal` in `0001_init.sql`; keep the two in step.
 */
import type { PutDoc } from '../api/backend'

const VARIANTS = ['retail', 'set', 'travel', 'vial', 'tester']
const COLLECTIONS = ['signature', 'nyonya', 'three-wishes', 'spirit']

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isWhole = (v: unknown, min: number) => isNumber(v) && Number.isInteger(v) && v >= min
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const catalogueRefusal = (d: PutDoc): string | null => {
  const e = (d.doc ?? {}) as Record<string, unknown>
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(d.id) || e.skuId !== d.id) return 'That product does not match its record.'
  if (d.locationId) return 'A product belongs to the whole range, not to one store.'
  if (!VARIANTS.includes(e.variant as string)) return 'Choose what kind of product it is.'
  if (!text(e.productId)) return 'Choose the fragrance.'
  const product = e.product as Record<string, unknown> | undefined
  if (product !== undefined && product !== null) {
    if (product.id !== e.productId) return 'That product does not match its record.'
    if (!text(product.name) || text(product.name).length > 60) return 'A new fragrance needs a name.'
    if (!COLLECTIONS.includes(product.collectionId as string)) return 'Choose the collection.'
  }
  if (!text(e.size) || text(e.size).length > 40) return 'Give the size, like 30ml or Set.'
  if (!text(e.code) || text(e.code).length > 40) return 'That product needs a shelf code.'
  if (!isNumber(e.retailPriceMYR) || !isNumber(e.promotionPriceMYR) || e.retailPriceMYR < 0 || e.promotionPriceMYR < 0) {
    return 'A price must be 0 or more.'
  }
  const sold = e.variant !== 'vial' && e.variant !== 'tester'
  if (sold && (e.retailPriceMYR <= 0 || e.promotionPriceMYR <= 0)) return 'A product that is sold needs a retail and a promotion price.'
  if (e.promotion2MYR !== undefined && e.promotion2MYR !== null && (!isNumber(e.promotion2MYR) || e.promotion2MYR <= 0)) {
    return 'A Promotion 2 price must be more than 0.'
  }
  if (!isWhole(e.reorderPoint, 0)) return 'The reorder level must be a whole number, 0 or more.'
  if (!isWhole(e.caseSize, 1)) return 'The case size must be a whole number, 1 or more.'
  return null
}

/**
 * The order the range is listed in, as Davy, Kelly or Chloe arranged it
 * (16 November): one record for the whole range, a list of its line ids.
 * The local backend's twin of `_product_order_refusal` in `0001_init.sql`;
 * keep the two in step.
 */
export const PRODUCT_ORDER_ID = 'range'
const MAX_ORDERED = 500

export const productOrderRefusal = (d: PutDoc): string | null => {
  if (d.locationId) return 'The order belongs to the whole range, not to one store.'
  const ids = ((d.doc ?? {}) as { skuIds?: unknown }).skuIds
  if (d.id !== PRODUCT_ORDER_ID || !Array.isArray(ids) || ids.length > MAX_ORDERED) {
    return 'That is not an order of the range.'
  }
  if (ids.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(id))) {
    return 'That is not an order of the range.'
  }
  if (new Set(ids).size !== ids.length) return 'Each product goes in the order once.'
  return null
}

/**
 * Which lines were moved, rather than pushed along by another's move: those
 * outside the longest run that kept its relative order. Moving Dream to the
 * top shifts every other line down one, and only Dream was moved.
 */
export const movedLines = (before: string[], after: string[]): string[] => {
  const was = new Map(before.map((id, i) => [id, i]))
  const kept = after.filter((id) => was.has(id))
  const seq = kept.map((id) => was.get(id)!)
  // Longest increasing run of old positions, remembering how each was reached.
  const tails: number[] = []
  const tailAt: number[] = []
  const prev: number[] = new Array(seq.length).fill(-1)
  seq.forEach((v, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] < v) lo = mid + 1
      else hi = mid
    }
    tails[lo] = v
    tailAt[lo] = i
    prev[i] = lo > 0 ? tailAt[lo - 1] : -1
  })
  const stayed = new Set<string>()
  for (let i = tails.length ? tailAt[tails.length - 1] : -1; i >= 0; i = prev[i]) stayed.add(kept[i])
  return after.filter((id) => was.has(id) && !stayed.has(id))
}
