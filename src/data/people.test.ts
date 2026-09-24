import { describe, expect, it } from 'vitest'
import {
  can,
  canChangeOwnPassword,
  canResetPasswordOf,
  canSeePasswordOf,
  canSeeUser,
  needsTwoStep,
  TWO_STEP_ROLES,
  checkPassword,
  maskEmail,
  passwordStrength,
  personByUsername,
  seedPeople,
  suggestPassword,
  suggestUsername,
  PASSWORD_MIN,
  storeChoicesFor,
  picksStore,
  storeForSession,
  startingPassword,
  type Person,
  type Role,
} from './people'
import { locationById } from './locations'

const byId = (id: string): Person => {
  const p = seedPeople.find((u) => u.id === id)
  if (!p) throw new Error(`no seeded person ${id}`)
  return p
}

const davy = byId('davy')
const vins = byId('vins')
const kelly = byId('kelly')
const chloe = byId('chloe')
const imran = byId('imran')
const siewFang = byId('siew-fang')
const ivvi = byId('ivvi')
const an = byId('an')
const loong = byId('loong')
const promoter = byId('teokoknian')

// ── The hierarchy chart ─────────────────────────────────────────────────────

describe('the company hierarchy', () => {
  it('lets the Director see everything and change nothing', () => {
    const c = can('director')
    expect(c.viewAll).toBe(true)
    expect(c.canEdit).toBe(false)
    expect(c.approvePurchaseOrders).toBe(false)
    expect(c.manageUsers).toBe(false)
  })

  it('gives approval to the Managing Director and the Operational Manager only', () => {
    const approvers = (['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'] as Role[])
      .filter((r) => can(r).approvePurchaseOrders)
    expect(approvers).toEqual(['md', 'ops'])
  })

  it('lets the PA and Finance edit all data without approving', () => {
    for (const role of ['pa', 'finance'] as Role[]) {
      expect(can(role).viewAll, role).toBe(true)
      expect(can(role).canEdit, role).toBe(true)
      expect(can(role).approvePurchaseOrders, role).toBe(false)
    }
  })

  it('confines the Warehouse to stock', () => {
    expect(can('warehouse').stockOnly).toBe(true)
  })

  it('confines a Store Promoter to the town they work in', () => {
    expect(can('promoter').viewAll).toBe(false)
    // Not one store: staff rotate, so they belong to a town and say which
    // outlet they are at when they sign in.
    expect(promoter.city).toBeTruthy()
    expect(promoter.locationId).toBeUndefined()
    expect(storeChoicesFor(promoter).length).toBeGreaterThan(0)
  })

  it('lets only Davy, Kelly, Chloe and Imran create staff', () => {
    const creators = seedPeople.filter((p) => can(p.role).manageUsers).map((p) => p.id).sort()
    expect(creators).toEqual(['chloe', 'davy', 'imran', 'kelly'])
  })
})

// ── The people on the revised username list ─────────────────────────────────

describe('the revised staff list', () => {
  it('carries 12 at head office and 27 in the stores', () => {
    expect(seedPeople.filter((p) => p.role !== 'promoter')).toHaveLength(12)
    expect(seedPeople.filter((p) => p.role === 'promoter')).toHaveLength(27)
  })

  it('has three in Finance, not four — Apple is off the revised list', () => {
    const finance = seedPeople.filter((p) => p.role === 'finance').map((p) => p.username)
    expect(finance).toEqual(['siewfang', 'ivvichin', 'eunicelim'])
  })

  it('uses the usernames the client gave', () => {
    expect(byId('vins').username).toBe('vinslim')
    expect(byId('davy').username).toBe('limdavy28')
    expect(byId('chloe').username).toBe('chloechock')
    expect(byId('kelly').username).toBe('kellytew')
    expect(seedPeople.filter((p) => p.role === 'warehouse').map((p) => p.username)).toEqual([
      'xianan',
      'tianloong',
      'lowchunhui',
      'kimlim',
    ])
  })

  it('gives everyone a unique username and a work address', () => {
    const names = seedPeople.map((p) => p.username)
    expect(new Set(names).size).toBe(names.length)
    for (const p of seedPeople) {
      expect(p.username, p.name).toMatch(/^[a-z0-9]+$/)
      expect(p.email, p.name).toContain('@')
    }
  })

  it('finds a person by username, whatever the casing', () => {
    expect(personByUsername('KellyTew')?.id).toBe('kelly')
    expect(personByUsername('  kellytew ')?.id).toBe('kelly')
    expect(personByUsername('nobody')).toBeUndefined()
  })

  it('puts the promoters in the towns the client’s list names', () => {
    const counts = new Map<string, number>()
    for (const p of seedPeople.filter((x) => x.role === 'promoter')) {
      counts.set(p.city!, (counts.get(p.city!) ?? 0) + 1)
    }
    expect(counts.get('KLIA')).toBe(6)
    expect(counts.get('Langkawi')).toBe(3)
    expect(counts.get('Kota Kinabalu')).toBe(1)
    expect(counts.get('Genting Highlands')).toBe(2)
    expect(counts.get('Melaka')).toBe(3)

    // Every promoter belongs to a town and picks the outlet at sign-in.
    const promoters = seedPeople.filter((p) => p.role === 'promoter')
    expect(promoters).toHaveLength(27)
    expect(promoters.every((p) => Boolean(p.city) && !p.locationId)).toBe(true)

    // The twelve under "KL" get the four the client listed.
    const kl = promoters.filter((p) => p.city === 'Kuala Lumpur')
    expect(kl).toHaveLength(12)
    expect(storeChoicesFor(kl[0]).sort()).toEqual(
      ['bsas', 'klcc-isetan', 'parkson-pavilion', 'pavilion-5'].sort(),
    )
    expect(picksStore(kl[0])).toBe(true)
  })

  it('asks every promoter which outlet, even where the town has only one', () => {
    const byCity = new Map<string, number>()
    for (const p of seedPeople.filter((x) => x.role === 'promoter')) {
      byCity.set(p.city!, storeChoicesFor(p).length)
      // Confirming the counter is part of starting the day, for everyone.
      expect(picksStore(p), p.username).toBe(true)
    }
    for (const city of ['KLIA', 'Langkawi', 'Genting Highlands', 'Melaka', 'Kota Kinabalu']) {
      expect(byCity.get(city), city).toBe(1)
    }
    expect(byCity.get('Kuala Lumpur')).toBe(4)
  })

  it('never asks head office', () => {
    for (const p of seedPeople.filter((x) => x.role !== 'promoter')) {
      expect(picksStore(p), p.username).toBe(false)
    }
  })

  it('puts nobody at a counter until they have picked it', () => {
    const solo = seedPeople.find((p) => p.city === 'Melaka')!
    expect(storeForSession(solo)).toBeUndefined()
    expect(storeForSession(solo, 'melaka')).toBe('melaka')
    // Not one of theirs, so not accepted.
    expect(storeForSession(solo, 'pavilion-5')).toBeUndefined()
  })

  it('never offers an outlet that has not opened', () => {
    for (const p of seedPeople.filter((x) => x.role === 'promoter')) {
      for (const id of storeChoicesFor(p)) {
        const l = locationById(id)!
        expect(l.status, l.name).toBe('open')
        expect(l.channel, l.name).toBe('main')
        expect(l.city, l.name).toBe(p.city)
      }
    }
  })

  it('never carries a password on a person', () => {
    for (const p of seedPeople) {
      expect('password' in p, p.username).toBe(false)
      expect('passwordHistory' in p, p.username).toBe(false)
    }
  })
})

// ── Who may reset whose password ────────────────────────────────────────────

describe('password authority', () => {
  it('never lets a Store Promoter change a password, their own included', () => {
    expect(canChangeOwnPassword(promoter)).toBe(false)
    for (const target of seedPeople) {
      expect(canResetPasswordOf(promoter, target), target.id).toBe(false)
    }
  })

  it('lets Finance and the Warehouse change their own', () => {
    expect(canChangeOwnPassword(siewFang)).toBe(true)
    expect(canChangeOwnPassword(an)).toBe(true)
  })

  it('lets Ops, the PA, Davy and IT change their own', () => {
    for (const p of [kelly, chloe, davy, imran]) {
      expect(canChangeOwnPassword(p), p.username).toBe(true)
    }
  })

  it('stops Finance and the Warehouse touching a colleague', () => {
    expect(canResetPasswordOf(siewFang, ivvi)).toBe(false)
    expect(canResetPasswordOf(an, loong)).toBe(false)
    expect(canResetPasswordOf(siewFang, promoter)).toBe(false)
    expect(canResetPasswordOf(an, davy)).toBe(false)
  })

  it('lets Ops and the PA reach Finance, the Warehouse and the stores', () => {
    for (const actor of [kelly, chloe]) {
      expect(canResetPasswordOf(actor, siewFang), actor.id).toBe(true)
      expect(canResetPasswordOf(actor, an), actor.id).toBe(true)
      expect(canResetPasswordOf(actor, promoter), actor.id).toBe(true)
    }
  })

  it('stops Ops and the PA reaching each other, Davy or the Director', () => {
    expect(canResetPasswordOf(kelly, chloe)).toBe(false)
    expect(canResetPasswordOf(chloe, kelly)).toBe(false)
    for (const actor of [kelly, chloe]) {
      expect(canResetPasswordOf(actor, davy), actor.id).toBe(false)
      expect(canResetPasswordOf(actor, vins), actor.id).toBe(false)
    }
  })

  it('lets Davy reset anyone, including the Director', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canResetPasswordOf(davy, target), target.id).toBe(true)
    }
  })

  it('lets nobody but Davy and IT reset Davy', () => {
    const allowed = seedPeople.filter((p) => canResetPasswordOf(p, davy)).map((p) => p.id).sort()
    expect(allowed).toEqual(['davy', 'imran'])
  })

  it('lets IT reset anyone', () => {
    for (const target of seedPeople) {
      expect(canResetPasswordOf(imran, target), target.id).toBe(true)
    }
  })

  it('gives the Director no authority at all, not even over his own', () => {
    for (const target of seedPeople) {
      expect(canResetPasswordOf(vins, target), target.id).toBe(false)
    }
  })
})

// ── Who can read a password ─────────────────────────────────────────────────

describe('reading a password', () => {
  it('ties reading a password to the authority to set it', () => {
    for (const actor of seedPeople) {
      for (const target of seedPeople) {
        expect(canSeePasswordOf(actor, target), `${actor.id} -> ${target.id}`).toBe(
          canResetPasswordOf(actor, target),
        )
      }
    }
  })

  it('lets Davy and Imran read every password they can see', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canSeePasswordOf(davy, target), target.id).toBe(true)
    }
    for (const target of seedPeople) {
      expect(canSeePasswordOf(imran, target), target.id).toBe(true)
    }
  })

  it('lets Kelly and Chloe read the staff within their reach, and nobody above', () => {
    for (const actor of [kelly, chloe]) {
      expect(canSeePasswordOf(actor, siewFang), actor.id).toBe(true)
      expect(canSeePasswordOf(actor, promoter), actor.id).toBe(true)
      expect(canSeePasswordOf(actor, davy), actor.id).toBe(false)
    }
    expect(canSeePasswordOf(kelly, chloe)).toBe(false)
  })
})

// ── The second step ─────────────────────────────────────────────────────────

describe('who gets a code by e-mail', () => {
  it('asks leadership and IT for a code', () => {
    for (const p of [vins, davy, kelly, chloe, imran]) {
      expect(needsTwoStep(p), p.username).toBe(true)
    }
  })

  it('lets everybody else in on the password alone', () => {
    for (const p of [siewFang, ivvi, an, loong, promoter]) {
      expect(needsTwoStep(p), p.username).toBe(false)
    }
  })

  it('covers exactly the roles that can read other people’s passwords, plus the Director', () => {
    expect([...TWO_STEP_ROLES].sort()).toEqual(['director', 'it', 'md', 'ops', 'pa'])
  })
})

// ── Visibility ──────────────────────────────────────────────────────────────

describe('who can be seen', () => {
  it('hides IT from everyone but IT', () => {
    for (const actor of seedPeople.filter((p) => p.id !== 'imran')) {
      expect(canSeeUser(actor, imran), actor.id).toBe(false)
    }
    expect(canSeeUser(imran, imran)).toBe(true)
  })

  it('shows everybody else to everybody', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canSeeUser(promoter, target), target.id).toBe(true)
    }
  })
})

// ── The password rules ──────────────────────────────────────────────────────

describe('password rules', () => {
  it('refuses anything too short', () => {
    expect(checkPassword('a1b2c3').ok).toBe(false)
    // One short of the minimum, so it is refused; exactly the minimum is not.
    expect(checkPassword('x'.repeat(PASSWORD_MIN - 2) + '1').ok).toBe(false)
    expect(checkPassword('kebaya' + '1'.repeat(PASSWORD_MIN - 6)).ok).toBe(true)
  })

  it('wants letters and a number', () => {
    expect(checkPassword('abcdefghijk').ok).toBe(false)
    expect(checkPassword('1234567890123').ok).toBe(false)
  })

  it('refuses the obvious ones, however they are dressed up', () => {
    for (const weak of ['mypassword1', 'legendary123', 'qwerty12345', 'perfume2026']) {
      expect(checkPassword(weak).ok, weak).toBe(false)
    }
  })

  it('accepts a good one', () => {
    expect(checkPassword('kebaya-tanjung-417').ok).toBe(true)
  })

  it('only ever suggests one that passes its own rules', () => {
    for (let i = 0; i < 200; i++) {
      expect(checkPassword(suggestPassword()).ok).toBe(true)
    }
  })

  it('scores length above everything else', () => {
    expect(passwordStrength('short1')).toBe(0)
    expect(passwordStrength('kebaya-tan1')).toBeGreaterThanOrEqual(1)
    expect(passwordStrength('kebaya-tanjung-417!')).toBe(3)
  })

  it('gives the local build a starting password that passes its own rules', () => {
    for (const p of seedPeople) {
      expect(checkPassword(startingPassword(p.username)).ok, p.username).toBe(true)
    }
  })
})

// ── Usernames and e-mail ────────────────────────────────────────────────────

describe('making a new login', () => {
  it('suggests a username nobody holds', () => {
    expect(suggestUsername('Nurul Aina', seedPeople)).toBe('nurulaina')
    // Kelly Tew is taken, so the next one is numbered.
    expect(suggestUsername('Kelly Tew', seedPeople)).toBe('kellytew2')
  })

  it('masks an address so the code screen gives nothing away', () => {
    expect(maskEmail('kellytew@legendary.com.my')).toBe('ke••••••@legendary.com.my')
    expect(maskEmail('not-an-address')).toBe('not-an-address')
  })
})
