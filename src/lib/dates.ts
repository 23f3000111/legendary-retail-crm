import type { DateStr } from '../data/types'

/** All dates in this app are plain `YYYY-MM-DD` trading days, never timestamps. */
export const toDateStr = (d: Date): DateStr => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The trading day right now, in Malaysia.
 *
 * Every store is on Malaysian time and so is the 11pm deadline, so the day is
 * taken in that zone whatever the device is set to — a phone left on a foreign
 * time zone after a holiday must not file yesterday's closing as today's.
 */
export const todayInMalaysia = (now: Date = new Date()): DateStr =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

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

/**
 * One business date, or two and every day between — the client's "equal /
 * between" (20 October). Either date may be empty while it is being typed.
 */
export interface DateSpan {
  op: 'equal' | 'between'
  from: DateStr
  to: DateStr
}

/** The first and last day a span covers, whichever way round its dates were typed. Null until it has its dates. */
export const spanDays = (s: DateSpan): { from: DateStr; to: DateStr } | null => {
  if (!s.from || (s.op === 'between' && !s.to)) return null
  if (s.op === 'equal') return { from: s.from, to: s.from }
  return s.from <= s.to ? { from: s.from, to: s.to } : { from: s.to, to: s.from }
}

/** "16 Oct 2026", or "1 Oct 2026 to 16 Oct 2026". */
export const spanLabel = (days: { from: DateStr; to: DateStr }): string =>
  days.from === days.to ? formatDate(days.from) : `${formatDate(days.from)} to ${formatDate(days.to)}`

/** The Monday of the week `s` falls in: a week runs Monday to Sunday. */
export const startOfWeek = (s: DateStr): DateStr => addDays(s, -((dayOfWeek(s) + 6) % 7))

/** A month key `n` months on (or back, for negative `n`): "2026-10" → "2026-09". */
export const shiftMonth = (key: string, n: number): string => {
  const [y, m] = key.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

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
