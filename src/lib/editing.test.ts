import { describe, expect, it } from 'vitest'
import { closingEditMode, closingWriteRefusal, orderEditMode, saleEditable } from './editing'
import type { Role } from '../data/people'

/**
 * Who may change what, once it is in. The same rule runs in the screens, in
 * the store, in the local backend, and — as `_closing_refusal` — on the
 * server, where `scripts/verify-server.mjs` checks it against a real database.
 */

const today = '2026-09-29'
const as = (role: Role) => ({ role })
const closing = (period: string) => ({ locationId: 'pavilion-5', period })

describe('changing a closing', () => {
  it('is the store’s own on the day, and Kelly’s or Davy’s any day', () => {
    expect(closingEditMode(as('promoter'), 'pavilion-5', closing(today), today)).toBe('direct')
    expect(closingEditMode(as('ops'), undefined, closing('2026-08-01'), today)).toBe('direct')
    expect(closingEditMode(as('md'), undefined, closing('2026-08-01'), today)).toBe('direct')
  })

  it('goes to Kelly for an earlier day, for three days, then closes', () => {
    expect(closingEditMode(as('promoter'), 'pavilion-5', closing('2026-09-28'), today)).toBe('request')
    expect(closingEditMode(as('promoter'), 'pavilion-5', closing('2026-09-26'), today)).toBe('request')
    expect(closingEditMode(as('promoter'), 'pavilion-5', closing('2026-09-25'), today)).toBe('locked')
  })

  it('is nobody else’s', () => {
    expect(closingEditMode(as('promoter'), 'klcc-isetan', closing(today), today)).toBe('none')
    expect(closingEditMode(as('pa'), undefined, closing(today), today)).toBe('none')
    expect(closingEditMode(as('finance'), undefined, closing(today), today)).toBe('none')
    expect(closingEditMode(as('director'), undefined, closing(today), today)).toBe('none')
  })
})

describe('changing an order', () => {
  const po = (status: 'submitted' | 'rejected' | 'approved') => ({ status, locationId: 'pavilion-5' })

  it('is open while it waits for Kelly, to the store that asked and to Kelly', () => {
    expect(orderEditMode(as('promoter'), 'pavilion-5', po('submitted'))).toBe('edit')
    expect(orderEditMode(as('ops'), undefined, po('submitted'))).toBe('edit')
    expect(orderEditMode(as('promoter'), 'klcc-isetan', po('submitted'))).toBe('none')
    expect(orderEditMode(as('finance'), undefined, po('submitted'))).toBe('none')
  })

  it('can be changed and sent again after Kelly turns it down', () => {
    expect(orderEditMode(as('promoter'), 'pavilion-5', po('rejected'))).toBe('resend')
    expect(orderEditMode(as('ops'), undefined, po('rejected'))).toBe('none')
  })

  it('is the warehouse’s once approved', () => {
    expect(orderEditMode(as('promoter'), 'pavilion-5', po('approved'))).toBe('none')
    expect(orderEditMode(as('ops'), undefined, po('approved'))).toBe('none')
  })
})

describe('changing a sale at the counter', () => {
  it('works today, and on a day not yet closed', () => {
    expect(saleEditable({ day: today }, today, true)).toBe(true)
    expect(saleEditable({ day: '2026-09-27' }, today, false)).toBe(true)
    expect(saleEditable({ day: '2026-09-27' }, today, true)).toBe(false)
  })
})

describe('what the server says to a closing written over one filed', () => {
  const filed = { id: 'pavilion-5-2026-09-28', period: '2026-09-28', revenueMYR: 800, tender: { cash: 800, ewallet: 0, card: 0 } }
  const before = (doc: object = filed, day = '2026-09-28') => ({ day, doc, deleted: false })
  const ask = (status = 'pending') => ({ ...filed, correction: { status, reason: 'x', requestedBy: 'A', requestedAt: 't', previousRevenueMYR: 800 } })

  it('lets anything through for a first filing', () => {
    expect(closingWriteRefusal('promoter', undefined, filed, today)).toBeNull()
  })

  it('lets the store change today’s outright', () => {
    expect(closingWriteRefusal('promoter', before(filed, today), { ...filed, revenueMYR: 900 }, today)).toBeNull()
  })

  it('refuses the store changing an earlier day outright', () => {
    expect(closingWriteRefusal('promoter', before(), { ...filed, revenueMYR: 900 }, today)).toMatch(/asking Kelly/)
  })

  it('lets the store ask, change its request, and take it back', () => {
    expect(closingWriteRefusal('promoter', before(), ask(), today)).toBeNull()
    expect(closingWriteRefusal('promoter', before(ask()), { ...ask(), correction: { ...ask().correction, reason: 'y' } }, today)).toBeNull()
    expect(closingWriteRefusal('promoter', before(ask()), filed, today)).toBeNull()
  })

  it('refuses a request outside the three days', () => {
    expect(closingWriteRefusal('promoter', before(filed, '2026-09-25'), ask(), today)).toMatch(/3 days/)
  })

  it('keeps deciding a correction for Kelly and Davy, whoever sends it', () => {
    expect(closingWriteRefusal('promoter', before(ask()), ask('approved'), today)).toMatch(/Kelly or Davy/)
    expect(closingWriteRefusal('pa', before(ask()), ask('approved'), today)).toMatch(/Kelly or Davy/)
    expect(closingWriteRefusal('ops', before(ask()), ask('approved'), today)).toBeNull()
    expect(closingWriteRefusal('md', before(ask()), ask('rejected'), today)).toBeNull()
  })

  it('stops the store undoing or rewriting a decided correction', () => {
    expect(closingWriteRefusal('promoter', before(ask('approved')), filed, today)).toMatch(/undo/)
    const rewritten = { ...ask('approved'), correction: { ...ask('approved').correction, reason: 'changed' } }
    expect(closingWriteRefusal('promoter', before(ask('approved')), rewritten, today)).toMatch(/Kelly or Davy/)
    // Sending the same document back unchanged is harmless.
    expect(closingWriteRefusal('promoter', before(ask('approved')), ask('approved'), today)).toBeNull()
  })

  it('compares documents by content, not by the order of their fields', () => {
    const reordered = { tender: filed.tender, revenueMYR: 800, period: filed.period, id: filed.id }
    expect(closingWriteRefusal('promoter', before(), { ...reordered, correction: ask().correction }, today)).toBeNull()
  })
})
