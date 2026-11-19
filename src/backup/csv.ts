/**
 * Tables as spreadsheets: CSV that Excel, Sheets and Numbers open as they
 * are, with Malay and Chinese names intact (the byte-order mark tells Excel
 * it is UTF-8) and order notes keeping their lines.
 */
import type { Cell, Table } from './tables'

const MYT_MS = 8 * 3_600_000

const field = (v: Cell): string => {
  if (v === null) return ''
  let text = String(v)
  // Text a spreadsheet would run as a formula (a note typed as "=HYPERLINK(…)")
  // is marked as plain text. The dump beside these files keeps it exactly.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One table as CSV: a byte-order mark, a header, CRLF line ends. */
export function toCsv(table: Pick<Table, 'columns' | 'rows'>): string {
  return '﻿' + [table.columns, ...table.rows].map((r) => r.map(field).join(',')).join('\r\n') + '\r\n'
}

/** `YYYY-MM` of a day as it is, or of a moment in Malaysian time; `undated` otherwise. */
export function monthOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  const shifted = new Date(Date.parse(value) + MYT_MS)
  return Number.isNaN(shifted.getTime()) ? 'undated' : shifted.toISOString().slice(0, 7)
}

/** Every table as files: `<name>.csv`, or `<name>/<YYYY-MM>.csv` for one split by month. */
export function csvFiles(tables: Table[]): Map<string, string> {
  const files = new Map<string, string>()
  for (const t of tables) {
    if (!t.monthColumn) {
      files.set(`${t.name}.csv`, toCsv(t))
      continue
    }
    const at = t.columns.indexOf(t.monthColumn)
    const byMonth = new Map<string, Cell[][]>()
    for (const row of t.rows) {
      const month = typeof row[at] === 'string' ? monthOf(row[at] as string) : 'undated'
      const rows = byMonth.get(month)
      if (rows) rows.push(row)
      else byMonth.set(month, [row])
    }
    for (const [month, rows] of byMonth) files.set(`${t.name}/${month}.csv`, toCsv({ columns: t.columns, rows }))
  }
  return files
}
