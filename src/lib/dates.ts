import type { DateStr } from '../data/types'

/** All dates in this app are plain `YYYY-MM-DD` trading days, never timestamps. */
export const toDateStr = (d: Date): DateStr => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const parseDate = (s: DateStr): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: DateStr, n: number): DateStr => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export const daysBetween = (a: DateStr, b: DateStr): number =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)

/** Inclusive range, ascending. */
export const dateRange = (from: DateStr, to: DateStr): DateStr[] => {
  const out: DateStr[] = []
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d)
  return out
}

export const dayOfWeek = (s: DateStr): number => parseDate(s).getDay()

export const isWeekend = (s: DateStr): boolean => [0, 6].includes(dayOfWeek(s))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "2 Aug 2026" */
export const formatDate = (s: DateStr): string => {
  const d = parseDate(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Sun · 2 Aug" */
export const formatDayShort = (s: DateStr): string => {
  const d = parseDate(s)
  return `${DAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "2 Aug" */
export const formatDateShort = (s: DateStr): string => {
  const d = parseDate(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const monthKey = (s: DateStr): string => s.slice(0, 7)

export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export const startOfMonth = (s: DateStr): DateStr => `${s.slice(0, 7)}-01`

/** "3 days ago", "in 2 days", "today" — relative to the demo's fixed today. */
export const relativeDay = (s: DateStr, today: DateStr): string => {
  const n = daysBetween(s, today)
  if (n === 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n > 1) return `${n} days ago`
  if (n === -1) return 'tomorrow'
  return `in ${-n} days`
}

/** Timestamps are only ever rendered, never computed against. */
export const formatTimestamp = (iso: string): string => {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}`
}
