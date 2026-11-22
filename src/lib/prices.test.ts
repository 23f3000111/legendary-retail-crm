import { describe, expect, it } from 'vitest'
import { priceChanges, priceDraft, pricedLines } from './prices'
import { skus, type Sku } from '../data/products'

/**
 * 22 November, on the Stock page: "Add, remove and adjust price option added
 * top right". Adjust prices puts every line sold at a list price on one sheet;
 * only the lines whose prices changed are saved, each as itself.
 */
const line = (id: string): Sku => {
  const s = skus.find((x) => x.id === id)
  if (!s) throw new Error(`no ${id}`)
  return s
}
const orchid = line('orchid-retail')

describe('adjusting prices', () => {
  it('puts only lines sold at a list price on the sheet: no vials, no testers', () => {
    const sheet = pricedLines(skus)
    expect(sheet.length).toBeGreaterThan(10)
    expect(sheet.every((s) => s.sellable && s.variant !== 'vial' && s.variant !== 'tester' && !s.removed)).toBe(true)
  })

  it('sends only the lines whose prices changed, keeping their reorder level, case size and FOC', () => {
    const drafts = Object.fromEntries(pricedLines(skus).map((s) => [s.id, priceDraft(s)]))
    drafts[orchid.id] = { ...drafts[orchid.id], promotion: '199' }
    const { changes, problems } = priceChanges(pricedLines(skus), drafts)
    expect(problems).toEqual({})
    expect(changes).toEqual([
      {
        skuId: orchid.id,
        retailPriceMYR: orchid.retailPriceMYR,
        promotionPriceMYR: 199,
        promotion2MYR: orchid.promotion2MYR ?? null,
        canGoFree: Boolean(orchid.canGoFree),
        reorderPoint: orchid.reorderPoint,
        caseSize: orchid.caseSize,
      },
    ])
  })

  it('clears Promotion 2 when its box is emptied', () => {
    const drafts = { [orchid.id]: { ...priceDraft(orchid), promotion2: '' } }
    const { changes } = priceChanges([orchid], drafts)
    expect(orchid.promotion2MYR).toBeGreaterThan(0)
    expect(changes[0]).toMatchObject({ skuId: orchid.id, promotion2MYR: null })
  })

  it('names each line with a price that is not more than 0, and sends nothing', () => {
    const violet = line('violet-retail')
    const drafts = {
      [orchid.id]: { ...priceDraft(orchid), promotion: '199' },
      [violet.id]: { ...priceDraft(violet), retail: '0' },
    }
    const { changes, problems } = priceChanges([orchid, violet], drafts)
    expect(changes).toEqual([])
    expect(Object.keys(problems)).toEqual([violet.id])
    expect(problems[violet.id]).toMatch(/more than 0/)
  })

  it('says nothing changed when nothing did', () => {
    const drafts = Object.fromEntries(pricedLines(skus).map((s) => [s.id, priceDraft(s)]))
    expect(priceChanges(pricedLines(skus), drafts)).toEqual({ changes: [], problems: {} })
  })
})
