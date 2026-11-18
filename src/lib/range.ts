/**
 * The range's own order, for any list of products (Revision 10: "in every
 * page, product order shows following this order", the vials after the
 * bottles). The order itself is kept in `data/products.ts`; this reads it.
 *
 * Rankings are not lists of the range: Best sellers, a country's products and
 * the chart bars stay ranked by what sold.
 */
import { productById, sectionOf, skus, type Sku } from '../data/products'

const LAST = Number.MAX_SAFE_INTEGER

/** Where each line sits in the range's order, as it is now. */
export const rangeIndex = (): Map<string, number> => new Map(skus.map((s, i) => [s.id, i]))

/** Rows that name a line, in the range's order. A line the range does not know goes last. */
export const inRangeOrder = <T extends { skuId: string }>(rows: T[]): T[] => {
  const at = rangeIndex()
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (at.get(a.r.skuId) ?? LAST) - (at.get(b.r.skuId) ?? LAST) || a.i - b.i)
    .map((x) => x.r)
}

export interface PickerGroup {
  /** The fragrance's id, or `vials` / `testers`. */
  key: string
  label: string
  skus: Sku[]
}

/**
 * A list of lines as the pickers show it: the bottles, sets and kits grouped
 * by fragrance, in the range's order, then every 3ml vial together, then any
 * testers. `list` is expected in the range's order, as every list the range
 * gives out is.
 */
export const pickerGroups = (list: Sku[]): PickerGroup[] => {
  const groups: PickerGroup[] = []
  const byFragrance = new Map<string, PickerGroup>()
  const vials: Sku[] = []
  const testers: Sku[] = []
  for (const s of list) {
    const section = sectionOf(s)
    if (section === 'vial') vials.push(s)
    else if (section === 'tester') testers.push(s)
    else {
      let g = byFragrance.get(s.productId)
      if (!g) {
        g = { key: s.productId, label: productById(s.productId)?.name ?? s.productId, skus: [] }
        byFragrance.set(s.productId, g)
        groups.push(g)
      }
      g.skus.push(s)
    }
  }
  if (vials.length) groups.push({ key: 'vials', label: '3ml vials', skus: vials })
  if (testers.length) groups.push({ key: 'testers', label: 'Testers', skus: testers })
  return groups
}
