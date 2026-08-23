import { describe, expect, it } from 'vitest'
import {
  can,
  canChangeOwnPin,
  canChangePinOf,
  canSeePinOf,
  canSeeUser,
  checkPin,
  seedPeople,
  suggestPin,
  PIN_LENGTH,
  type Person,
  type Role,
} from './people'

const byId = (id: string): Person => {
  const p = seedPeople.find((u) => u.id === id)
  if (!p) throw new Error(`no seeded person ${id}`)
  return p
}

const firstOfRole = (role: Role): Person => {
  const p = seedPeople.find((u) => u.role === role)
  if (!p) throw new Error(`no seeded person with role ${role}`)
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
const promoter = byId('promoter-pavilion')

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

  it('confines a Store Promoter to their own store', () => {
    expect(can('promoter').viewAll).toBe(false)
    expect(promoter.locationId).toBeTruthy()
  })

  it('lets only Davy, Kelly, Chloe and Imran create staff', () => {
    const creators = seedPeople.filter((p) => can(p.role).manageUsers).map((p) => p.id).sort()
    expect(creators).toEqual(['chloe', 'davy', 'imran', 'kelly'])
  })
})

// ── Who may change whose PIN ────────────────────────────────────────────────

describe('PIN authority', () => {
  it('never lets a Store Promoter change a PIN, their own included', () => {
    expect(canChangeOwnPin(promoter)).toBe(false)
    for (const target of seedPeople) {
      expect(canChangePinOf(promoter, target), target.id).toBe(false)
    }
  })

  it('lets Finance and the Warehouse change their own PIN and nobody else’s', () => {
    for (const actor of [siewFang, an]) {
      expect(canChangeOwnPin(actor), actor.id).toBe(true)
    }
    expect(canChangePinOf(siewFang, ivvi)).toBe(false)
    expect(canChangePinOf(an, loong)).toBe(false)
    expect(canChangePinOf(siewFang, promoter)).toBe(false)
    expect(canChangePinOf(an, davy)).toBe(false)
  })

  it('lets Ops and the PA reach Finance, the Warehouse and the stores', () => {
    for (const actor of [kelly, chloe]) {
      expect(canChangePinOf(actor, siewFang), actor.id).toBe(true)
      expect(canChangePinOf(actor, an), actor.id).toBe(true)
      expect(canChangePinOf(actor, promoter), actor.id).toBe(true)
      expect(canChangeOwnPin(actor), actor.id).toBe(true)
    }
  })

  it('stops Ops and the PA reaching each other, Davy or the Director', () => {
    expect(canChangePinOf(kelly, chloe)).toBe(false)
    expect(canChangePinOf(chloe, kelly)).toBe(false)
    for (const actor of [kelly, chloe]) {
      expect(canChangePinOf(actor, davy), actor.id).toBe(false)
      expect(canChangePinOf(actor, vins), actor.id).toBe(false)
    }
  })

  it('lets Davy change anyone’s PIN, including the Director’s and his own', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canChangePinOf(davy, target), target.id).toBe(true)
    }
    expect(canChangeOwnPin(davy)).toBe(true)
  })

  it('lets nobody but Davy and IT change Davy’s PIN', () => {
    const allowed = seedPeople.filter((p) => canChangePinOf(p, davy)).map((p) => p.id).sort()
    expect(allowed).toEqual(['davy', 'imran'])
  })

  it('lets IT change anyone’s PIN', () => {
    for (const target of seedPeople) {
      expect(canChangePinOf(imran, target), target.id).toBe(true)
    }
  })

  it('gives the Director no PIN authority at all', () => {
    for (const target of seedPeople) {
      expect(canChangePinOf(vins, target), target.id).toBe(false)
    }
  })
})

// ── Visibility ──────────────────────────────────────────────────────────────

describe('who can be seen', () => {
  it('hides IT from everyone but IT', () => {
    for (const actor of seedPeople.filter((p) => p.id !== 'imran')) {
      expect(canSeeUser(actor, imran), actor.id).toBe(false)
      expect(canSeePinOf(actor, imran), actor.id).toBe(false)
    }
    expect(canSeeUser(imran, imran)).toBe(true)
  })

  it('shows everybody else to everybody', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canSeeUser(promoter, target), target.id).toBe(true)
    }
  })

  it('ties reading a PIN to the authority to change it', () => {
    for (const actor of seedPeople) {
      for (const target of seedPeople) {
        expect(canSeePinOf(actor, target), `${actor.id} → ${target.id}`)
          .toBe(canChangePinOf(actor, target))
      }
    }
  })

  it('lets Davy and Imran read every PIN they can see', () => {
    for (const target of seedPeople.filter((p) => !p.hidden)) {
      expect(canSeePinOf(davy, target), target.id).toBe(true)
    }
    for (const target of seedPeople) {
      expect(canSeePinOf(imran, target), target.id).toBe(true)
    }
  })
})

// ── The PIN rules ───────────────────────────────────────────────────────────

describe('PIN rules', () => {
  it('seeds a unique PIN for every login', () => {
    const pins = seedPeople.map((p) => p.pin)
    expect(new Set(pins).size).toBe(pins.length)
  })

  it('seeds six digits every time', () => {
    for (const p of seedPeople) {
      expect(p.pin, p.id).toMatch(new RegExp(`^\\d{${PIN_LENGTH}}$`))
    }
  })

  it('refuses anything that is not six digits', () => {
    for (const bad of ['', '1234', '12345', '1234567', '12a456', ' 123456']) {
      expect(checkPin(bad, siewFang, seedPeople).ok, bad).toBe(false)
    }
  })

  it('refuses the obvious ones', () => {
    for (const weak of ['000000', '123456', '111111', '654321']) {
      expect(checkPin(weak, siewFang, seedPeople).ok, weak).toBe(false)
    }
  })

  it('refuses a PIN another login already holds', () => {
    const result = checkPin(davy.pin, siewFang, seedPeople)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already uses/i)
  })

  it('refuses the PIN they are already on', () => {
    expect(checkPin(siewFang.pin, siewFang, seedPeople).ok).toBe(false)
  })

  it('refuses a PIN this person has used before', () => {
    const withHistory: Person = { ...siewFang, pin: '404511', pinHistory: ['884219'] }
    const users = seedPeople.map((u) => (u.id === withHistory.id ? withHistory : u))
    const result = checkPin('884219', withHistory, users)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/used that PIN before/i)
  })

  it('accepts a fresh six-digit PIN', () => {
    expect(checkPin('704318', siewFang, seedPeople).ok).toBe(true)
  })

  it('only ever suggests a PIN that passes its own rules', () => {
    for (let i = 0; i < 200; i++) {
      const pin = suggestPin(seedPeople)
      expect(pin).toMatch(new RegExp(`^\\d{${PIN_LENGTH}}$`))
      expect(checkPin(pin, firstOfRole('finance'), seedPeople).ok, pin).toBe(true)
    }
  })
})
