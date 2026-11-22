/**
 * Adjusting prices from the Stock page (22 November: "Add, remove and adjust
 * price option added top right"): every line sold at a list price on one
 * sheet, its Promotion, Retail and Promotion 2 in boxes. Only the lines whose
 * prices changed are sent, each as a change of its own through `saveProduct`,
 * with its reorder level, case size and FOC kept as they are. A box that is
 * not a price stops the whole sheet and names its line, so nothing is half
 * saved.
 */
import { hasListPrice, type Sku } from '../data/products'
import { moneyInput } from './format'
import type { ProductInput } from '../store/useData'

export interface PriceDraft {
  promotion: string
  retail: string
  /** Empty for none. */
  promotion2: string
}

/** The lines on the sheet: on the range, sold, at a list price. No vials, no testers. */
export const pricedLines = (list: Sku[]): Sku[] => list.filter((s) => !s.removed && s.sellable && hasListPrice(s))

/** A line's prices as its boxes first read. */
export const priceDraft = (s: Sku): PriceDraft => ({
  promotion: moneyInput(s.promotionPriceMYR),
  retail: moneyInput(s.retailPriceMYR),
  promotion2: s.promotion2MYR ? moneyInput(s.promotion2MYR) : '',
})

/** A box read as a price: more than 0, to the sen. */
const price = (v: string): number | null => {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export function priceChanges(
  lines: Sku[],
  drafts: Record<string, PriceDraft>,
): { changes: ProductInput[]; problems: Record<string, string> } {
  const changes: ProductInput[] = []
  const problems: Record<string, string> = {}
  for (const s of lines) {
    const d = drafts[s.id]
    if (!d) continue
    const promotion = price(d.promotion)
    const retail = price(d.retail)
    const promotion2 = d.promotion2.trim() ? price(d.promotion2) : null
    if (promotion === null || retail === null) {
      problems[s.id] = `${s.label}: a promotion and a retail price, each more than 0.`
      continue
    }
    if (d.promotion2.trim() && promotion2 === null) {
      problems[s.id] = `${s.label}: Promotion 2 must be more than 0, or left empty.`
      continue
    }
    const same =
      promotion === s.promotionPriceMYR && retail === s.retailPriceMYR && (promotion2 ?? 0) === (s.promotion2MYR ?? 0)
    if (same) continue
    changes.push({
      skuId: s.id,
      retailPriceMYR: retail,
      promotionPriceMYR: promotion,
      promotion2MYR: promotion2,
      canGoFree: Boolean(s.canGoFree),
      reorderPoint: s.reorderPoint,
      caseSize: s.caseSize,
    })
  }
  return Object.keys(problems).length ? { changes: [], problems } : { changes, problems }
}
