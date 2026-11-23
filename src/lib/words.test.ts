import { describe, expect, it } from 'vitest'
import { MONTH_RULE, oneChannelNote } from './words'

/**
 * 23 November, of Analytics' Channel card: "in analytics, this sentence is
 * wrong English". It read "RM 676,124, all of it. A dealer's or consignment
 * partner's month counts when its 1st is in the dates."
 */
describe('the Channel card, when only one channel sold', () => {
  it('says the whole amount came from the main stores, and when a partner’s month is counted', () => {
    expect(oneChannelNote('main', 'RM 676,124')).toBe(
      'All RM 676,124 came from the main stores. Consignment partners and dealers report once a month. ' +
        'A month is counted when its first day falls within the dates.',
    )
  })

  it('names the dealers or the consignment partners, without saying they are the ones missing', () => {
    expect(oneChannelNote('dealer', 'RM 1,000')).toBe(`All RM 1,000 came from dealers. ${MONTH_RULE}`)
    expect(oneChannelNote('consignment', '12 units')).toBe(`All 12 units came from consignment partners. ${MONTH_RULE}`)
  })
})
