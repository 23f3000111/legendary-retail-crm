/**
 * The nightly count, as the closing asks for it (Revision 10): one box for
 * each line on the shelf, except the 3ml vials of Spirit 1, Spirit 2 and
 * 3 Wishes, which are counted three at a time. Every vial still gets a count
 * of its own, so sales, orders and every stock screen carry on per vial.
 */
import { groupOf, type CountGroup } from '../data/products'
import type { StockRow } from '../store/selectors'

/** One box on the closing's shelf: a line, or a three counted together. */
export interface ShelfRow {
  /** The line's id, or `group:<id>` for a three. */
  key: string
  group?: CountGroup
  /** The lines the box counts, in the range's order. */
  skus: StockRow[]
}

export const groupKey = (g: CountGroup) => `group:${g.id}`

/**
 * The shelf in the range's order, a three where its first vial sits. A three
 * with only one vial left on the range is just that vial.
 */
export function shelfRows(stock: StockRow[]): ShelfRow[] {
  const rows: ShelfRow[] = []
  const groups = new Map<string, ShelfRow>()
  for (const s of stock) {
    const g = groupOf(s.skuId)
    if (!g) {
      rows.push({ key: s.skuId, skus: [s] })
      continue
    }
    const row = groups.get(g.id)
    if (row) row.skus.push(s)
    else {
      const fresh: ShelfRow = { key: groupKey(g), group: g, skus: [s] }
      groups.set(g.id, fresh)
      rows.push(fresh)
    }
  }
  return rows.map((r) => (r.group && r.skus.length === 1 ? { key: r.skus[0].skuId, skus: r.skus } : r))
}

/**
 * What each line on the shelf should hold at the close: the last count, plus
 * what the store has confirmed receiving since (20 November: "after promoter
 * receive stock for PO, the received quantity automatically adds into the
 * closing quantity"), less what the day sold. Never below 0.
 */
export function shelfExpected(
  stock: Pick<StockRow, 'skuId' | 'onHand'>[],
  sold: Map<string, number>,
  arrived: Map<string, number>,
): Map<string, number> {
  return new Map(
    stock.map((s) => [s.skuId, Math.max(0, s.onHand + (arrived.get(s.skuId) ?? 0) - (sold.get(s.skuId) ?? 0))]),
  )
}

/**
 * Whether what a line should hold is known: this store has counted it, or has
 * confirmed receiving it since. Nothing else can say what is on the shelf.
 */
export const isKnown = (s: Pick<StockRow, 'skuId' | 'counted'>, arrived: Map<string, number>): boolean =>
  s.counted || (arrived.get(s.skuId) ?? 0) > 0

/**
 * What each box starts at, on a day being closed for the first time: what the
 * shelf should hold, where that is known. A store that has never counted, or a
 * product new to it, starts at what it confirmed receiving, less what sold
 * (25 November: "the received quantity automatically adds into the closing
 * quantity"); with nothing received either, the box starts empty and is typed.
 * A three's box waits until every vial of it is known.
 */
export const startingBoxes = (
  rows: ShelfRow[],
  expected: Map<string, number>,
  arrived: Map<string, number>,
): Record<string, string> =>
  Object.fromEntries(
    rows.map((row) => [
      row.key,
      row.skus.every((s) => isKnown(s, arrived))
        ? String(row.skus.reduce((a, s) => a + (expected.get(s.skuId) ?? 0), 0))
        : '',
    ]),
  )

/**
 * One count shared across several lines, in proportion to `weights`: when it
 * matches their total each gets exactly its weight, and a difference is
 * spread by share, the largest remainders first. With nothing to go by — a
 * first count — it is shared evenly, the odd ones to the first. Never below
 * 0, and always adding up to the count.
 */
export function splitCount(total: number, weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  const count = Math.max(0, Math.floor(total))
  const w = weights.map((x) => Math.max(0, x))
  const sum = w.reduce((a, x) => a + x, 0)
  if (sum === 0) {
    const base = Math.floor(count / n)
    return w.map((_, i) => base + (i < count - base * n ? 1 : 0))
  }
  const quotas = w.map((x) => (count * x) / sum)
  const out = quotas.map(Math.floor)
  let left = count - out.reduce((a, x) => a + x, 0)
  const order = quotas
    .map((q, i) => ({ i, frac: q - Math.floor(q) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    out[i] += 1
    left -= 1
  }
  return out
}

/**
 * What the boxes say, line by line. A box left empty gives nothing. A three's
 * box is shared across its vials: by what each should hold (`weightOf`) on a
 * first filing; on a change to a filed day by what was `filed` for each,
 * keeping those figures as they were when the three's total is unchanged.
 */
export function countsFromBoxes(
  rows: ShelfRow[],
  boxes: Record<string, string>,
  weightOf: (skuId: string) => number,
  filed?: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rows) {
    const value = boxes[row.key]
    if (value === undefined || value === '') continue
    const total = Number(value) || 0
    if (!row.group) {
      out.set(row.skus[0].skuId, total)
      continue
    }
    const ids = row.skus.map((s) => s.skuId)
    const wasAll = Boolean(filed) && ids.every((id) => filed!.has(id))
    if (wasAll && ids.reduce((a, id) => a + filed!.get(id)!, 0) === total) {
      for (const id of ids) out.set(id, filed!.get(id)!)
      continue
    }
    const split = splitCount(
      total,
      ids.map((id) => filed?.get(id) ?? weightOf(id)),
    )
    ids.forEach((id, i) => out.set(id, split[i]))
  }
  return out
}
