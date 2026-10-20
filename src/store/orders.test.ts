import { beforeEach, describe, expect, it } from 'vitest'
import { useData } from './useData'
import { settle, signInAs, startFixture, written } from './testing'
import { availableTransitions, isOpen, seenBy } from '../lib/po-machine'
import type { LocalBackend } from '../api/local'
import type { PurchaseOrder } from '../data/types'

/**
 * Client, 20 October: a promoter can make an order whenever it is needed, not
 * only when closing the day — and save it as a draft to send later.
 */

let lb: LocalBackend
beforeEach(() => {
  lb = startFixture('teokoknian', undefined, 'klia-t2')
})

const draft = (id = 'PO-TEST-DRAFT', locationId = 'klia-t2'): PurchaseOrder => ({
  id,
  locationId,
  createdBy: 'Teo Kok Nian',
  createdAt: '2026-10-18T03:00:00.000Z',
  priority: 'standard',
  notes: '',
  status: 'draft',
  lines: [
    { skuId: 'violet-retail', qtyRequested: 12, qtyApproved: null, qtyShipped: null },
    { skuId: 'orchid-retail', qtyRequested: 24, qtyApproved: null, qtyShipped: null },
  ],
  events: [{ status: 'draft', actor: 'Teo Kok Nian', role: 'promoter', at: '2026-10-18T03:00:00.000Z' }],
})
const order = (id = 'PO-TEST-DRAFT') => useData.getState().purchaseOrders.find((p) => p.id === id)

describe('a draft order', () => {
  it('is saved at the store, in the order its lines were put in, and logged as a draft', () => {
    useData.getState().createPurchaseOrder(draft())
    expect(order()?.status).toBe('draft')
    expect(order()?.lines.map((l) => l.skuId)).toEqual(['violet-retail', 'orchid-retail'])
    expect(written()[0]).toMatchObject({ action: 'order.drafted' })
    expect(written()[0].summary).toMatch(/^Saved a draft order PO-TEST-DRAFT for KLIA T2/)
  })

  it('stays out of head office’s way until it is sent', () => {
    const d = draft()
    // Not in flight, nothing for Kelly to do, and not in head office's lists.
    expect(isOpen(d)).toBe(false)
    expect(availableTransitions(d, 'ops')).toEqual([])
    expect(seenBy(d, 'ops')).toBe(false)
    expect(seenBy(d, 'md')).toBe(false)
    expect(seenBy(d, 'promoter')).toBe(true)
    expect(seenBy({ ...d, status: 'submitted' }, 'ops')).toBe(true)
  })

  it('can be changed, then sent to Kelly — and counts as raised when it is sent', () => {
    useData.getState().createPurchaseOrder(draft())
    const changed = useData.getState().editPurchaseOrder({
      poId: 'PO-TEST-DRAFT',
      lines: [
        { skuId: 'orchid-retail', qty: 24 },
        { skuId: 'violet-retail', qty: 12 },
      ],
      notes: '',
      priority: 'standard',
    })
    expect(changed.ok).toBe(true)
    expect(written()[0].detail).toBe('Changed the order of the items')

    const sent = useData.getState().transitionPo({
      poId: 'PO-TEST-DRAFT',
      to: 'submitted',
      actor: 'Teo Kok Nian',
      role: 'promoter',
    })
    expect(sent.ok).toBe(true)
    expect(order()?.status).toBe('submitted')
    expect(order()!.createdAt > '2026-10-18T03:00:00.000Z').toBe(true)
    expect(isOpen(order()!)).toBe(true)
    expect(availableTransitions(order()!, 'ops').map((t) => t.to)).toContain('approved')
  })

  it('can be deleted; an order that has been sent cannot', async () => {
    useData.getState().createPurchaseOrder(draft())
    expect(useData.getState().deleteDraftOrder('PO-TEST-DRAFT').ok).toBe(true)
    expect(order()).toBeUndefined()
    expect(written()[0]).toMatchObject({ action: 'order.draft_deleted' })
    await settle()
    expect(lb.allDocs().find((d) => d.kind === 'po' && d.id === 'PO-TEST-DRAFT')?.deleted).toBe(true)

    useData.getState().createPurchaseOrder({ ...draft('PO-TEST-SENT'), status: 'submitted' })
    const refused = useData.getState().deleteDraftOrder('PO-TEST-SENT')
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/sent/)
  })

  it('belongs to its store: another store cannot change or delete it', () => {
    useData.getState().createPurchaseOrder(draft())
    signInAs(lb, 'teokoknian', 'pavilion-5')
    expect(
      useData.getState().editPurchaseOrder({
        poId: 'PO-TEST-DRAFT',
        lines: [{ skuId: 'orchid-retail', qty: 1 }],
        notes: '',
        priority: 'standard',
      }).ok,
    ).toBe(false)
    expect(useData.getState().deleteDraftOrder('PO-TEST-DRAFT').ok).toBe(false)
  })

  it('is the only order the server lets anyone delete', () => {
    const token = lb.openSessionForTests('teokoknian', 'klia-t2')
    const put = (po: PurchaseOrder) =>
      lb.putSync(token, [{ kind: 'po', id: po.id, locationId: po.locationId, doc: po }])
    put(draft('PO-TEST-A'))
    put({ ...draft('PO-TEST-B'), status: 'submitted' })
    expect(lb.removeSync(token, 'po', ['PO-TEST-A']).ok).toBe(true)
    const kept = lb.removeSync(token, 'po', ['PO-TEST-B'])
    expect(kept.ok).toBe(false)
    expect(kept.error).toMatch(/sent/)

    // Nor can a sent order be turned back into a draft to get round that —
    // or approved by the store that asked for it.
    expect(put({ ...draft('PO-TEST-B'), status: 'draft' }).error).toMatch(/cannot move/)
    expect(put({ ...draft('PO-TEST-B'), status: 'approved' }).error).toMatch(/cannot move/)
    expect(lb.removeSync(token, 'po', ['PO-TEST-B']).ok).toBe(false)
  })
})
