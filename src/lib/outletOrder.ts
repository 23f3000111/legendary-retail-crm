/**
 * A person's own order for the outlets (20 November: "there should be a drag
 * option for all the outlets, Consignment, Dealers, stores ... everywhere ...
 * so client can drag the things and placed as per their choice").
 *
 * Each kind is arranged on its own: the main stores, the consignment
 * partners, the dealers. A list in "My order" puts the main stores first, then
 * consignment, then the dealers (22 November). Within each, what the person arranged comes
 * first, in their order, and anything they have not placed — a store that
 * opened since, say — after it in the usual order. An outlet in an
 * arrangement that is no longer there is simply passed over.
 */
import { CHANNELS, locationById, locations, type Channel } from '../data/locations'

export type OutletOrder = Partial<Record<Channel, string[]>>

const usual = new Map(locations.map((l, i) => [l.id, i]))

/** `rows` in the person's order; `idOf` names each row's outlet. */
export const inOutletOrder = <T>(rows: T[], idOf: (row: T) => string, order: OutletOrder): T[] => {
  const placed = new Map<Channel, Map<string, number>>(
    CHANNELS.map((c) => [c, new Map((order[c] ?? []).map((id, i) => [id, i]))]),
  )
  const key = (id: string): [number, number] => {
    const l = locationById(id)
    if (!l) return [CHANNELS.length, Number.MAX_SAFE_INTEGER]
    const mine = placed.get(l.channel)!
    const at = mine.get(id)
    return [CHANNELS.indexOf(l.channel), at !== undefined ? at : mine.size + (usual.get(id) ?? 0)]
  }
  return rows
    .map((row) => ({ row, k: key(idOf(row)) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1])
    .map((x) => x.row)
}
