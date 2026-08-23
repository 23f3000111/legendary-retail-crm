import type { DateStr } from './types'

/**
 * Promotions.
 *
 * From discovery Q59: *"Davy plan in advance, Chloe record in system, and inform
 * Imran."* So this is deliberately a **record of a campaign**, not a pricing
 * engine. Two answers put it that way round:
 *
 *   Q58  only revenue is recorded — there is no cost price in this system
 *   Q60  different shops sell the same perfume at different prices, and the
 *        client does not want the system to care what they charge
 *
 * A promotion therefore never changes a figure. It sits alongside the revenue
 * so that when a week looks unusual, the reason is on the screen next to it
 * instead of in somebody's memory — which is exactly what Davy asked for when
 * he said the point of the whole system is accurate information (Q94).
 *
 * `informedIt` is not decoration: the client's own process ends with telling
 * Imran, so the record is not finished until that box is ticked.
 */

export type PromotionMechanic =
  | 'discount'
  | 'bundle'
  | 'gift'
  | 'member'
  | 'other'

export const MECHANIC_LABEL: Record<PromotionMechanic, string> = {
  discount: 'Price off',
  bundle: 'Buy more, save more',
  gift: 'Free gift',
  member: 'Member or staff offer',
  other: 'Something else',
}

export interface Promotion {
  id: string
  name: string
  mechanic: PromotionMechanic
  /** What the customer actually gets, in plain words. */
  detail: string
  from: DateStr
  to: DateStr
  /** Empty means every product. */
  skuIds: string[]
  /** Empty means everywhere it is sold. */
  locationIds: string[]
  /** Who planned it. Davy, in practice (Q59). */
  plannedBy: string
  /** Who typed it in. Chloe, in practice (Q59). */
  recordedBy: string
  recordedAt: string
  /** The last step of the client's own process (Q59). */
  informedIt: boolean
  notes?: string
}

export type PromotionState = 'planned' | 'running' | 'finished'

export const PROMOTION_STATE_LABEL: Record<PromotionState, string> = {
  planned: 'Planned',
  running: 'Running',
  finished: 'Finished',
}

/** Where a promotion sits relative to a given day. Dates are inclusive. */
export const promotionState = (p: Promotion, today: DateStr): PromotionState =>
  today < p.from ? 'planned' : today > p.to ? 'finished' : 'running'

export const promotionsOn = (all: Promotion[], date: DateStr): Promotion[] =>
  all.filter((p) => date >= p.from && date <= p.to)

/**
 * Seeded examples, sitting around the demo's fixed today (2026-08-21) so the
 * screen shows one of each state without anyone having to add data first.
 */
export const seedPromotions: Promotion[] = [
  {
    id: 'promo-merdeka-2026',
    name: 'Merdeka weekend',
    mechanic: 'discount',
    detail: '15% off the Oud collection',
    from: '2026-08-29',
    to: '2026-09-01',
    skuIds: [],
    locationIds: ['pavilion-5', 'klcc-isetan', 'parkson-pavilion', 'genting'],
    plannedBy: 'Lim Davy',
    recordedBy: 'Chloe Chock',
    recordedAt: '2026-08-04T11:20:00+08:00',
    informedIt: true,
    notes: 'Malls only. Airports run the building owner’s own campaign that weekend.',
  },
  {
    id: 'promo-travel-duo',
    name: 'Travel duo',
    mechanic: 'bundle',
    detail: 'Any two travel sizes for RM 210',
    from: '2026-08-01',
    to: '2026-08-31',
    skuIds: [],
    locationIds: ['klia-t2', 'langkawi'],
    plannedBy: 'Lim Davy',
    recordedBy: 'Chloe Chock',
    recordedAt: '2026-07-24T09:05:00+08:00',
    informedIt: true,
  },
  {
    id: 'promo-online-payday',
    name: 'Payday sale',
    mechanic: 'discount',
    detail: '12% off, marketplace vouchers stacked on top',
    from: '2026-08-25',
    to: '2026-08-28',
    skuIds: [],
    locationIds: ['web-shp', 'web-lzd', 'web-tts'],
    plannedBy: 'Lim Davy',
    recordedBy: 'Chloe Chock',
    recordedAt: '2026-08-18T16:40:00+08:00',
    // Deliberately left false: this is the step the client's process ends with,
    // and the screen chases it.
    informedIt: false,
  },
  {
    id: 'promo-raya-2026',
    name: 'Raya gifting',
    mechanic: 'gift',
    detail: 'Free gift box with any two full-size bottles',
    from: '2026-03-30',
    to: '2026-04-06',
    skuIds: [],
    locationIds: [],
    plannedBy: 'Lim Davy',
    recordedBy: 'Chloe Chock',
    recordedAt: '2026-03-11T10:15:00+08:00',
    informedIt: true,
  },
]
