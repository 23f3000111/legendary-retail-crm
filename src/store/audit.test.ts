import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIT_OVERLAY_LIMIT, useData } from './useData'
import { useAuth } from './useAuth'
import { setAuditActor } from '../lib/audit'
import { can, type Person, type Role } from '../data/people'
import type { PurchaseOrder } from '../data/types'

/**
 * The activity log has one job: answer "who did this, and when" for anything
 * that changed. These tests go action by action, because a log with a hole in
 * it is worse than no log — it looks complete and is not.
 */

const person = (id: string): Person => {
  const p = useData.getState().users.find((u) => u.id === id)
  if (!p) throw new Error(`no user ${id}`)
  return p
}

/** Entries written since the store was reset, i.e. not seeded history. */
const written = () => useData.getState().overlay.auditEntries

const actions = () => written().map((e) => e.action)

beforeEach(() => {
  useData.getState().resetDemo()
  useAuth.setState({ personId: null, pending: null, lockedUntil: null })
  setAuditActor('kelly')
})

describe('every action leaves a line', () => {
  it('records a sale being logged, and taken back', () => {
    useData.getState().addSaleLine('pavilion-5', { skuId: 'orchid-30', qty: 2, countryCode: 'CN' })
    expect(actions()).toContain('sale.recorded')
    expect(written()[0].locationId).toBe('pavilion-5')
    expect(written()[0].detail).toMatch(/China/)

    useData.getState().removeSaleLine('pavilion-5', 0)
    expect(actions()[0]).toBe('sale.removed')
  })

  it('records an order being raised and approved', () => {
    const po: PurchaseOrder = {
      id: 'PO-TEST-0001',
      locationId: 'klia-t2',
      createdBy: 'KLIA T2 promoter',
      createdAt: '2026-08-21T10:00:00+08:00',
      priority: 'standard',
      notes: '',
      status: 'submitted',
      lines: [{ skuId: 'orchid-30', qtyRequested: 12, qtyApproved: null, qtyShipped: null }],
      events: [],
    }
    useData.getState().createPurchaseOrder(po)
    expect(actions()).toContain('order.raised')

    const result = useData.getState().transitionPo({
      poId: po.id,
      to: 'approved',
      actor: 'Kelly Tew',
      role: 'ops',
    })
    expect(result.ok).toBe(true)

    const entry = written().find((e) => e.action === 'order.approved')
    expect(entry?.actorName).toBe('Kelly Tew')
    expect(entry?.summary).toMatch(/Approved PO-TEST-0001/)
    expect(entry?.entityId).toBe('PO-TEST-0001')
  })

  it('records a target being set, and what it was before', () => {
    useData.getState().setTarget('pavilion-5', '2026-08', 130_000)
    const entry = written()[0]
    expect(entry.action).toBe('target.changed')
    expect(entry.detail).toMatch(/Was RM/)

    useData.getState().setTarget('dlr-beauty-scent', '2026-08', 40_000)
    expect(written()[0].action).toBe('target.set')
    expect(written()[0].detail).toBeUndefined()
  })

  it('records a promotion, and telling Imran separately', () => {
    const draft = {
      id: 'promo-audit-test',
      name: 'Test campaign',
      mechanic: 'discount' as const,
      detail: '10% off',
      from: '2026-09-01',
      to: '2026-09-07',
      skuIds: [],
      locationIds: [],
      plannedBy: 'Lim Davy',
      recordedBy: 'Chloe Chock',
      recordedAt: '2026-08-23T09:00:00+08:00',
      informedIt: false,
    }
    useData.getState().addPromotion(draft)
    expect(actions()[0]).toBe('promotion.recorded')

    useData.getState().updatePromotion(draft.id, { informedIt: true })
    expect(actions()[0]).toBe('promotion.it_informed')
  })

  it('records a login being created, edited and disabled — once each', () => {
    const fresh: Person = {
      ...person('siew-fang'),
      id: 'new-person',
      username: 'nurulaina',
      name: 'Nurul Aina',
      password: 'Start-nurul-26',
      passwordHistory: [],
    }
    useData.getState().addUser(fresh)
    expect(actions()[0]).toBe('login.created')

    useData.getState().updateUser('new-person', { title: 'Senior Finance' })
    expect(actions()[0]).toBe('login.updated')
    expect(written()[0].detail).toMatch(/Title changed/)

    useData.getState().setUserActive('new-person', false)
    // One entry, not two: setUserActive writes its own and silences updateUser.
    expect(actions().filter((a) => a === 'login.disabled')).toHaveLength(1)
    expect(actions().filter((a) => a === 'login.updated')).toHaveLength(1)
  })

  it('says nothing when an edit changes nothing', () => {
    const before = written().length
    useData.getState().updateUser('kim', { name: person('kim').name })
    expect(written()).toHaveLength(before)
  })

  it('records a closing being filed', () => {
    const closing = {
      id: 'pavilion-5-2026-08-21',
      locationId: 'pavilion-5',
      channel: 'main' as const,
      period: '2026-08-21',
      periodType: 'day' as const,
      revenueMYR: 4200,
      tender: { cash: 2200, ewallet: 0, card: 2000 },
      lines: [{ skuId: 'orchid-30', qty: 3, countryCode: 'CN' }],
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount: [],
      writeOffs: [],
      submittedBy: 'Pavilion KL promoter',
      submittedAt: '2026-08-21T22:10:00+08:00',
    }
    useData.getState().submitClosing(closing)
    const entry = written()[0]
    expect(entry.action).toBe('closing.filed')
    expect(entry.summary).toMatch(/Pavilion KL/)
    expect(entry.entityId).toBe(closing.id)
  })

  it('records a correction being asked for and decided', () => {
    const closing = useData
      .getState()
      .closings.find((c) => c.period === '2026-08-20' && c.channel === 'main')!

    useData.getState().requestCorrection({
      closingId: closing.id,
      requestedBy: 'Pavilion KL promoter',
      reason: 'Miscounted the card total',
      revenueMYR: closing.revenueMYR + 500,
    })
    expect(actions()[0]).toBe('correction.requested')
    expect(written()[0].detail).toMatch(/Miscounted the card total/)

    useData.getState().resolveCorrection({
      closingId: closing.id,
      approvedBy: 'Kelly Tew',
      role: 'ops',
      approve: true,
    })
    expect(actions()[0]).toBe('correction.approved')
  })

  it('records an alert being read, and a bulk clear', () => {
    const unread = useData.getState().alerts.find((a) => !a.read)!
    useData.getState().markAlertRead(unread.id)
    expect(actions()[0]).toBe('alert.read')

    useData.getState().markAllAlertsRead()
    expect(actions()[0]).toBe('alert.read_all')

    // Nothing left unread, so a second clear says nothing.
    const before = written().length
    useData.getState().markAllAlertsRead()
    expect(written()).toHaveLength(before)
  })
})

// ── PINs ────────────────────────────────────────────────────────────────────

describe('passwords in the log', () => {
  it('records a reset without ever writing the password down', () => {
    useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'kim', password: 'kebaya-tanjung-417' })
    const entry = written().find((e) => e.action === 'password.reset')!

    expect(entry.actorName).toBe('Lim Davy')
    expect(entry.summary).toMatch(/Reset the password for Kim Lim/)
    expect(JSON.stringify(entry)).not.toContain('kebaya-tanjung-417')
    expect(entry.kind).toBe('password')
  })

  it('tells a self-change apart from a reset', () => {
    useData
      .getState()
      .setPassword({ actor: person('kim'), targetId: 'kim', password: 'kebaya-tanjung-417' })
    expect(written()[0].action).toBe('password.changed')
    expect(written()[0].summary).toBe('Changed their own password')
  })

  it('never lets a refused change reach the log', () => {
    const before = written().length
    useData
      .getState()
      .setPassword({ actor: person('kelly'), targetId: 'chloe', password: 'kebaya-tanjung-417' })
    expect(written()).toHaveLength(before)
  })
})

// ── Sessions ────────────────────────────────────────────────────────────────

describe('sign-in in the log', () => {
  it('records the code being sent, then the sign-in, then the sign-out', () => {
    setAuditActor(null)
    const kelly = person('kelly')

    const begun = useAuth.getState().beginSignIn(kelly.username, kelly.password)
    expect(begun.ok).toBe(true)
    expect(actions()[0]).toBe('session.code_sent')
    // The masked address never gives the whole thing away.
    expect(written()[0].summary).toContain('@')
    expect(written()[0].summary).not.toContain(kelly.email)

    const code = useAuth.getState().pending!.code
    const done = useAuth.getState().submitCode(code)
    expect(done.ok).toBe(true)
    expect(actions()[0]).toBe('session.signed_in')

    useAuth.getState().signOut()
    expect(actions()[0]).toBe('session.signed_out')
  })

  it('signs a promoter straight in on the password alone — no code', () => {
    setAuditActor(null)
    const promoter = person('teokoknian')
    const result = useAuth.getState().beginSignIn(promoter.username, promoter.password)

    expect(result.ok).toBe(true)
    expect(result.person?.id).toBe('teokoknian')
    expect(useAuth.getState().personId).toBe('teokoknian')
    expect(useAuth.getState().pending).toBeNull()
    expect(actions()[0]).toBe('session.signed_in')
    expect(actions()).not.toContain('session.code_sent')
  })

  it('signs Finance and the Warehouse straight in too', () => {
    for (const id of ['siew-fang', 'an']) {
      setAuditActor(null)
      useAuth.setState({ personId: null, pending: null, lockedUntil: null })
      const p = person(id)
      const result = useAuth.getState().beginSignIn(p.username, p.password)
      expect(result.person?.id, id).toBe(id)
    }
  })

  it('records a look-up of somebody’s password, and never the password', () => {
    const kim = person('kim')
    useData.getState().revealPassword({ actor: person('davy'), targetId: 'kim' })
    const entry = written()[0]
    expect(entry.action).toBe('password.revealed')
    expect(entry.summary).toMatch(/Looked at the password for Kim Lim/)
    expect(JSON.stringify(entry)).not.toContain(kim.password)
  })

  it('records a refusal without recording the password', () => {
    setAuditActor(null)
    const result = useAuth.getState().beginSignIn('kellytew', 'not-the-password-1')
    expect(result.ok).toBe(false)
    const entry = written()[0]
    expect(entry.action).toBe('session.sign_in_failed')
    expect(JSON.stringify(entry)).not.toContain('not-the-password-1')
  })

  it('says the same thing whether the username or the password was wrong', () => {
    setAuditActor(null)
    const nobody = useAuth.getState().beginSignIn('nosuchperson', 'whatever-123')
    const wrongPassword = useAuth.getState().beginSignIn('kellytew', 'whatever-123')
    expect(nobody.error).toBe(wrongPassword.error)
  })

  it('will not sign in on the password alone', () => {
    setAuditActor(null)
    const kelly = person('kelly')
    useAuth.getState().beginSignIn(kelly.username, kelly.password)
    // The password was right, but nobody is signed in until the code is.
    expect(useAuth.getState().personId).toBeNull()
    expect(useAuth.getState().pending).not.toBeNull()
  })

  it('refuses a wrong code, and gives up after five', () => {
    setAuditActor(null)
    const kelly = person('kelly')
    useAuth.getState().beginSignIn(kelly.username, kelly.password)
    const real = useAuth.getState().pending!.code
    const wrong = real === '000000' ? '111111' : '000000'

    for (let i = 0; i < 4; i++) {
      expect(useAuth.getState().submitCode(wrong).ok).toBe(false)
    }
    const last = useAuth.getState().submitCode(wrong)
    expect(last.ok).toBe(false)
    expect(useAuth.getState().pending).toBeNull()
    expect(actions()[0]).toBe('session.code_failed')
  })

  it('refuses a code that has expired', () => {
    setAuditActor(null)
    const kelly = person('kelly')
    useAuth.getState().beginSignIn(kelly.username, kelly.password)
    const pending = useAuth.getState().pending!
    useAuth.setState({ pending: { ...pending, expiresAt: Date.now() - 1 } })

    const result = useAuth.getState().submitCode(pending.code)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/expired/i)
  })

  it('will not let a disabled login through', () => {
    setAuditActor(null)
    const kim = person('kim')
    useData.getState().setUserActive('kim', false)
    const result = useAuth.getState().beginSignIn(kim.username, kim.password)
    expect(result.ok).toBe(false)
  })
})

// ── The shape of the log ────────────────────────────────────────────────────

describe('the log itself', () => {
  it('stamps every entry with a person, a role and a time', () => {
    useData.getState().setTarget('pavilion-5', '2026-08', 111_000)
    for (const e of written()) {
      expect(e.actorId, e.action).toBeTruthy()
      expect(e.actorName, e.action).toBeTruthy()
      expect(e.actorRole, e.action).toBeTruthy()
      expect(Number.isNaN(Date.parse(e.at)), e.action).toBe(false)
      expect(e.summary.length, e.action).toBeGreaterThan(0)
    }
  })

  it('attributes an action to whoever is signed in', () => {
    setAuditActor('chloe')
    useData.getState().setTarget('genting', '2026-08', 90_000)
    expect(written()[0].actorName).toBe('Chloe Chock')
    expect(written()[0].actorRole).toBe('pa')
  })

  it('says so plainly when nobody is signed in', () => {
    setAuditActor(null)
    useData.getState().setTarget('genting', '2026-08', 90_000)
    expect(written()[0].actorId).toBe('unknown')
  })

  it('keeps the newest entries when the browser cap is reached', () => {
    for (let i = 0; i < AUDIT_OVERLAY_LIMIT + 25; i++) {
      useData.getState().record({
        kind: 'target',
        action: 'target.set',
        summary: `Entry ${i}`,
      })
    }
    expect(written()).toHaveLength(AUDIT_OVERLAY_LIMIT)
    expect(written()[0].summary).toBe(`Entry ${AUDIT_OVERLAY_LIMIT + 24}`)
  })

  it('gives every entry its own id', () => {
    for (let i = 0; i < 50; i++) {
      useData.getState().record({ kind: 'sale', action: 'sale.recorded', summary: `x${i}` })
    }
    const ids = useData.getState().audit.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reads newest first', () => {
    const at = useData.getState().audit.map((e) => e.at)
    expect([...at].sort((a, b) => (a < b ? 1 : -1))).toEqual(at)
  })

  it('starts with seeded history, so the screen is never empty', () => {
    const audit = useData.getState().audit
    expect(audit.length).toBeGreaterThan(100)
    expect(new Set(audit.map((e) => e.kind))).toContain('closing')
    expect(new Set(audit.map((e) => e.kind))).toContain('order')
    expect(new Set(audit.map((e) => e.kind))).toContain('login')
  })
})

// ── Who may read it ─────────────────────────────────────────────────────────

describe('who can read the log', () => {
  it('goes to the people accountable for the system, not to everyone', () => {
    const allowed = (['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'] as Role[])
      .filter((r) => can(r).viewAudit)
    expect(allowed).toEqual(['director', 'md', 'ops', 'pa', 'it'])
  })

  it('lets the read-only Director read it — he is the one who would ask', () => {
    expect(can('director').viewAudit).toBe(true)
    expect(can('director').canEdit).toBe(false)
  })
})

// ── One customer, several things ────────────────────────────────────────────

describe('recording a whole basket', () => {
  it('writes every line with the same country, and one log entry', () => {
    const before = written().length
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [
        { skuId: 'orchid-retail', qty: 1 },
        { skuId: 'orchid-travel', qty: 2 },
        { skuId: 'mahsuri-retail', qty: 1 },
      ],
      countryCode: 'MY',
      segment: 'chinese',
    })

    const lines = useData.getState().liveLines['pavilion-5'].slice(-3)
    expect(lines.every((l) => l.countryCode === 'MY')).toBe(true)
    expect(lines.every((l) => l.segment === 'chinese')).toBe(true)

    // Three bottles, one customer, one line in the log.
    expect(written()).toHaveLength(before + 1)
    expect(written()[0].summary).toMatch(/4 units across 3 products/)
    expect(written()[0].detail).toBe('Customer from Malaysia · Chinese')
  })

  it('names the product when only one thing was bought', () => {
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 2 }],
      countryCode: 'CN',
    })
    expect(written()[0].summary).toMatch(/2 × Orchid/)
    expect(written()[0].detail).toBe('Customer from China')
  })

  it('keeps the price the counter chose, and says so in the log', () => {
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 1, priceTier: 'retail' }],
      countryCode: 'SG',
    })
    const live = useData.getState().liveLines['pavilion-5']
    expect(live[live.length - 1].priceTier).toBe('retail')
    expect(written()[0].summary).toMatch(/1 × Orchid · 30ml at the retail price/)
  })

  it('counts the same bottle at two prices as one product', () => {
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [
        { skuId: 'orchid-retail', qty: 1, priceTier: 'retail' },
        { skuId: 'orchid-retail', qty: 1, priceTier: 'promotion' },
      ],
      countryCode: 'SG',
    })
    expect(written()[0].summary).toMatch(/2 units across 1 product at/)
  })

  it('records nothing at all for an empty basket', () => {
    const before = written().length
    useData.getState().recordSale({ locationId: 'pavilion-5', lines: [] })
    expect(written()).toHaveLength(before)
  })

  it('leaves the country off where the store does not capture one', () => {
    useData.getState().recordSale({
      locationId: 'dlr-beauty-scent',
      lines: [{ skuId: 'orchid-retail', qty: 1 }],
    })
    const dealerLines = useData.getState().liveLines['dlr-beauty-scent']
    const line = dealerLines[dealerLines.length - 1]
    expect(line?.countryCode).toBeUndefined()
    expect(written()[0].detail).toBeUndefined()
  })
})
