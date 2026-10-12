/**
 * A dealer's or consignment partner's month, as head office keys it in
 * (client's fifth revision).
 *
 * The screen and the store check a figure before it is sent, and the server
 * checks it again, so a figure that arrives by any other route meets the same
 * rules: a partner rather than a main store, a month that has begun, filed
 * under its own partner and month, and 0 or more. `partnerSalesRefusal` is the
 * local backend's twin of `_partner_sales_refusal` in `0001_init.sql`.
 */
import { locationById } from '../data/locations'
import { monthKey } from './dates'
import type { PutDoc } from '../api/backend'
import type { DateStr } from '../data/types'

export const partnerSalesRefusal = (d: PutDoc, today: DateStr): string | null => {
  const where = d.locationId ? locationById(d.locationId) : undefined
  if (!where || (where.channel !== 'dealer' && where.channel !== 'consignment')) {
    return 'Only dealers and consignment partners are keyed in here.'
  }
  const doc = (d.doc ?? {}) as { locationId?: unknown; month?: unknown; revenueMYR?: unknown }
  const month = typeof doc.month === 'string' ? doc.month : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'Choose a month.'
  if (month > monthKey(today)) return 'That month has not started yet.'
  if (d.id !== `${where.id}::${month}` || d.day !== `${month}-01` || doc.locationId !== where.id) {
    return 'That figure does not match its partner and month.'
  }
  if (typeof doc.revenueMYR !== 'number' || !Number.isFinite(doc.revenueMYR) || doc.revenueMYR < 0) {
    return 'A figure must be 0 or more.'
  }
  return null
}
