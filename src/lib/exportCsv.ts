/**
 * CSV export, done in the browser. Values are quoted only when they need to be,
 * and a UTF-8 BOM is prepended so Excel opens Ringgit and flag characters
 * correctly rather than as mojibake.
 */
type Cell = string | number | null | undefined

const escape = (v: Cell): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (cells: Cell[]) => cells.map(escape).join(',')

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [row(headers), ...rows.map(row)].join('\r\n')
}

/**
 * One block of a report of several parts — the product sales listing,
 * payment, the shelf, customers — each under its own title, a blank line
 * between them.
 */
export interface CsvBlock {
  title?: string
  headers?: string[]
  rows: Cell[][]
}

export function toCsvSections(blocks: CsvBlock[]): string {
  const out: string[] = []
  blocks.forEach((b, i) => {
    if (i > 0) out.push('')
    if (b.title) out.push(escape(b.title))
    if (b.headers) out.push(row(b.headers))
    for (const r of b.rows) out.push(row(r))
  })
  return out.join('\r\n')
}

const save = (filename: string, text: string): void => {
  const blob = new Blob(['﻿', text], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  save(filename, toCsv(headers, rows))
}

export function downloadCsvSections(filename: string, blocks: CsvBlock[]): void {
  save(filename, toCsvSections(blocks))
}
