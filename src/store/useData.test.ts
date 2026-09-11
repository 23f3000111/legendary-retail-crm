import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import type { Person } from '../data/people'

/**
 * The store is the last line. A screen can be wrong — it can show a button it
 * should not, or skip a check — so every password rule is enforced here too, and
 * these tests go straight at that layer rather than through a component.
 */

const person = (id: string): Person => {
  const p = useData.getState().users.find((u) => u.id === id)
  if (!p) throw new Error(`no user ${id}`)
  return p
}

beforeEach(() => {
  useData.getState().resetDemo()
})

describe('setting a password', () => {
  it('lets Davy reset anyone, and remembers the old one', () => {
    const before = person('siew-fang').password
    const result = useData.getState().setPassword({
      actor: person('davy'),
      targetId: 'siew-fang',
      password: 'kebaya-tanjung-417',
    })

    expect(result.ok).toBe(true)
    expect(person('siew-fang').password).toBe('kebaya-tanjung-417')
    expect(person('siew-fang').passwordHistory).toContain(before)
    expect(person('siew-fang').passwordSetBy).toBe('Lim Davy')
  })

  it('lets Finance change their own', () => {
    const result = useData.getState().setPassword({
      actor: person('siew-fang'),
      targetId: 'siew-fang',
      password: 'kebaya-tanjung-417',
    })
    expect(result.ok).toBe(true)
  })

  it('never gives a person one back', () => {
    const original = person('an').password
    useData.getState().setPassword({
      actor: person('davy'),
      targetId: 'an',
      password: 'kebaya-tanjung-417',
    })

    const again = useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'an', password: original })

    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/used before/i)
    expect(person('an').password).toBe('kebaya-tanjung-417')
  })

  it('stops a promoter touching anybody else', () => {
    const target = person('tanshimin')
    const result = useData.getState().setPassword({
      actor: person('teokoknian'),
      targetId: target.id,
      password: 'kebaya-tanjung-417',
    })

    expect(result.ok).toBe(false)
    expect(person('tanshimin').password).toBe(target.password)
  })

  it('stops a promoter changing their own — they use the one they were given', () => {
    const before = person('teokoknian').password
    const result = useData.getState().setPassword({
      actor: person('teokoknian'),
      targetId: 'teokoknian',
      password: 'kebaya-tanjung-417',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ask a senior/i)
    expect(person('teokoknian').password).toBe(before)
  })

  it('lets Davy read a password, and refuses Kelly reading Davy’s', () => {
    const seen = useData.getState().revealPassword({ actor: person('davy'), targetId: 'kim' })
    expect(seen.ok).toBe(true)
    expect(seen.password).toBe(person('kim').password)

    const refused = useData.getState().revealPassword({ actor: person('kelly'), targetId: 'davy' })
    expect(refused.ok).toBe(false)
    expect(refused.password).toBeUndefined()
  })

  it('stops Kelly and Chloe reaching each other or Davy', () => {
    for (const [actor, target] of [
      ['kelly', 'chloe'],
      ['chloe', 'kelly'],
      ['kelly', 'davy'],
      ['chloe', 'davy'],
    ]) {
      const before = person(target).password
      const result = useData
        .getState()
        .setPassword({ actor: person(actor), targetId: target, password: 'kebaya-tanjung-417' })

      expect(result.ok, `${actor} -> ${target}`).toBe(false)
      expect(person(target).password).toBe(before)
    }
  })

  it('lets Imran reset Davy', () => {
    const result = useData
      .getState()
      .setPassword({ actor: person('imran'), targetId: 'davy', password: 'kebaya-tanjung-417' })

    expect(result.ok).toBe(true)
    expect(person('davy').password).toBe('kebaya-tanjung-417')
  })

  it('refuses a weak one, whoever is asking', () => {
    const result = useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'kim', password: 'legendary123' })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/too easy/i)
  })

  it('refuses anything too short', () => {
    for (const bad of ['abc1', 'orchid1', 'kebaya12']) {
      const result = useData
        .getState()
        .setPassword({ actor: person('davy'), targetId: 'kim', password: bad })
      expect(result.ok, bad).toBe(false)
    }
  })
})

describe('targets', () => {
  it('sets a target where the seed had none, and keeps it', () => {
    useData.getState().setTarget('bsas', '2026-08', 40_000)
    const found = useData
      .getState()
      .targets.find((t) => t.locationId === 'bsas' && t.month === '2026-08')

    expect(found?.amountMYR).toBe(40_000)
    expect(useData.getState().overlay.changedTargets).toContainEqual({
      locationId: 'bsas',
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
