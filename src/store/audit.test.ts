import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { useAuth } from './useAuth'
import { settle, signInAs, signOutForTests, startFixture, written } from './testing'
import type { LocalBackend } from '../api/local'
import { can, startingPassword, storeChoicesFor, type Person, type Role } from '../data/people'
import type { PurchaseOrder } from '../data/types'

/**
 * The activity log has one job: answer "who did this, and when" for anything
 * that changed. These tests go action by action, because a log with a hole in
 * it is worse than no log — it looks complete and is not.
 *
 * They run against the local backend, which keeps the same rules as the
 * shared server, with Kelly signed in unless a test says otherwise.
 */

const person = (id: string): Person => {
  const p = useData.getState().users.find((u) => u.id === id)
  if (!p) throw new Error(`no user ${id}`)
  return p
}

const actions = () => written().map((e) => e.action)

let lb: LocalBackend

beforeEach(() => {
  lb = startFixture('kelly')
  useAuth.setState({ token: null, personId: null, locationId: null, pending: null, status: 'ready' })
})

describe('every action leaves a line', () => {
  it('records a sale being logged, and taken back', () => {
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 2 }],
      countryCode: 'CN',
    })
    expect(actions()).toContain('sale.recorded')
    expect(written()[0].locationId).toBe('pavilion-5')
    expect(written()[0].detail).toMatch(/China/)

    const line = useData.getState().liveLines['pavilion-5'].slice(-1)[0]
    useData.getState().removeSaleLine(line.id!)
    expect(actions()[0]).toBe('sale.removed')
    expect(useData.getState().liveLines['pavilion-5']?.some((l) => l.id === line.id)).toBeFalsy()
  })

  it('records a whole sale being taken back in one go', () => {
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [
        { skuId: 'orchid-retail', qty: 1 },
        { skuId: 'mahsuri-retail', qty: 1 },
      ],
      countryCode: 'CN',
    })
    const saleId = useData.getState().liveLines['pavilion-5'].slice(-1)[0].saleId!
    useData.getState().removeSale(saleId)
    expect(actions()[0]).toBe('sale.removed')
    expect(written()[0].summary).toMatch(/whole sale — 2 units/)
    expect(useData.getState().liveLines['pavilion-5']?.some((l) => l.saleId === saleId)).toBeFalsy()
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
      lines: [{ skuId: 'orchid-retail', qtyRequested: 12, qtyApproved: null, qtyShipped: null }],
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

  it('records Finance clearing an order, beside the chain', () => {
    const approved = useData.getState().purchaseOrders.find((p) => p.status === 'approved')!
    signInAs(lb, 'siew-fang')
    const result = useData.getState().clearAccounts({ poId: approved.id, actor: 'Siew Fang', role: 'finance' })
    expect(result.ok).toBe(true)
    expect(actions()[0]).toBe('order.accounts_cleared')
    const after = useData.getState().purchaseOrders.find((p) => p.id === approved.id)!
    // The status has not moved — the warehouse is not waiting on this.
    expect(after.status).toBe('approved')
    expect(after.financeClearedBy).toBe('Siew Fang')
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

  it('records a login being created, edited and disabled — once each', async () => {
    const fresh: Person = {
      ...person('siew-fang'),
      id: 'new-person',
      username: 'nurulaina',
      name: 'Nurul Aina',
    }
    const result = await useData.getState().addUser(fresh, 'Start-nurul-26')
    expect(result.ok).toBe(true)
    expect(actions()[0]).toBe('login.created')
    expect(JSON.stringify(written()[0])).not.toContain('Start-nurul-26')

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
      lines: [{ skuId: 'orchid-retail', qty: 3, countryCode: 'CN' }],
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
    // The alert follows from the data rather than being stored.
    expect(useData.getState().alerts.some((a) => a.id === `correction-${closing.id}`)).toBe(true)

    useData.getState().resolveCorrection({
      closingId: closing.id,
      approvedBy: 'Kelly Tew',
      role: 'ops',
      approve: true,
    })
    expect(actions()[0]).toBe('correction.approved')
    expect(useData.getState().alerts.some((a) => a.id === `correction-${closing.id}`)).toBe(false)
  })

  it('records an alert being read, and a bulk clear', () => {
    const unread = useData.getState().alerts.find((a) => !a.read)!
    useData.getState().markAlertRead(unread.id)
    expect(actions()[0]).toBe('alert.read')
    expect(useData.getState().alerts.find((a) => a.id === unread.id)?.read).toBe(true)

    useData.getState().markAllAlertsRead()
    expect(actions()[0]).toBe('alert.read_all')

    // Nothing left unread, so a second clear says nothing.
    const before = written().length
    useData.getState().markAllAlertsRead()
    expect(written()).toHaveLength(before)
  })
})

// ── Passwords ───────────────────────────────────────────────────────────────

describe('passwords in the log', () => {
  it('records a reset without ever writing the password down', async () => {
    signInAs(lb, 'davy')
    const r = await useData
      .getState()
      .setPassword({ actor: person('davy'), targetId: 'kim', password: 'kebaya-tanjung-417' })
    expect(r.ok).toBe(true)
    await useData.getState().sync()
    const entry = written().find((e) => e.action === 'password.reset')!

    expect(entry.actorName).toBe('Lim Davy')
    expect(entry.summary).toMatch(/Reset the password for Kim Lim/)
    expect(JSON.stringify(entry)).not.toContain('kebaya-tanjung-417')
    expect(entry.kind).toBe('password')
    // The store never holds the password; the backend does.
    expect(JSON.stringify(useData.getState().users)).not.toContain('kebaya-tanjung-417')
    expect(lb.passwordOf('kim')).toBe('kebaya-tanjung-417')
  })

  it('tells a self-change apart from a reset', async () => {
    signInAs(lb, 'kim')
    await useData
      .getState()
      .setPassword({ actor: person('kim'), targetId: 'kim', password: 'kebaya-tanjung-417' })
    // Kim cannot read the log; Davy can.
    signInAs(lb, 'davy')
    expect(written()[0].action).toBe('password.changed')
    expect(written()[0].summary).toBe('Changed their own password')
  })

  it('never lets a refused change reach the log', async () => {
    const before = written().length
    const r = await useData
      .getState()
      .setPassword({ actor: person('kelly'), targetId: 'chloe', password: 'kebaya-tanjung-417' })
    expect(r.ok).toBe(false)
    await useData.getState().sync()
    expect(written()).toHaveLength(before)
  })

  it('records a look-up of somebody’s password, and never the password', async () => {
    signInAs(lb, 'davy')
    const r = await useData.getState().revealPassword({ actor: person('davy'), targetId: 'kim' })
    expect(r.ok).toBe(true)
    expect(r.password).toBe(lb.passwordOf('kim'))
    await useData.getState().sync()
    const entry = written()[0]
    expect(entry.action).toBe('password.revealed')
    expect(entry.summary).toMatch(/Looked at the password for Kim Lim/)
    expect(JSON.stringify(entry)).not.toContain(r.password)
  })
})

// ── Sessions ────────────────────────────────────────────────────────────────

describe('sign-in in the log', () => {
  const refresh = async () => {
    // The log lines for a sign-in are written by the backend; pull them.
    await useData.getState().sync(true)
  }

  it('records the code being sent, then the sign-in, then the sign-out', async () => {
    signOutForTests()
    const kelly = person('kelly')

    const begun = await useAuth.getState().beginSignIn(kelly.username, startingPassword(kelly.username))
    expect(begun.ok).toBe(true)
    expect(begun.needsCode).toBe(true)
    // The masked address never gives the whole thing away.
    expect(begun.sentTo).toContain('@')
    expect(begun.sentTo).not.toBe(kelly.email)

    const code = lb.peekCode(useAuth.getState().pending!.token)!
    const done = await useAuth.getState().submitCode(code)
    expect(done.ok).toBe(true)
    await refresh()
    expect(actions()[0]).toBe('session.signed_in')
    expect(actions()).toContain('session.code_sent')

    await useAuth.getState().signOut()
    signInAs(lb, 'kelly')
    expect(actions()[0]).toBe('session.signed_out')
  })

  it('signs a promoter straight in on the password alone — no code', async () => {
    signOutForTests()
    const promoter = person('teokoknian')
    const result = await useAuth.getState().beginSignIn(promoter.username, startingPassword(promoter.username))

    expect(result.ok).toBe(true)
    expect(result.person?.id).toBe('teokoknian')
    expect(useAuth.getState().personId).toBe('teokoknian')
    expect(useAuth.getState().locationId).toBe('klia-t2')
    expect(useAuth.getState().pending).toBeNull()
    await refresh()
    expect(actions()).not.toContain('session.code_sent')
  })

  it('asks a promoter which outlet, where their town has more than one', async () => {
    signOutForTests()
    const danzel = person('danzeltan')
    expect(danzel.city).toBe('Kuala Lumpur')
    expect(storeChoicesFor(danzel)).toContain('parkson-pavilion')
    const result = await useAuth.getState().beginSignIn(danzel.username, startingPassword(danzel.username))
    expect(result.ok).toBe(true)
    expect(result.needsStore).toBe(true)
    expect(useAuth.getState().locationId).toBeNull()

    const chosen = await useAuth.getState().chooseStore('parkson-pavilion', 'Parkson Pavilion')
    expect(chosen.ok).toBe(true)
    expect(useAuth.getState().locationId).toBe('parkson-pavilion')
    // The log names the outlet, not its id.
    signInAs(lb, 'kelly')
    expect(written()[0].summary).toMatch(/working at Parkson Pavilion today/)
    signInAs(lb, 'danzeltan', 'parkson-pavilion')

    // An outlet in another town is refused, whatever the screen sent.
    const refused = await useAuth.getState().chooseStore('klia-t2')
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/your town/i)
  })

  it('puts a promoter whose town has one outlet straight at it', async () => {
    signOutForTests()
    const melaka = person('khookwoktsu')
    expect(melaka.city).toBe('Melaka')
    expect(storeChoicesFor(melaka)).toEqual(['melaka'])

    const result = await useAuth.getState().beginSignIn(melaka.username, startingPassword(melaka.username))
    expect(result.ok).toBe(true)
    // Nothing worth asking, so no picker.
    expect(result.needsStore).toBe(false)
    expect(useAuth.getState().locationId).toBe('melaka')
  })

  it('rotates a promoter between the outlets in their own town', async () => {
    // The point of the whole thing: the same person, two counters, one day.
    signInAs(lb, 'danzeltan', 'pavilion-5')
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }],
      countryCode: 'CN',
    })
    await settle()

    signInAs(lb, 'danzeltan', 'klcc-isetan')
    useData.getState().recordSale({
      locationId: 'klcc-isetan',
      lines: [{ skuId: 'mahsuri-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }],
      countryCode: 'CN',
    })
    await settle()

    // Each sale stayed at the outlet it was rung up at.
    signInAs(lb, 'kelly')
    const sales = useData.getState().audit.filter((e) => e.action === 'sale.recorded')
    expect(sales.map((e) => e.locationId).sort()).toEqual(['klcc-isetan', 'pavilion-5'])
  })

  it('signs Finance and the Warehouse straight in too', async () => {
    for (const id of ['siew-fang', 'an']) {
      signOutForTests()
      useAuth.setState({ token: null, personId: null, locationId: null, pending: null })
      const p = person(id)
      const result = await useAuth.getState().beginSignIn(p.username, startingPassword(p.username))
      expect(result.person?.id, id).toBe(id)
    }
  })

  it('records a refusal without recording the password', async () => {
    signOutForTests()
    const result = await useAuth.getState().beginSignIn('kellytew', 'not-the-password-1')
    expect(result.ok).toBe(false)
    signInAs(lb, 'kelly')
    const entry = written()[0]
    expect(entry.action).toBe('session.sign_in_failed')
    expect(JSON.stringify(entry)).not.toContain('not-the-password-1')
  })

  it('says the same thing whether the username or the password was wrong', async () => {
    signOutForTests()
    const nobody = await useAuth.getState().beginSignIn('nosuchperson', 'whatever-123')
    const wrongPassword = await useAuth.getState().beginSignIn('kellytew', 'whatever-123')
    expect(nobody.error).toBe(wrongPassword.error)
  })

  it('will not sign leadership in on the password alone', async () => {
    signOutForTests()
    const kelly = person('kelly')
    await useAuth.getState().beginSignIn(kelly.username, startingPassword(kelly.username))
    // The password was right, but nobody is signed in until the code is.
    expect(useAuth.getState().personId).toBeNull()
    expect(useAuth.getState().pending).not.toBeNull()
  })

  it('refuses a wrong code', async () => {
    signOutForTests()
    const kelly = person('kelly')
    await useAuth.getState().beginSignIn(kelly.username, startingPassword(kelly.username))
    const real = lb.peekCode(useAuth.getState().pending!.token)!
    const wrong = real === '000000' ? '111111' : '000000'
    expect((await useAuth.getState().submitCode(wrong)).ok).toBe(false)
    expect(useAuth.getState().personId).toBeNull()
  })

  it('holds an account after five wrong passwords', async () => {
    signOutForTests()
    for (let i = 0; i < 5; i++) await useAuth.getState().beginSignIn('kimlim', `wrong-${i}-000000`)
    const result = await useAuth.getState().beginSignIn('kimlim', startingPassword('kimlim'))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Too many attempts/)
  })

  it('will not let a disabled login through', async () => {
    useData.getState().setUserActive('kim', false)
    await settle()
    signOutForTests()
    const result = await useAuth.getState().beginSignIn('kimlim', startingPassword('kimlim'))
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
    signInAs(lb, 'chloe')
    useData.getState().setTarget('genting', '2026-08', 90_000)
    expect(written()[0].actorName).toBe('Chloe Chock')
    expect(written()[0].actorRole).toBe('pa')
  })

  it('says so plainly when nobody is signed in', () => {
    signOutForTests()
    useData.getState().setTarget('genting', '2026-08', 90_000)
    expect(written()[0].actorId).toBe('unknown')
  })

  it('files a line against whoever is signed in, whatever the browser claims', async () => {
    // A screen could compose a line naming somebody else. The server does not
    // take its word for it — the log is evidence, and evidence that can be
    // written in another person's name is worthless.
    signInAs(lb, 'teokoknian')
    const token = lb.openSessionForTests('teokoknian', 'klia-t2')
    const forged = {
      id: 'au-forged-1',
      at: new Date().toISOString(),
      actorId: 'davy',
      actorName: 'Lim Davy',
      actorRole: 'md' as const,
      kind: 'order' as const,
      action: 'order.approved',
      summary: 'Approved PO-9999',
    }
    const r = await lb.put(token, [{ kind: 'audit', id: forged.id, doc: forged }])
    expect(r.ok).toBe(true)

    signInAs(lb, 'davy')
    const stored = useData.getState().audit.find((e) => e.id === 'au-forged-1')!
    expect(stored.actorId).toBe('teokoknian')
    expect(stored.actorName).toBe('Teo Kok Nian')
    expect(stored.actorRole).toBe('promoter')
    // What happened is still the app's to say; who did it is not.
    expect(stored.summary).toBe('Approved PO-9999')
  })

  it('never lets a line be edited or removed', async () => {
    useData.getState().setTarget('genting', '2026-08', 90_000)
    await settle()
    const entry = written()[0]
    const r = await lb.remove(lb.openSessionForTests('davy'), 'audit', [entry.id])
    expect(r.ok).toBe(false)
    const again = await lb.put(lb.openSessionForTests('davy'), [
      { kind: 'audit', id: entry.id, doc: { ...entry, summary: 'rewritten' } },
    ])
    expect(again.ok).toBe(true)
    const stored = lb.allDocs().find((d) => d.kind === 'audit' && d.id === entry.id)!.doc as { summary: string }
    expect(stored.summary).not.toBe('rewritten')
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

  it('starts with the sample history in a local build, so the screen is never empty', () => {
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

  it('never sends the log to a promoter', () => {
    signInAs(lb, 'teokoknian')
    expect(useData.getState().audit).toHaveLength(0)
  })
})

// ── One customer, several things ────────────────────────────────────────────

describe('recording a whole basket', () => {
  it('writes every line with the same country, sale and person, and one log entry', () => {
    const before = written().length
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [
        { skuId: 'orchid-retail', qty: 1 },
        { skuId: 'three-wishes-travel', qty: 2 },
        { skuId: 'mahsuri-retail', qty: 1 },
      ],
      countryCode: 'MY',
      segment: 'chinese',
    })

    const lines = useData.getState().liveLines['pavilion-5'].slice(-3)
    expect(lines.every((l) => l.countryCode === 'MY')).toBe(true)
    expect(lines.every((l) => l.segment === 'chinese')).toBe(true)
    expect(new Set(lines.map((l) => l.saleId)).size).toBe(1)
    expect(lines.every((l) => l.byName === 'Kelly Tew')).toBe(true)
    expect(lines.every((l) => l.day === '2026-08-21')).toBe(true)

    // Three products, one customer, one line in the log.
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
      lines: [{ skuId: 'orchid-retail', qty: 1, priceTier: 'retail', unitPriceMYR: 238 }],
      countryCode: 'SG',
    })
    const live = useData.getState().liveLines['pavilion-5']
    expect(live[live.length - 1].priceTier).toBe('retail')
    expect(live[live.length - 1].unitPriceMYR).toBe(238)
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

  it('shows a sale to a colleague at the same store, and to nobody at another', async () => {
    signInAs(lb, 'danzeltan', 'pavilion-5')
    useData.getState().recordSale({
      locationId: 'pavilion-5',
      lines: [{ skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }],
      countryCode: 'CN',
    })
    await settle()

    signInAs(lb, 'leekwansern', 'pavilion-5')
    const colleague = useData.getState().liveLines['pavilion-5'] ?? []
    expect(colleague.some((l) => l.byName === 'Danzel Tan')).toBe(true)

    signInAs(lb, 'teokoknian')
    expect(useData.getState().liveLines['pavilion-5']).toBeUndefined()
  })
})
