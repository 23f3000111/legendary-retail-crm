/**
 * The dates a page reads (16 November, on Analytics: "when I want to go
 * analytics I'm supposed to choose the date here"): the usual periods, or any
 * dates chosen, never past today.
 */
import { addDays, monthKey, shiftMonth, startOfMonth } from './dates'
import type { DateStr } from '../data/types'

export type RangeKey = '7' | '30' | '90' | 'mtd' | 'last' | 'dates'

export const RANGES: { value: RangeKey; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'dates', label: 'Dates' },
]

const PRESETS: Exclude<RangeKey, 'dates'>[] = ['7', '30', '90', 'mtd', 'last']

/** A preset's dates, on `today`. */
export const rangeDates = (key: Exclude<RangeKey, 'dates'>, today: DateStr): { from: DateStr; to: DateStr } => {
  if (key === 'mtd') return { from: startOfMonth(today), to: today }
  if (key === 'last') return { from: `${shiftMonth(monthKey(today), -1)}-01`, to: addDays(startOfMonth(today), -1) }
  return { from: addDays(today, -(Number(key) - 1)), to: today }
}

/** Which preset some dates are, or `dates` for any others. */
export const activeRange = (from: DateStr, to: DateStr, today: DateStr): RangeKey =>
  PRESETS.find((k) => {
    const r = rangeDates(k, today)
    return r.from === from && r.to === to
  }) ?? 'dates'

/**
 * Dates as chosen in two boxes, made sensible: in order, never past today,
 * and one day where only one box is filled while the other is being retyped.
 */
export const chooseDates = (from: DateStr, to: DateStr, today: DateStr): { from: DateStr; to: DateStr } => {
  let a = from || to || today
  let b = to || from || today
  if (a > b) [a, b] = [b, a]
  if (b > today) b = today
  if (a > today) a = today
  return { from: a, to: b }
}
