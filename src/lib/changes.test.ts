import { describe, expect, it } from 'vitest'
import {
  describeClosingChanges,
  describeLineChanges,
  describeOrderChanges,
  figuresOf,
  linesDiffer,
} from './changes'
import type { Closing, ClosingFigures, PoLine, SaleLine } from '../data/types'

/**
 * The sentences an edit is read as — by the person making it, by Kelly when
 * she approves it, and in the log. They are the evidence, so each kind of
 * change has to come out, and nothing that did not change may.
 */

const line = (over: Partial<SaleLine> = {}): SaleLine => ({
  id: 'l1',
  saleId: 's1',
  skuId: 'orchid-retail',
  qty: 2,
  priceTier: 'promotion',
  unitPriceMYR: 188,
  countryCode: 'CN',
  at: '2026-09-29T06:32:00.000Z',
  ...over,
})

const figures = (over: Partial<ClosingFigures> = {}): ClosingFigures => ({
  revenueMYR: 376,
  tender: { cash: 376, ewallet: 0, card: 0 },
  lines: [line()],
  stockCount: [
    { skuId: 'orchid-retail', opening: 10, counted: 8 },
    { skuId: 'violet-retail', opening: 6, counted: 6 },
  ],
  ...over,
})

describe('a sale changed', () => {
  it('says nothing when nothing changed', () => {
    expect(describeLineChanges([line()], [line()], 'promotion')).toEqual([])
    expect(linesDiffer([line()], [{ ...line() }], 'promotion')).toBe(false)
  })

  it('names the quantity, the price and the customer', () => {
    const after = line({ qty: 1, priceTier: 'retail', unitPriceMYR: 238, countryCode: 'SG' })
    const said = describeLineChanges([line()], [after], 'promotion')
    expect(said).toContain('Orchid · 30ml: 2 → 1')
    expect(said).toContain('Orchid · 30ml: Promotion RM 188 → Retail RM 238')
    expect(said.find((s) => s.startsWith('Customer'))).toMatch(/China → Singapore/)
  })

  it('names a different item, one taken off, and one added', () => {
    const swapped = describeLineChanges([line()], [line({ skuId: 'violet-retail' })], 'promotion')
    expect(swapped).toContain('Orchid · 30ml changed to Violet · 30ml')

    const off = describeLineChanges([line(), line({ id: 'l2', skuId: 'man-retail', qty: 1 })], [line()], 'promotion')
    expect(off).toEqual(['Took off 1 × Man · 50ml'])

    const on = describeLineChanges([line()], [line(), line({ id: 'l3', skuId: 'violet-retail', qty: 1 })], 'promotion')
    expect(on).toEqual(['Added 1 × Violet · 30ml at Promotion RM 188'])
  })

  it('says the customer once for a sale of several lines', () => {
    const before = [line(), line({ id: 'l2', skuId: 'violet-retail' })]
    const after = before.map((l) => ({ ...l, countryCode: 'JP' }))
    expect(describeLineChanges(before, after, 'promotion').filter((s) => s.startsWith('Customer'))).toHaveLength(1)
  })

  it('shows sen on an "other" price only when there are some', () => {
    const said = describeLineChanges(
      [line()],
      [line({ priceTier: 'other', unitPriceMYR: 150.5 })],
      'promotion',
    )
    expect(said).toContain('Orchid · 30ml: Promotion RM 188 → Other RM 150.50')
  })
})

describe('a closing changed', () => {
  it('says nothing when nothing changed', () => {
    expect(describeClosingChanges(figures(), figures(), 'promotion')).toEqual([])
  })

  it('names the cash, the card and each count that moved', () => {
    const said = describeClosingChanges(
      figures(),
      figures({
        tender: { cash: 200, ewallet: 0, card: 176 },
        stockCount: [
          { skuId: 'orchid-retail', opening: 10, counted: 7 },
          { skuId: 'violet-retail', opening: 6, counted: 6 },
        ],
      }),
      'promotion',
    )
    expect(said).toEqual(['Cash RM 376 → RM 200', 'Card RM 0 → RM 176', 'Orchid · 30ml on the shelf: 8 → 7'])
  })

  it('leads with the new total when the sales change', () => {
    const said = describeClosingChanges(
      figures(),
      figures({ revenueMYR: 188, lines: [line({ qty: 1 })] }),
      'promotion',
    )
    expect(said[0]).toBe('Sales RM 376 → RM 188 (2 → 1 units)')
    expect(said).toContain('Orchid · 30ml: 2 → 1')
  })

  it('ignores a total that differs only below a sen', () => {
    expect(describeClosingChanges(figures(), figures({ revenueMYR: 376.0000001 }), 'promotion')).toEqual([])
  })

  it('gives lines from before the shared server a steady id, so they can be matched', () => {
    const old = { ...figures(), id: 'klia-t2-2026-08-20', lines: [{ skuId: 'orchid-retail', qty: 1 }] } as unknown as Closing
    const a = figuresOf(old)
    const b = figuresOf(old)
    expect(a.lines[0].id).toBe('klia-t2-2026-08-20-line-0')
    expect(describeClosingChanges(a, b, 'promotion')).toEqual([])
  })
})

describe('an order changed', () => {
  const po = (lines: [string, number][], over: { notes?: string; priority?: 'standard' | 'urgent' } = {}) => ({
    lines: lines.map(([skuId, q]): PoLine => ({ skuId, qtyRequested: q, qtyApproved: null, qtyShipped: null })),
    notes: over.notes ?? '',
    priority: over.priority ?? 'standard',
  })

  it('names every line changed, added and taken off, and the urgency and note', () => {
    const said = describeOrderChanges(
      po([['orchid-retail', 12], ['violet-retail', 12]]),
      po([['orchid-retail', 24], ['man-retail', 12]], { priority: 'urgent', notes: 'Weekend tour group' }),
    )
    expect(said).toEqual([
      'Orchid · 30ml: 12 → 24',
      'Took off Violet · 30ml (12)',
      'Added 12 × Man · 50ml',
      'Marked urgent',
      'Note: “Weekend tour group”',
    ])
  })

  it('says nothing when nothing changed', () => {
    expect(describeOrderChanges(po([['orchid-retail', 12]]), po([['orchid-retail', 12]]))).toEqual([])
  })
})
