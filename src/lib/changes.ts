/**
 * What changed, in words.
 *
 * An edit is read as a list of plain sentences in three places: by the person
 * making it, before they save; by Kelly, when a store asks her to approve one;
 * and in the activity log, for good. One set of functions writes all three, so
 * they can never disagree about what happened.
 */
import { countryName, MALAYSIA_SEGMENT_LABEL } from '../data/countries'
import { lineUnitPrice, skuLabel, TIER_LABEL, type PriceBasis } from '../data/products'
import { num, rm } from './format'
import type { Closing, ClosingFigures, PurchaseOrder, SaleLine } from '../data/types'

/** Whole ringgit, unless there are sen to show. */
export const money = (n: number): string => rm(n, { decimals: Math.round(n * 100) % 100 !== 0 })

/** Money is compared to the sen, so adding the same lines in another order is no change. */
const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005

/** A sum of money, rounded to the sen. */
export const toSen = (n: number): number => Math.round(n * 100) / 100

/**
 * The changeable part of a closing. Lines from before the shared server carry
 * no id; each is given one from its place in the closing, the same every
 * time, so an edit can tell a changed line from a removed one.
 */
export const figuresOf = (c: Closing): ClosingFigures => ({
  revenueMYR: c.revenueMYR,
  tender: c.tender,
  lines: c.lines.map((l, i) => (l.id ? l : { ...l, id: `${c.id}-line-${i}` })),
  stockCount: c.stockCount,
})

/** "Promotion RM 188" — the price a line went for, as a person would say it. */
const priceWords = (l: SaleLine, basis: PriceBasis): string =>
  `${TIER_LABEL[l.priceTier ?? basis]} ${money(lineUnitPrice(l, basis))}`

const customerWords = (l: Pick<SaleLine, 'countryCode' | 'segment'>): string =>
  !l.countryCode
    ? 'not recorded'
    : `${countryName(l.countryCode)}${l.segment ? ` (${MALAYSIA_SEGMENT_LABEL[l.segment]})` : ''}`

/** "14:32", in the device's own clock. */
export const clock = (iso?: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The same line before and after is matched by its id, where it has one. */
const byLine = (lines: SaleLine[]): Map<string, SaleLine> =>
  new Map(lines.map((l, i) => [l.id ?? `#${i}`, l]))

/** One entry per customer: the country is asked once per sale, so it is said once per sale. */
const byCustomer = (lines: SaleLine[]): Map<string, SaleLine> => {
  const out = new Map<string, SaleLine>()
  lines.forEach((l, i) => {
    const key = l.saleId ?? l.id ?? `#${i}`
    if (!out.has(key)) out.set(key, l)
  })
  return out
}

/** What changed between two sets of sale lines. */
export function describeLineChanges(before: SaleLine[], after: SaleLine[], basis: PriceBasis): string[] {
  const out: string[] = []
  const was = byLine(before)
  const now = byLine(after)

  for (const [key, a] of was) {
    const b = now.get(key)
    if (!b) {
      out.push(`Took off ${a.qty} × ${skuLabel(a.skuId)}`)
      continue
    }
    if (b.skuId !== a.skuId) out.push(`${skuLabel(a.skuId)} changed to ${skuLabel(b.skuId)}`)
    const label = skuLabel(b.skuId)
    if (b.qty !== a.qty) out.push(`${label}: ${a.qty} → ${b.qty}`)
    if (
      !sameMoney(lineUnitPrice(a, basis), lineUnitPrice(b, basis)) ||
      (a.priceTier ?? basis) !== (b.priceTier ?? basis)
    ) {
      out.push(`${label}: ${priceWords(a, basis)} → ${priceWords(b, basis)}`)
    }
  }
  for (const [key, b] of now) {
    if (!was.has(key)) out.push(`Added ${b.qty} × ${skuLabel(b.skuId)} at ${priceWords(b, basis)}`)
  }

  const customersNow = byCustomer(after)
  for (const [key, a] of byCustomer(before)) {
    const b = customersNow.get(key)
    if (!b) continue
    if ((a.countryCode ?? '') !== (b.countryCode ?? '') || (a.segment ?? '') !== (b.segment ?? '')) {
      const when = clock(a.at)
      out.push(`Customer${when ? ` at ${when}` : ''}: ${customerWords(a)} → ${customerWords(b)}`)
    }
  }
  return out
}

/** True when two sets of sale lines say different things. */
export const linesDiffer = (a: SaleLine[], b: SaleLine[], basis: PriceBasis): boolean =>
  describeLineChanges(a, b, basis).length > 0

/** What changed between two versions of a closing — the sales, the money, the shelf. */
export function describeClosingChanges(
  before: ClosingFigures,
  after: ClosingFigures,
  basis: PriceBasis,
): string[] {
  const out: string[] = []
  const units = (f: ClosingFigures) => f.lines.reduce((a, l) => a + l.qty, 0)
  const unitsBefore = units(before)
  const unitsAfter = units(after)

  if (!sameMoney(before.revenueMYR, after.revenueMYR) || unitsBefore !== unitsAfter) {
    out.push(
      `Sales ${money(before.revenueMYR)} → ${money(after.revenueMYR)}` +
        (unitsBefore !== unitsAfter ? ` (${num(unitsBefore)} → ${num(unitsAfter)} units)` : ''),
    )
  }
  out.push(...describeLineChanges(before.lines, after.lines, basis))

  const tenders: [keyof NonNullable<ClosingFigures['tender']>, string][] = [
    ['cash', 'Cash'],
    ['card', 'Card'],
    ['ewallet', 'E-wallet'],
  ]
  for (const [key, label] of tenders) {
    const a = before.tender?.[key] ?? 0
    const b = after.tender?.[key] ?? 0
    if (!sameMoney(a, b)) out.push(`${label} ${money(a)} → ${money(b)}`)
  }

  const counted = (f: ClosingFigures) => new Map(f.stockCount.map((s) => [s.skuId, s.counted]))
  const was = counted(before)
  const now = counted(after)
  for (const skuId of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(skuId)
    const b = now.get(skuId)
    if (a === b) continue
    const say = (n: number | undefined) => (n === undefined ? 'not counted' : num(n))
    out.push(`${skuLabel(skuId)} on the shelf: ${say(a)} → ${say(b)}`)
  }
  return out
}

type OrderShape = Pick<PurchaseOrder, 'lines' | 'notes' | 'priority'>

/** What changed on an order while it waited for Kelly. */
export function describeOrderChanges(before: OrderShape, after: OrderShape): string[] {
  const out: string[] = []
  const asked = (o: OrderShape) => new Map(o.lines.map((l) => [l.skuId, l.qtyRequested]))
  const was = asked(before)
  const now = asked(after)
  for (const [skuId, q] of was) {
    const n = now.get(skuId)
    if (n === undefined) out.push(`Took off ${skuLabel(skuId)} (${num(q)})`)
    else if (n !== q) out.push(`${skuLabel(skuId)}: ${num(q)} → ${num(n)}`)
  }
  for (const [skuId, n] of now) {
    if (!was.has(skuId)) out.push(`Added ${num(n)} × ${skuLabel(skuId)}`)
  }
  if (before.priority !== after.priority) {
    out.push(after.priority === 'urgent' ? 'Marked urgent' : 'No longer urgent')
  }
  const noteBefore = (before.notes ?? '').trim()
  const noteAfter = (after.notes ?? '').trim()
  if (noteBefore !== noteAfter) out.push(noteAfter ? `Note: “${noteAfter}”` : 'Note taken off')
  return out
}
