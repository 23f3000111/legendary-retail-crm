import { describe, expect, it } from 'vitest'
import { activeRange, chooseDates, monthDates, rangeDates } from './periods'

/**
 * The meeting of 16 November, on Analytics: "when I want to go analytics I'm
 * supposed to choose the date here" — one choice of dates at the top, from
 * the usual periods or any dates, that the whole page follows.
 */

const today = '2026-11-18'

describe('the periods', () => {
  it('runs each preset up to today, and last month over the whole month', () => {
    expect(rangeDates('7', today)).toEqual({ from: '2026-11-12', to: today })
    expect(rangeDates('30', today)).toEqual({ from: '2026-10-20', to: today })
    expect(rangeDates('90', today)).toEqual({ from: '2026-08-21', to: today })
    expect(rangeDates('mtd', today)).toEqual({ from: '2026-11-01', to: today })
    expect(rangeDates('last', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('knows which preset some dates are, and calls anything else chosen dates', () => {
    expect(activeRange('2026-10-20', today, today)).toBe('30')
    expect(activeRange('2026-10-01', '2026-10-31', today)).toBe('last')
    expect(activeRange('2026-11-01', '2026-11-07', today)).toBe('dates')
    expect(activeRange('2026-11-13', '2026-11-13', today)).toBe('dates')
  })

  it('keeps chosen dates in order and never past today', () => {
    expect(chooseDates('2026-11-07', '2026-11-01', today)).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(chooseDates('2026-11-01', '2026-12-25', today)).toEqual({ from: '2026-11-01', to: today })
    expect(chooseDates('2026-12-01', '2026-12-25', today)).toEqual({ from: today, to: today })
    // A box cleared while typing keeps the other end.
    expect(chooseDates('', '2026-11-07', today)).toEqual({ from: '2026-11-07', to: '2026-11-07' })
  })
})

// 16 November: "they can export the specific months or specific date and then
// with all the detail" — a store's month, from its calendar.
describe('a month to export', () => {
  it('runs from the 1st to the month’s end', () => {
    expect(monthDates('2026-10', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthDates('2026-02', today)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('stops at today in the month still running', () => {
    expect(monthDates('2026-11', today)).toEqual({ from: '2026-11-01', to: today })
  })
})
