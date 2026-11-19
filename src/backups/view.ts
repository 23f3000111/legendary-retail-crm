/**
 * What the Backups page draws, decided apart from React so it can be tested.
 *
 * A backup holds 20,000 rows and is opened on phones: a table draws at most
 * 200 at a time, with Load more. Times are Malaysia's, whatever the device's
 * clock or time zone says, and the age of the newest backup is judged by the
 * server's clock.
 */
import type { Cell, Table } from '../backup/tables'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const cellText = (c: Cell) => (c === null ? '' : String(c)).toLowerCase()

/** The rows that contain `query` in any cell, at most `limit` of them, and how many matched. */
export function visibleRows(table: Table, query: string, limit = 200): { rows: Cell[][]; matched: number } {
  const q = query.trim().toLowerCase()
  if (!q) return { rows: table.rows.slice(0, limit), matched: table.rows.length }
  const hits = table.rows.filter((r) => r.some((c) => cellText(c).includes(q)))
  return { rows: hits.slice(0, limit), matched: hits.length }
}

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "18 Nov 2026, 09:06", in Malaysia. */
export function formatMyt(iso: string): string {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`
}

/** How many hours old a backup is, by the server's own clock. */
export function hoursOld(takenAtIso: string, serverNowIso: string): number {
  return (Date.parse(serverNowIso) - Date.parse(takenAtIso)) / 3_600_000
}
