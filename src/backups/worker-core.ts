/**
 * What the Backups page's worker does, apart from the worker itself so it
 * can be tested (final review, 19 November).
 *
 * Unlocking, unzipping and reading a backup (a 14 MB dump) kept a phone's
 * page frozen for over a second; searching 11,000 rows froze it for each key
 * pressed. All of
 * that happens here, off the page's thread. The unlocked tables stay here,
 * too: the page is told only their names and sizes, and asks for one page
 * of rows at a time, a spreadsheet, or a zip of every table.
 */
import { strToU8, zipSync } from 'fflate'
import { csvFiles, toCsv } from '../backup/csv'
import type { Cell, Table } from '../backup/tables'
import { CannotUnlock, readBackup, unlockBackup } from './open'
import { visibleRows } from './view'

export interface TableSummary {
  name: string
  columns: string[]
  rowCount: number
}

export type Request =
  | { id: number; kind: 'open'; encrypted: Uint8Array; passphrase: string }
  | { id: number; kind: 'rows'; table: string; query: string; limit: number }
  | { id: number; kind: 'csv'; table: string }
  | { id: number; kind: 'zip' }

export type Reply =
  | { id: number; kind: 'stage'; stage: 'Unlocking…' | 'Reading…' }
  | { id: number; kind: 'opened'; counts: Record<string, number>; tables: TableSummary[] }
  | { id: number; kind: 'rows'; rows: Cell[][]; matched: number }
  | { id: number; kind: 'csv'; csv: string }
  | { id: number; kind: 'zip'; zip: Uint8Array<ArrayBuffer> }
  | { id: number; kind: 'error'; message: string }

export function createCore(post: (reply: Reply, transfer?: Transferable[]) => void) {
  let tables: Table[] = []
  const table = (name: string) => {
    const t = tables.find((x) => x.name === name)
    if (!t) throw new Error(`There is no table called ${name}.`)
    return t
  }

  return async (req: Request): Promise<void> => {
    try {
      if (req.kind === 'open') {
        tables = []
        post({ id: req.id, kind: 'stage', stage: 'Unlocking…' })
        const plain = await unlockBackup(req.encrypted, req.passphrase)
        post({ id: req.id, kind: 'stage', stage: 'Reading…' })
        const opened = readBackup(plain)
        tables = opened.tables
        post({
          id: req.id,
          kind: 'opened',
          counts: opened.counts,
          tables: tables.map((t) => ({ name: t.name, columns: t.columns, rowCount: t.rows.length })),
        })
      } else if (req.kind === 'rows') {
        const { rows, matched } = visibleRows(table(req.table), req.query, req.limit)
        post({ id: req.id, kind: 'rows', rows, matched })
      } else if (req.kind === 'csv') {
        post({ id: req.id, kind: 'csv', csv: toCsv(table(req.table)) })
      } else {
        const zip = zipSync(Object.fromEntries([...csvFiles(tables)].map(([path, csv]) => [path, strToU8(csv)])))
        post({ id: req.id, kind: 'zip', zip }, [zip.buffer])
      }
    } catch (e) {
      post({
        id: req.id,
        kind: 'error',
        message: e instanceof CannotUnlock ? e.message : e instanceof Error ? e.message : 'Something went wrong.',
      })
    }
  }
}
