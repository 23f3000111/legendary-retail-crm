import { describe, expect, it } from 'vitest'
import { showsFigures } from './ChartFrame'

/**
 * The figures first, the chart a tap away (1 November: "the primary view must
 * be the figures"). 22 November: on the live site the Overview's consignment
 * and dealers opened on the ring. The page is drawn before the partners'
 * figures arrive, and the frame took "no figures yet" as "show the chart" for
 * good. Only a tap on Chart shows the chart now.
 */
describe('a chart frame', () => {
  it('shows the figures whenever there are some and nobody asked for the chart', () => {
    expect(showsFigures(<table />, false)).toBe(true)
  })

  it('shows the chart once it is asked for', () => {
    expect(showsFigures(<table />, true)).toBe(false)
  })

  it('draws the chart while there are no figures to show', () => {
    expect(showsFigures(undefined, false)).toBe(false)
  })
})
