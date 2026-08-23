import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import type { Person } from '../data/people'

/**
 * The store is the last line. A screen can be wrong — it can show a button it
 * should not, or skip a check — so every PIN rule is enforced here too, and
 * these tests go straight at that layer rather than through a component.
 */

const person = (id: string): Person => {
  const p = useData.getState().users.find((u) => u.id === id)
  if (!p) throw new Error(`no user ${id}`)
  return p
}

const pinOf = (id: string) => person(id).pin

beforeEach(() => {
  useData.getState().resetDemo()
})

describe('changing a PIN', () => {
  it('lets Davy change anyone’s, and remembers the old one', () => {
    const before = pinOf('siew-fang')
    const result = useData.getState().changePin({
      actor: person('davy'),
      targetId: 'siew-fang',
      pin: '704318',
    })

    expect(result.ok).toBe(true)
    expect(pinOf('siew-fang')).toBe('704318')
    expect(person('siew-fang').pinHistory).toContain(before)
    expect(person('siew-fang').pinSetBy).toBe('Lim Davy')
  })

  it('never gives a person a PIN back', () => {
    const original = pinOf('an')
    useData.getState().changePin({ actor: person('davy'), targetId: 'an', pin: '704318' })

    const again = useData
      .getState()
      .changePin({ actor: person('davy'), targetId: 'an', pin: original })

    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/used that PIN before/i)
    expect(pinOf('an')).toBe('704318')
  })

  it('refuses a PIN another login already holds', () => {
    const kellys = pinOf('kelly')
    const result = useData
      .getState()
      .changePin({ actor: person('davy'), targetId: 'ivvi', pin: kellys })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already uses/i)
  })

  it('keeps every PIN unique after a run of changes', () => {
    const changes = ['704318', '815427', '260973', '539164']
    const targets = ['siew-fang', 'ivvi', 'an', 'loong']
    targets.forEach((id, i) => {
      const r = useData.getState().changePin({ actor: person('davy'), targetId: id, pin: changes[i] })
      expect(r.ok, id).toBe(true)
    })

    const pins = useData.getState().users.map((u) => u.pin)
    expect(new Set(pins).size).toBe(pins.length)
  })

  it('stops a promoter changing their own PIN', () => {
    const target = person('promoter-pavilion')
    const result = useData
      .getState()
      .changePin({ actor: target, targetId: target.id, pin: '704318' })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ask a senior/i)
    expect(pinOf('promoter-pavilion')).toBe(target.pin)
  })

  it('stops Kelly and Chloe reaching each other or Davy', () => {
    for (const [actor, target] of [
      ['kelly', 'chloe'],
      ['chloe', 'kelly'],
      ['kelly', 'davy'],
      ['chloe', 'davy'],
    ]) {
      const before = pinOf(target)
      const result = useData
        .getState()
        .changePin({ actor: person(actor), targetId: target, pin: '704318' })

      expect(result.ok, `${actor} → ${target}`).toBe(false)
      expect(pinOf(target)).toBe(before)
    }
  })

  it('lets Imran change Davy’s PIN', () => {
    const result = useData
      .getState()
      .changePin({ actor: person('imran'), targetId: 'davy', pin: '704318' })

    expect(result.ok).toBe(true)
    expect(pinOf('davy')).toBe('704318')
  })

  it('refuses an obvious PIN, whoever is asking', () => {
    const result = useData
      .getState()
      .changePin({ actor: person('davy'), targetId: 'kim', pin: '123456' })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/too easy/i)
  })

  it('refuses anything that is not six digits', () => {
    for (const bad of ['1234', '1234567', '12a456']) {
      const result = useData
        .getState()
        .changePin({ actor: person('davy'), targetId: 'kim', pin: bad })
      expect(result.ok, bad).toBe(false)
    }
  })
})

describe('targets', () => {
  it('sets a target where the seed had none, and keeps it', () => {
    useData.getState().setTarget('web-shp', '2026-08', 40_000)
    const found = useData
      .getState()
      .targets.find((t) => t.locationId === 'web-shp' && t.month === '2026-08')

    expect(found?.amountMYR).toBe(40_000)
    expect(useData.getState().overlay.changedTargets).toContainEqual({
      locationId: 'web-shp',
      month: '2026-08',
      amountMYR: 40_000,
    })
  })

  it('replaces rather than duplicates when set twice', () => {
    useData.getState().setTarget('pavilion-5', '2026-08', 120_000)
    useData.getState().setTarget('pavilion-5', '2026-08', 125_000)

    const rows = useData
      .getState()
      .targets.filter((t) => t.locationId === 'pavilion-5' && t.month === '2026-08')

    expect(rows).toHaveLength(1)
    expect(rows[0].amountMYR).toBe(125_000)
  })
})

describe('promotions', () => {
  const draft = {
    id: 'promo-test',
    name: 'Test campaign',
    mechanic: 'discount' as const,
    detail: '10% off',
    from: '2026-09-01',
    to: '2026-09-07',
    skuIds: [],
    locationIds: ['pavilion-5'],
    plannedBy: 'Lim Davy',
    recordedBy: 'Chloe Chock',
    recordedAt: '2026-08-23T09:00:00+08:00',
    informedIt: false,
  }

  it('records one and can mark Imran told', () => {
    useData.getState().addPromotion(draft)
    expect(useData.getState().promotions.find((p) => p.id === 'promo-test')?.informedIt).toBe(false)

    useData.getState().updatePromotion('promo-test', { informedIt: true })
    expect(useData.getState().promotions.find((p) => p.id === 'promo-test')?.informedIt).toBe(true)
  })

  it('keeps an edit to a seeded promotion in the overlay, not in the new list', () => {
    const seeded = useData.getState().promotions.find((p) => !p.informedIt)!
    useData.getState().updatePromotion(seeded.id, { informedIt: true })

    expect(useData.getState().overlay.promotionPatches[seeded.id]).toEqual({ informedIt: true })
    expect(useData.getState().overlay.newPromotions).toHaveLength(0)
  })
})
