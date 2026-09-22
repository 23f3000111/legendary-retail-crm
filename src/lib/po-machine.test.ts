import { describe, it, expect } from 'vitest'
import {
  availableTransitions,
  awaitingFinance,
  canClearAccounts,
  canTransition,
  chainProgress,
  effectiveQty,
  isOpen,
  isPartial,
  STATUS_CHAIN,
  TRANSITIONS,
} from './po-machine'
import { PO_STATUSES, type PurchaseOrder } from '../data/types'
import type { Role } from '../data/people'

const order = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-2026-0001',
  locationId: 'pavilion-5',
  createdBy: 'Pavilion KL promoter',
  createdAt: '2026-08-20T20:00:00+08:00',
  priority: 'standard',
  notes: '',
  status: 'submitted',
  lines: [{ skuId: 'orchid-retail', qtyRequested: 24, qtyApproved: null, qtyShipped: null }],
  events: [],
  ...overrides,
})

describe('the chain the client confirmed', () => {
  it('walks store → Kelly → warehouse → store, with no wait on Finance', () => {
    const path: [string, string, Role][] = [
      ['draft', 'submitted', 'promoter'],
      ['submitted', 'approved', 'ops'],
      ['approved', 'packed', 'warehouse'],
      ['packed', 'in_transit', 'warehouse'],
      ['in_transit', 'received', 'promoter'],
    ]
    for (const [from, to, role] of path) {
      expect(canTransition(from as never, to as never, role), `${role}: ${from} → ${to}`).toBe(true)
    }
  })

  it('lets Davy approve when Kelly is away', () => {
    expect(canTransition('submitted', 'approved', 'md')).toBe(true)
  })

  // Third revision: Finance and the warehouse receive an approved order at
  // the same time. Finance's clearance is recorded beside the chain.
  it('lets Finance clear an approved order whether or not it has been packed', () => {
    expect(canClearAccounts(order({ status: 'approved' }), 'finance')).toBe(true)
    expect(canClearAccounts(order({ status: 'packed' }), 'finance')).toBe(true)
    expect(canClearAccounts(order({ status: 'received' }), 'finance')).toBe(true)
    expect(canClearAccounts(order({ status: 'submitted' }), 'finance')).toBe(false)
    expect(canClearAccounts(order({ status: 'rejected' }), 'finance')).toBe(false)
    expect(
      canClearAccounts(order({ status: 'approved', financeClearedAt: '2026-09-22T10:00:00+08:00' }), 'finance'),
    ).toBe(false)
  })

  it('keeps clearance to Finance', () => {
    for (const role of ['ops', 'md', 'warehouse', 'pa', 'director', 'promoter', 'it'] as Role[]) {
      expect(canClearAccounts(order({ status: 'approved' }), role), role).toBe(false)
    }
  })

  it('queues an approved order for Finance until it is cleared', () => {
    expect(awaitingFinance(order({ status: 'approved' }))).toBe(true)
    expect(awaitingFinance(order({ status: 'in_transit' }))).toBe(true)
    expect(awaitingFinance(order({ status: 'submitted' }))).toBe(false)
    expect(awaitingFinance(order({ status: 'packed', financeClearedAt: '2026-09-22T10:00:00+08:00' }))).toBe(false)
  })

  // The hierarchy chart gives "approves changes and PO" to the Managing
  // Director and the Operational Manager only. Finance clears an approved
  // order for picking, which is a different thing.
  it('keeps approval away from everybody else', () => {
    for (const role of ['finance', 'warehouse', 'pa', 'director', 'promoter', 'it'] as Role[]) {
      expect(canTransition('submitted', 'approved', role), role).toBe(false)
    }
  })
})

describe('illegal moves', () => {
  it('refuses to skip a step', () => {
    expect(canTransition('submitted', 'packed', 'warehouse')).toBe(false)
    expect(canTransition('approved', 'in_transit', 'warehouse')).toBe(false)
    expect(canTransition('draft', 'received', 'promoter')).toBe(false)
  })

  it('refuses to run the chain backwards', () => {
    expect(canTransition('approved', 'submitted', 'ops')).toBe(false)
    expect(canTransition('received', 'in_transit', 'promoter')).toBe(false)
  })

  it('treats received and rejected as terminal', () => {
    for (const to of PO_STATUSES) {
      expect(canTransition('received', to, 'md')).toBe(false)
      expect(canTransition('rejected', to, 'ops')).toBe(false)
    }
  })
})

describe('who may do what', () => {
  it('stops a role making another role’s move', () => {
    expect(canTransition('submitted', 'approved', 'promoter')).toBe(false)
    expect(canTransition('approved', 'packed', 'finance')).toBe(false)
    expect(canTransition('approved', 'packed', 'ops')).toBe(false)
  })

  it('gives the founder no move anywhere — he observes only', () => {
    for (const status of PO_STATUSES) {
      expect(availableTransitions(order({ status }), 'director')).toEqual([])
    }
  })

  it('gives Chloe and IT no order moves either', () => {
    for (const status of PO_STATUSES) {
      expect(availableTransitions(order({ status }), 'pa')).toEqual([])
      expect(availableTransitions(order({ status }), 'it')).toEqual([])
    }
  })

  it('offers Kelly exactly approve and reject on a submitted order', () => {
    const moves = availableTransitions(order({ status: 'submitted' }), 'ops')
    expect(moves.map((m) => m.to).sort()).toEqual(['approved', 'rejected'])
  })

  it('requires a note only on rejection', () => {
    expect(TRANSITIONS.submitted.find((t) => t.to === 'rejected')?.requiresNote).toBe(true)
    expect(TRANSITIONS.submitted.find((t) => t.to === 'approved')?.requiresNote).toBeUndefined()
  })
})

describe('derived state', () => {
  it('reports open for anything mid-chain', () => {
    expect(isOpen(order({ status: 'submitted' }))).toBe(true)
    expect(isOpen(order({ status: 'in_transit' }))).toBe(true)
    expect(isOpen(order({ status: 'received' }))).toBe(false)
    expect(isOpen(order({ status: 'rejected' }))).toBe(false)
  })

  it('advances progress monotonically and ends at 1', () => {
    const values = STATUS_CHAIN.map(chainProgress)
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
    expect(values[values.length - 1]).toBe(1)
  })

  it('stops the progress rail dead on rejection', () => {
    expect(chainProgress('rejected')).toBe(0)
  })

  it('prefers shipped, then approved, then requested', () => {
    expect(effectiveQty({ qtyRequested: 24, qtyApproved: 12, qtyShipped: 8 })).toBe(8)
    expect(effectiveQty({ qtyRequested: 24, qtyApproved: 12, qtyShipped: null })).toBe(12)
    expect(effectiveQty({ qtyRequested: 24, qtyApproved: null, qtyShipped: null })).toBe(24)
  })

  it('flags a trimmed line only when it was actually trimmed', () => {
    expect(isPartial(order())).toBe(false)
    expect(
      isPartial(
        order({ lines: [{ skuId: 'orchid-retail', qtyRequested: 24, qtyApproved: 24, qtyShipped: null }] }),
      ),
    ).toBe(false)
    expect(
      isPartial(
        order({ lines: [{ skuId: 'orchid-retail', qtyRequested: 24, qtyApproved: 12, qtyShipped: null }] }),
      ),
    ).toBe(true)
  })
})
