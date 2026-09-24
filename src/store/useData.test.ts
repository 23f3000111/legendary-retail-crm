import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { settle, signInAs, startFixture } from './testing'
import type { LocalBackend } from '../api/local'
import type { Person } from '../data/people'

/**
 * The backend is the last line. A screen can be wrong — it can show a button
 * it should not, or skip a check — so every password rule is enforced there,
 * and these tests go through the store at that layer rather than through a
 * component. The local backend keeps the same rules the shared server does.
 */

const person = (id: string): Person => {
  const p = useData.getState().users.find((u) => u.id === id)
  if (!p) throw new Error(`no user ${id}`)
  return p
}

let lb: LocalBackend

beforeEach(() => {
  lb = startFixture('davy')
})

describe('setting a password', () => {
  it('lets Davy reset anyone, and remembers the old one', async () => {
    const before = lb.passwordOf('siew-fang')
    const result = await useData.getState().setPassword({
      actor: person('davy'),
      targetId: 'siew-fang',
      password: 'kebaya-tanjung-417',
    })

    expect(result.ok).toBe(true)
    expect(lb.passwordOf('siew-fang')).toBe('kebaya-tanjung-417')
    expect(person('siew-fang').passwordChanges).toBe(1)
    expect(person('siew-fang').passwordSetBy).toBe('Lim Davy')

    // The old one is blocked from coming back.
    const again = await useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'siew-fang', password: before! })
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/used before/i)
  })

  it('lets Finance change their own', async () => {
    signInAs(lb, 'siew-fang')
    const result = await useData.getState().setPassword({
      actor: person('siew-fang'),
      targetId: 'siew-fang',
      password: 'kebaya-tanjung-417',
    })
    expect(result.ok).toBe(true)
  })

  it('refuses the one already in use', async () => {
    const current = lb.passwordOf('an')!
    const result = await useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'an', password: current })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already in use/i)
  })

  it('stops a promoter touching anybody else', async () => {
    signInAs(lb, 'teokoknian')
    const before = lb.passwordOf('tanshimin')
    const result = await useData.getState().setPassword({
      actor: person('teokoknian'),
      targetId: 'tanshimin',
      password: 'kebaya-tanjung-417',
    })

    expect(result.ok).toBe(false)
    expect(lb.passwordOf('tanshimin')).toBe(before)
  })

  it('stops a promoter changing their own — they use the one they were given', async () => {
    signInAs(lb, 'teokoknian')
    const before = lb.passwordOf('teokoknian')
    const result = await useData.getState().setPassword({
      actor: person('teokoknian'),
      targetId: 'teokoknian',
      password: 'kebaya-tanjung-417',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ask a senior/i)
    expect(lb.passwordOf('teokoknian')).toBe(before)
  })

  it('lets Davy read a password, and refuses Kelly reading Davy’s', async () => {
    const seen = await useData.getState().revealPassword({ actor: person('davy'), targetId: 'kim' })
    expect(seen.ok).toBe(true)
    expect(seen.password).toBe(lb.passwordOf('kim'))

    signInAs(lb, 'kelly')
    const refused = await useData.getState().revealPassword({ actor: person('kelly'), targetId: 'davy' })
    expect(refused.ok).toBe(false)
    expect(refused.password).toBeUndefined()
  })

  it('stops Kelly and Chloe reaching each other or Davy', async () => {
    for (const [actor, target] of [
      ['kelly', 'chloe'],
      ['chloe', 'kelly'],
      ['kelly', 'davy'],
      ['chloe', 'davy'],
    ]) {
      signInAs(lb, actor)
      const before = lb.passwordOf(target)
      const result = await useData
        .getState()
        .setPassword({ actor: person(actor), targetId: target, password: 'kebaya-tanjung-417' })

      expect(result.ok, `${actor} -> ${target}`).toBe(false)
      expect(lb.passwordOf(target)).toBe(before)
    }
  })

  it('lets Imran reset Davy', async () => {
    signInAs(lb, 'imran')
    const result = await useData
      .getState()
      .setPassword({ actor: person('imran'), targetId: 'davy', password: 'kebaya-tanjung-417' })

    expect(result.ok).toBe(true)
    expect(lb.passwordOf('davy')).toBe('kebaya-tanjung-417')
  })

  it('refuses a weak one, whoever is asking', async () => {
    const result = await useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'kim', password: 'legendary123' })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/too easy/i)
  })

  it('refuses anything too short', async () => {
    for (const bad of ['abc1', 'orchid1', 'kebaya12']) {
      const result = await useData
        .getState()
        .setPassword({ actor: person('davy'), targetId: 'kim', password: bad })
      expect(result.ok, bad).toBe(false)
    }
  })

  it('is the session that decides who is acting, not the screen', async () => {
    // Kelly is signed in; a screen claiming to be Davy changes nothing.
    signInAs(lb, 'kelly')
    const result = await useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'davy', password: 'kebaya-tanjung-417' })
    expect(result.ok).toBe(false)
  })
})

describe('targets', () => {
  it('sets a target where the seed had none, and keeps it on the server', async () => {
    useData.getState().setTarget('bsas', '2026-08', 40_000)
    const found = useData
      .getState()
      .targets.find((t) => t.locationId === 'bsas' && t.month === '2026-08')
    expect(found?.amountMYR).toBe(40_000)

    await settle()
    const stored = lb.allDocs().find((d) => d.kind === 'target' && d.id === 'bsas::2026-08')
    expect((stored?.doc as { amountMYR: number }).amountMYR).toBe(40_000)
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
})

describe('what the server refuses is undone', () => {
  it('rolls back a write the backend rejects', async () => {
    // A promoter at KLIA T2 cannot write a sale for Pavilion.
    signInAs(lb, 'teokoknian', 'klia-t2')
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 1 }],
    })
    // Shown at once…
    expect(useData.getState().liveLines['pavilion-5']?.length).toBe(1)
    await settle()
    await settle()
    // …and gone once the server has said no.
    expect(useData.getState().liveLines['pavilion-5']).toBeUndefined()
    expect(useData.getState().lastError).toMatch(/another store/i)
  })
})

describe('closing a day', () => {
  it('starts from the sales recorded and keeps them when filed again', async () => {
    signInAs(lb, 'teokoknian')
    useData.getState().recordSale({
      locationId: 'klia-t2',
      lines: [{ skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }],
      countryCode: 'CN',
    })
    const lines = useData.getState().liveLines['klia-t2']
    const first = lines.length
    useData.getState().submitClosing({
      id: 'klia-t2-2026-08-21',
      locationId: 'klia-t2',
      channel: 'main',
      period: '2026-08-21',
      periodType: 'day',
      revenueMYR: 188,
      tender: { cash: 188, ewallet: 0, card: 0 },
      lines,
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount: [],
      writeOffs: [],
      submittedBy: 'Teo Kok Nian',
      submittedAt: new Date().toISOString(),
    })
    // Filing does not swallow the day's lines: a re-file sees the same ones.
    expect(useData.getState().liveLines['klia-t2']).toHaveLength(first)
    const filed = useData.getState().closings.find((c) => c.id === 'klia-t2-2026-08-21')
    expect(filed?.submittedBy).toBe('Teo Kok Nian')
    expect(filed?.lines).toHaveLength(first)
  })
})
