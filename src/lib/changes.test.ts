import { describe, expect, it } from 'vitest'
import {
  describeClosingChanges,
  describeLineChanges,
  describeOrderChanges,
  figuresOf,
  linesDiffer,
  tenderFor,
  withSale,
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

  it('names a three of vials once, the way it was counted (Revision 10)', () => {
    const vials = (love: number, hope: number, confidence: number) => [
      { skuId: 'love-vial', opening: 80, counted: love },
      { skuId: 'hope-vial', opening: 60, counted: hope },
      { skuId: 'confidence-vial', opening: 50, counted: confidence },
    ]
    const said = describeClosingChanges(
      figures({ stockCount: vials(77, 54, 45) }),
      figures({ stockCount: vials(76, 53, 45) }),
      'promotion',
    )
    expect(said).toEqual(['Spirit 1 · 3ml Vials on the shelf: 176 → 174'])
    // A count kept the same is no change, however it was shared out.
    expect(
      describeClosingChanges(figures({ stockCount: vials(77, 54, 45) }), figures({ stockCount: vials(78, 53, 45) }), 'promotion'),
    ).toEqual([])
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

  it('says so when only the order of the lines changed — they can be dragged (20 October)', () => {
    const before = po([['orchid-retail', 12], ['violet-retail', 12], ['man-retail', 12]])
    expect(describeOrderChanges(before, po([['man-retail', 12], ['orchid-retail', 12], ['violet-retail', 12]]))).toEqual([
      'Changed the order of the items',
    ])
    // Taking one off is not a change of order as well.
    expect(describeOrderChanges(before, po([['orchid-retail', 12], ['man-retail', 12]]))).toEqual([
      'Took off Violet · 30ml (12)',
    ])
  })
})

// The client's Revision #10, 26 November: "If promoter changes any sales, it
// won't reflect in the final closing of the day." Once today is closed, a sale
// rung up, changed or taken back changes the closing with it.
describe('a closing, once a sale changes after it was filed', () => {
  it('swaps the sale’s lines as they were for the lines as they are, and the total follows', () => {
    const other = line({ id: 'l2', saleId: 's2', skuId: 'man-retail', qty: 1 })
    const filed = figures({ lines: [line(), other], revenueMYR: 564, tender: { cash: 300, ewallet: 0, card: 264 } })
    const after = withSale(filed, [line()], [line({ qty: 1 })], 'promotion')
    expect(after.lines).toEqual([line({ qty: 1 }), other])
    expect(after.revenueMYR).toBe(376)
    // The cash as typed; the card is the rest of the day's sales.
    expect(after.tender).toEqual({ cash: 300, ewallet: 0, card: 76 })
    // The counts are as they were counted.
    expect(after.stockCount).toBe(filed.stockCount)
  })

  it('adds a sale rung up after the closing, and takes off one taken back', () => {
    const late = line({ id: 'l9', saleId: 's9', skuId: 'violet-retail', qty: 1 })
    const added = withSale(figures(), [], [late], 'promotion')
    expect(added.lines.map((l) => l.id)).toEqual(['l1', 'l9'])
    expect(added.revenueMYR).toBe(564)
    expect(added.tender).toEqual({ cash: 376, ewallet: 0, card: 188 })

    const takenBack = withSale(added, [late], [], 'promotion')
    expect(takenBack.lines.map((l) => l.id)).toEqual(['l1'])
    expect(takenBack.revenueMYR).toBe(376)
    expect(takenBack.tender).toEqual({ cash: 376, ewallet: 0, card: 0 })
  })

  it('keeps every other line it carries, even one no sale record stands behind', () => {
    const old = { ...line({ saleId: undefined }), id: undefined }
    const filed = figures({ lines: [old], revenueMYR: 376 })
    const late = line({ id: 'l9', saleId: 's9', qty: 1 })
    expect(withSale(filed, [], [late], 'promotion').lines).toEqual([old, late])
  })

  it('brings the cash down to the sales when they now come to less than it', () => {
    const filed = figures({ revenueMYR: 376, tender: { cash: 376, ewallet: 0, card: 0 } })
    const after = withSale(filed, [line()], [line({ qty: 1 })], 'promotion')
    expect(after.tender).toEqual({ cash: 188, ewallet: 0, card: 0 })
  })
})

describe('how a day was paid, once its sales come to a new total', () => {
  it('keeps the cash and e-wallet as typed, the card the rest', () => {
    expect(tenderFor({ cash: 100, ewallet: 50, card: 238 }, 500)).toEqual({ cash: 100, ewallet: 50, card: 350 })
  })

  it('never says more was taken than was sold, nor a card below nothing', () => {
    expect(tenderFor({ cash: 400, ewallet: 50, card: 0 }, 300)).toEqual({ cash: 250, ewallet: 50, card: 0 })
    expect(tenderFor({ cash: 400, ewallet: 50, card: 0 }, 20)).toEqual({ cash: 0, ewallet: 20, card: 0 })
    expect(tenderFor(undefined, 188)).toEqual({ cash: 0, ewallet: 0, card: 188 })
  })

  it('works to the sen', () => {
    expect(tenderFor({ cash: 10.1, ewallet: 0, card: 0 }, 30.3)).toEqual({ cash: 10.1, ewallet: 0, card: 20.2 })
  })
})
