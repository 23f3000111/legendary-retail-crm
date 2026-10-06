import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { settle, signInAs, startFixture, written } from './testing'
import { selectClosingOutOfStep, selectStock } from './selectors'
import { figuresOf } from '../lib/changes'
import { DEMO_TODAY } from '../data/seed'
import type { LocalBackend } from '../api/local'
import type { Closing, ClosingFigures, PurchaseOrder, SaleLine } from '../data/types'

/**
 * Everything put in can be changed, without typing it in again (client, 29
 * September) — and the one control the client set at the start still holds:
 * an earlier day's closing changes only when Kelly or Davy approves (Q19).
 *
 * These go through the store against the local backend, which keeps the same
 * rules as the server, so a refusal here is the refusal a phone would get.
 */

let lb: LocalBackend
const today = DEMO_TODAY
const yesterday = '2026-08-20'

const closing = (id: string): Closing => {
  const c = useData.getState().closings.find((x) => x.id === id)
  if (!c) throw new Error(`no closing ${id}`)
  return c
}
const backendDoc = <T,>(kind: string, id: string): T | undefined =>
  lb.allDocs().find((d) => d.kind === kind && d.id === id && !d.deleted)?.doc as T | undefined
const lastAction = () => written()[0]
const atKlia = () => signInAs(lb, 'teokoknian', 'klia-t2')

/** A sale rung up at KLIA T2 today, and its lines. */
const ringUp = (lines: SaleLine[], countryCode = 'CN'): SaleLine[] => {
  useData.getState().recordSale({ locationId: 'klia-t2', lines, countryCode })
  const all = useData.getState().liveLines['klia-t2']
  const saleId = all[all.length - 1].saleId
  return all.filter((l) => l.saleId === saleId)
}

beforeEach(() => {
  lb = startFixture('davy')
})

describe('a sale, changed at the counter', () => {
  it('changes the quantity, the price, the customer, and adds an item — in one go', async () => {
    atKlia()
    const [line] = ringUp([{ skuId: 'orchid-retail', qty: 2, priceTier: 'promotion', unitPriceMYR: 188 }])

    const result = useData.getState().updateSale({
      saleId: line.saleId!,
      lines: [
        { ...line, qty: 1, priceTier: 'retail', unitPriceMYR: 238 },
        { skuId: 'violet-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 },
      ],
      countryCode: 'SG',
    })
    expect(result.ok).toBe(true)

    const sale = useData.getState().liveLines['klia-t2'].filter((l) => l.saleId === line.saleId)
    expect(sale).toHaveLength(2)
    expect(sale.every((l) => l.countryCode === 'SG')).toBe(true)
    expect(sale.find((l) => l.id === line.id)).toMatchObject({ qty: 1, unitPriceMYR: 238, by: 'teokoknian' })
    expect(sale.every((l) => l.editedBy === 'Teo Kok Nian')).toBe(true)

    expect(lastAction().action).toBe('sale.edited')
    expect(lastAction().detail).toMatch(/Orchid · 30ml: 2 → 1/)
    expect(lastAction().detail).toMatch(/Added 1 × Violet · 30ml/)
    expect(lastAction().detail).toMatch(/China → Singapore/)

    await settle()
    expect(backendDoc<SaleLine>('sale_line', line.id!)?.qty).toBe(1)
  })

  it('takes a line off, and keeps the rest', async () => {
    atKlia()
    const lines = ringUp([
      { skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 },
      { skuId: 'man-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 },
    ])
    useData.getState().updateSale({ saleId: lines[0].saleId!, lines: [lines[0]], countryCode: 'CN' })
    await settle()
    expect(backendDoc('sale_line', lines[1].id!)).toBeUndefined()
    expect(backendDoc('sale_line', lines[0].id!)).toBeDefined()
    expect(lastAction().detail).toBe('Took off 1 × Man · 50ml')
  })

  it('rings a vial up free, and counts it as a unit sold at RM 0', () => {
    atKlia()
    const [line] = ringUp([{ skuId: 'orchid-vial', qty: 2, priceTier: 'foc', unitPriceMYR: 0 }])
    expect(line).toMatchObject({ priceTier: 'foc', unitPriceMYR: 0, qty: 2 })
    expect(lastAction().summary).toMatch(/free of charge/)
  })

  it('takes RM 0 as an "Other" price — something given away — but not a missing one', () => {
    atKlia()
    const [line] = ringUp([{ skuId: 'orchid-retail', qty: 1, priceTier: 'other', unitPriceMYR: 0 }])
    expect(line.unitPriceMYR).toBe(0)

    const free = useData.getState().updateSale({
      saleId: line.saleId!,
      lines: [{ ...line, qty: 2, unitPriceMYR: 0 }],
      countryCode: 'CN',
    })
    expect(free.ok).toBe(true)

    const missing = useData.getState().updateSale({
      saleId: line.saleId!,
      lines: [{ ...line, unitPriceMYR: undefined }],
      countryCode: 'CN',
    })
    expect(missing.ok).toBe(false)
    expect(missing.error).toMatch(/went for/)
  })

  it('will not empty a sale — that is Delete sale', () => {
    atKlia()
    const [line] = ringUp([{ skuId: 'orchid-retail', qty: 1 }])
    const result = useData.getState().updateSale({ saleId: line.saleId!, lines: [] })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/delete the sale/i)
  })

  it('says so when the closing no longer matches, until the closing is brought up to date', () => {
    atKlia()
    ringUp([{ skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }])
    // Filed with today's sales as they are now…
    const filed = closing(`klia-t2-${today}`)
    const live = useData.getState().liveLines['klia-t2']
    const figures: ClosingFigures = { ...figuresOf(filed), lines: live, revenueMYR: 188, tender: { cash: 188, ewallet: 0, card: 0 } }
    expect(useData.getState().editClosing({ closingId: filed.id, figures }).ok).toBe(true)
    expect(selectClosingOutOfStep(useData.getState(), 'klia-t2')).toBe(false)

    // …then one more customer.
    ringUp([{ skuId: 'violet-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188 }])
    expect(selectClosingOutOfStep(useData.getState(), 'klia-t2')).toBe(true)
  })
})

describe('today’s closing, changed by the store', () => {
  it('saves at once, keeps who filed it, and logs before and after', async () => {
    atKlia()
    const filed = closing(`klia-t2-${today}`)
    const figures = { ...figuresOf(filed), tender: { ...filed.tender!, cash: 500, card: filed.tender!.card + filed.tender!.cash - 500 } }

    expect(useData.getState().editClosing({ closingId: filed.id, figures }).ok).toBe(true)
    const now = closing(filed.id)
    expect(now.tender?.cash).toBe(500)
    expect(now.submittedBy).toBe(filed.submittedBy)
    expect(now.editedBy).toBe('Teo Kok Nian')
    expect(lastAction().action).toBe('closing.edited')
    expect(lastAction().detail).toContain(`Cash RM ${filed.tender!.cash} → RM 500`)

    await settle()
    expect(backendDoc<Closing>('closing', filed.id)?.tender?.cash).toBe(500)
  })

  it('refuses a save that changes nothing', () => {
    atKlia()
    const filed = closing(`klia-t2-${today}`)
    const result = useData.getState().editClosing({ closingId: filed.id, figures: figuresOf(filed) })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/nothing/i)
  })
})

describe('an earlier day, which Kelly approves', () => {
  const ask = (reason = 'Typed the cash wrong') => {
    const filed = closing(`klia-t2-${yesterday}`)
    const cash = filed.tender!.cash - 61
    const figures: ClosingFigures = {
      ...figuresOf(filed),
      tender: { ...filed.tender!, cash, card: filed.tender!.card + 61 },
      stockCount: filed.stockCount.map((s, i) => (i === 0 ? { ...s, counted: s.counted + 1 } : s)),
    }
    return { filed, figures, result: useData.getState().requestCorrection({ closingId: filed.id, figures, reason }) }
  }

  it('cannot be changed outright by the store — not in the app, not on the server', async () => {
    atKlia()
    const filed = closing(`klia-t2-${yesterday}`)
    const tampered = { ...figuresOf(filed), revenueMYR: 1 }
    const viaApp = useData.getState().editClosing({ closingId: filed.id, figures: tampered })
    expect(viaApp.ok).toBe(false)
    expect(viaApp.error).toMatch(/Kelly/)

    const token = lb.openSessionForTests('teokoknian', 'klia-t2')
    const direct = lb.putSync(token, [
      { kind: 'closing', id: filed.id, locationId: 'klia-t2', day: yesterday, doc: { ...filed, revenueMYR: 1 } },
    ])
    expect(direct.ok).toBe(false)
    expect(direct.error).toMatch(/asking Kelly/)

    const deleted = lb.removeSync(token, 'closing', [filed.id])
    expect(deleted.ok).toBe(false)
    expect(backendDoc<Closing>('closing', filed.id)?.revenueMYR).toBe(filed.revenueMYR)
  })

  it('changes nothing until approved — then exactly what was asked', async () => {
    atKlia()
    const { filed, figures, result } = ask()
    expect(result.ok).toBe(true)

    const waiting = closing(filed.id)
    expect(waiting.tender).toEqual(filed.tender)
    expect(waiting.correction?.status).toBe('pending')
    expect(waiting.correction?.changes).toContain(`Cash RM ${filed.tender!.cash} → RM ${figures.tender!.cash}`)
    expect(useData.getState().alerts.some((a) => a.id === `correction-${filed.id}`)).toBe(true)
    expect(lastAction().action).toBe('correction.requested')

    await settle()
    // The server took the request: only the correction changed.
    expect(backendDoc<Closing>('closing', filed.id)?.correction?.status).toBe('pending')
    expect(useData.getState().lastError).toBeNull()

    signInAs(lb, 'kelly')
    const decided = useData.getState().resolveCorrection({
      closingId: filed.id,
      approvedBy: 'Kelly Tew',
      role: 'ops',
      approve: true,
    })
    expect(decided.ok).toBe(true)
    const corrected = closing(filed.id)
    expect(corrected.tender?.cash).toBe(figures.tender!.cash)
    expect(corrected.stockCount[0].counted).toBe(filed.stockCount[0].counted + 1)
    expect(corrected.correction?.status).toBe('approved')
    expect(lastAction().action).toBe('correction.approved')
    expect(lastAction().detail).toContain('Cash RM')
    expect(useData.getState().alerts.some((a) => a.id === `correction-${filed.id}`)).toBe(false)

    await settle()
    expect(backendDoc<Closing>('closing', filed.id)?.tender?.cash).toBe(figures.tender!.cash)
  })

  it('stays as filed when Kelly turns it down, with her reason', async () => {
    atKlia()
    const { filed } = ask()
    signInAs(lb, 'kelly')
    useData.getState().resolveCorrection({
      closingId: filed.id,
      approvedBy: 'Kelly Tew',
      role: 'ops',
      approve: false,
      note: 'The slip says otherwise',
    })
    const after = closing(filed.id)
    expect(after.tender).toEqual(filed.tender)
    expect(after.correction).toMatchObject({ status: 'rejected', note: 'The slip says otherwise' })
    expect(lastAction().detail).toMatch(/The slip says otherwise/)
  })

  it('can be asked again, or taken back, while it waits', async () => {
    atKlia()
    const { filed } = ask('First go')
    const again = ask('Second go')
    expect(again.result.ok).toBe(true)
    expect(closing(filed.id).correction?.reason).toBe('Second go')

    expect(useData.getState().withdrawCorrection(filed.id).ok).toBe(true)
    expect(closing(filed.id).correction).toBeUndefined()
    expect(lastAction().action).toBe('correction.withdrawn')
    await settle()
    expect(backendDoc<Closing>('closing', filed.id)?.correction).toBeUndefined()
    expect(useData.getState().lastError).toBeNull()
  })

  it('cannot be approved by the store that asked, even by writing to the server', () => {
    atKlia()
    const { filed } = ask()
    const waiting = closing(filed.id)
    const token = lb.openSessionForTests('teokoknian', 'klia-t2')
    const forged = lb.putSync(token, [
      {
        kind: 'closing',
        id: filed.id,
        locationId: 'klia-t2',
        day: yesterday,
        doc: { ...waiting, correction: { ...waiting.correction!, status: 'approved' } },
      },
    ])
    expect(forged.ok).toBe(false)
    expect(forged.error).toMatch(/Kelly or Davy/)
  })

  it('is too late after three days', () => {
    atKlia()
    const old = closing('klia-t2-2026-08-17')
    const result = useData.getState().requestCorrection({
      closingId: old.id,
      figures: { ...figuresOf(old), tender: { ...old.tender!, cash: 1 } },
      reason: 'Late',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/3 days/)
  })
})

describe('Kelly or Davy changing a closing', () => {
  it('saves any day at once, and the sale records follow the closing', async () => {
    // Today's KLIA closing, filed with a counter sale in it.
    atKlia()
    const [line] = ringUp([{ skuId: 'orchid-retail', qty: 2, priceTier: 'promotion', unitPriceMYR: 188 }])
    const filed = closing(`klia-t2-${today}`)
    useData.getState().editClosing({
      closingId: filed.id,
      figures: { ...figuresOf(filed), lines: [line], revenueMYR: 376, tender: { cash: 376, ewallet: 0, card: 0 } },
    })
    await settle()

    signInAs(lb, 'kelly')
    const now = closing(filed.id)
    const result = useData.getState().editClosing({
      closingId: filed.id,
      figures: { ...figuresOf(now), lines: [{ ...line, qty: 1 }], revenueMYR: 188, tender: { cash: 188, ewallet: 0, card: 0 } },
    })
    expect(result.ok).toBe(true)
    expect(closing(filed.id).editedBy).toBe('Kelly Tew')
    await settle()
    expect(backendDoc<SaleLine>('sale_line', line.id!)?.qty).toBe(1)
  })

  it('is refused while a correction on that day waits for a decision', () => {
    atKlia()
    const filed = closing(`klia-t2-${yesterday}`)
    useData.getState().requestCorrection({
      closingId: filed.id,
      figures: { ...figuresOf(filed), tender: { ...filed.tender!, cash: 1 } },
      reason: 'x',
    })
    signInAs(lb, 'kelly')
    const result = useData.getState().editClosing({
      closingId: filed.id,
      figures: { ...figuresOf(closing(filed.id)), tender: { ...filed.tender!, cash: 2 } },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Approve or reject/)
  })
})

describe('an order, changed', () => {
  const raise = (): PurchaseOrder => {
    const po: PurchaseOrder = {
      id: 'PO-TEST-EDIT',
      locationId: 'klia-t2',
      createdBy: 'Teo Kok Nian',
      createdAt: new Date().toISOString(),
      priority: 'standard',
      notes: '',
      status: 'submitted',
      lines: [
        { skuId: 'orchid-retail', qtyRequested: 12, qtyApproved: null, qtyShipped: null },
        { skuId: 'violet-retail', qtyRequested: 12, qtyApproved: null, qtyShipped: null },
      ],
      events: [],
    }
    useData.getState().createPurchaseOrder(po)
    return po
  }
  const order = () => useData.getState().purchaseOrders.find((p) => p.id === 'PO-TEST-EDIT')!

  it('while it waits, after a no, and not once approved', async () => {
    atKlia()
    raise()
    const edited = useData.getState().editPurchaseOrder({
      poId: 'PO-TEST-EDIT',
      lines: [{ skuId: 'orchid-retail', qty: 24 }],
      notes: 'Tour group',
      priority: 'urgent',
    })
    expect(edited.ok).toBe(true)
    expect(order().lines).toHaveLength(1)
    expect(order()).toMatchObject({ priority: 'urgent', notes: 'Tour group', editedBy: 'Teo Kok Nian' })
    expect(lastAction().action).toBe('order.edited')
    expect(lastAction().detail).toContain('Orchid · 30ml: 12 → 24')
    expect(lastAction().detail).toContain('Took off Violet · 30ml (12)')

    signInAs(lb, 'kelly')
    useData.getState().transitionPo({ poId: 'PO-TEST-EDIT', to: 'rejected', actor: 'Kelly Tew', role: 'ops', note: 'Too many' })

    atKlia()
    const resent = useData.getState().editPurchaseOrder({
      poId: 'PO-TEST-EDIT',
      lines: [{ skuId: 'orchid-retail', qty: 12 }],
      notes: 'Tour group',
      priority: 'urgent',
    })
    expect(resent.ok).toBe(true)
    expect(order().status).toBe('submitted')
    expect(order().events.slice(-1)[0]).toMatchObject({ status: 'submitted', note: 'Changed and sent again' })
    expect(lastAction().action).toBe('order.resubmitted')

    signInAs(lb, 'kelly')
    useData.getState().transitionPo({ poId: 'PO-TEST-EDIT', to: 'approved', actor: 'Kelly Tew', role: 'ops' })
    atKlia()
    const late = useData.getState().editPurchaseOrder({
      poId: 'PO-TEST-EDIT',
      lines: [{ skuId: 'orchid-retail', qty: 48 }],
      notes: '',
      priority: 'standard',
    })
    expect(late.ok).toBe(false)
    expect(late.error).toMatch(/approved/)
  })

  it('refuses a line with no quantity', () => {
    atKlia()
    raise()
    const result = useData.getState().editPurchaseOrder({
      poId: 'PO-TEST-EDIT',
      lines: [{ skuId: 'orchid-retail', qty: 0 }],
      notes: '',
      priority: 'standard',
    })
    expect(result.ok).toBe(false)
  })

  it('can be packed short by the warehouse', () => {
    atKlia()
    raise()
    signInAs(lb, 'kelly')
    useData.getState().transitionPo({ poId: 'PO-TEST-EDIT', to: 'approved', actor: 'Kelly Tew', role: 'ops' })
    signInAs(lb, 'an')
    const packed = useData.getState().transitionPo({
      poId: 'PO-TEST-EDIT',
      to: 'packed',
      actor: 'Xi An',
      role: 'warehouse',
      packedQty: { 'orchid-retail': 6, 'violet-retail': 12 },
    })
    expect(packed.ok).toBe(true)
    expect(order().lines.map((l) => l.qtyShipped)).toEqual([6, 12])
    expect(lastAction().detail).toBe('1 line packed short')
  })
})

describe('the shelf a day starts from', () => {
  it('is the count from the closing before it, not the day’s own', () => {
    const data = useData.getState()
    const before = closing(`klia-t2-${yesterday}`)
    const own = closing(`klia-t2-${today}`)
    const opening = selectStock(data, 'klia-t2', today).find((r) => r.skuId === 'orchid-retail')!
    const latest = selectStock(data, 'klia-t2').find((r) => r.skuId === 'orchid-retail')!
    expect(opening.onHand).toBe(before.stockCount.find((s) => s.skuId === 'orchid-retail')!.counted)
    expect(latest.onHand).toBe(own.stockCount.find((s) => s.skuId === 'orchid-retail')!.counted)
  })
})
