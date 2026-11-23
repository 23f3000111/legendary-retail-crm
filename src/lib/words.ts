/**
 * Sentences said on more than one page, kept in one place so they read the
 * same everywhere (23 November, of Analytics' Channel card: "this sentence is
 * wrong English").
 */
import type { Channel } from '../data/locations'

/** When a dealer's or consignment partner's month is in the dates chosen. */
export const MONTH_RULE = 'A month is counted when its first day falls within the dates.'

const CAME_FROM: Record<Channel, string> = {
  main: 'the main stores',
  consignment: 'consignment partners',
  dealer: 'dealers',
}

/** Analytics' Channel card, when only one channel sold: where the whole amount came from. */
export const oneChannelNote = (channel: Channel, amount: string): string =>
  `All ${amount} came from ${CAME_FROM[channel]}. ${
    channel === 'main' ? 'Consignment partners and dealers report once a month. ' : ''
  }${MONTH_RULE}`
