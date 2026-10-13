import { describe, expect, it } from 'vitest'
import { canOpen } from './nav'

/**
 * The route guard sends anybody who opens a page outside their role back to
 * their home page. So every link a page shows has to lead somewhere the person
 * looking at it may go, or the link sends them home instead.
 */
describe('where a link may take you', () => {
  it('lets Chloe open the orders and closings her overview links to', () => {
    // Her overview lists the orders in flight ("All orders", and each order),
    // and the stores that did not file yesterday (the closings monitor). She
    // can access all data (the company chart); she approves nothing.
    expect(canOpen('pa', '/orders')).toBe(true)
    expect(canOpen('pa', '/orders/PO-261004-QFCH')).toBe(true)
    expect(canOpen('pa', '/closings')).toBe(true)
  })

  it('still leaves changing a closing to Kelly and Davy', () => {
    expect(canOpen('pa', '/close')).toBe(false)
    expect(canOpen('ops', '/close')).toBe(true)
    expect(canOpen('md', '/close')).toBe(true)
  })

  it('keeps orders from those with no part in them', () => {
    // IT can open a store's page, so its order links must be hidden from him.
    expect(canOpen('it', '/stores/pavilion-5')).toBe(true)
    expect(canOpen('it', '/orders')).toBe(false)
    expect(canOpen('it', '/orders/PO-261004-QFCH')).toBe(false)
  })

  it('does not give Kelly analytics, so her overview must not offer the link', () => {
    expect(canOpen('ops', '/overview')).toBe(true)
    expect(canOpen('ops', '/analytics')).toBe(false)
  })
})
