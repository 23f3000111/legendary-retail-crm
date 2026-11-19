/**
 * A backup's `data.sql`, as tables.
 *
 * The nightly job writes it with `pg_dump --data-only --column-inserts
 * --rows-per-insert=200`: one `INSERT … VALUES` per 200 rows, a row to a line.
 * Nothing here relies on that last part — a value may hold a line break — so
 * the text is read a character at a time, the way the server would read it.
 *
 * `writeInserts` writes the same layout back, so a dump that has been changed
 * (the open copy's, with its passwords taken out) restores with the same
 * `ops/backup/restore.mjs` as any other.
 */

export type SqlValue = string | number | boolean | null

export interface DumpTable {
  name: string
  columns: string[]
  rows: SqlValue[][]
  /** Where each `INSERT … ;` for this table starts and ends in the source. */
  spans: [number, number][]
}

const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/
const BARE = /^(?:NULL|true|false)\b/

/** Every table in a dump, in the order it first appears, with all its rows. */
export function parseDump(sql: string): DumpTable[] {
  const tables = new Map<string, DumpTable>()
  let at = 0
  while (at < sql.length) {
    if (sql.startsWith('INSERT INTO ', at)) {
      const { table, columns, rows, end } = readInsert(sql, at)
      const t = tables.get(table) ?? { name: table, columns, rows: [], spans: [] }
      if (t.columns.join() !== columns.join()) {
        throw new Error(`${table}: two INSERTs name different columns`)
      }
      t.rows.push(...rows)
      t.spans.push([at, end])
      tables.set(table, t)
      at = end
      continue
    }
    // Anything that is not an INSERT is a comment, a SET or psql's bracket.
    const next = sql.indexOf('\n', at)
    at = next < 0 ? sql.length : next + 1
  }
  return [...tables.values()]
}

/** `INSERT INTO public.<name> (…) VALUES (…), (…);` starting at `from`. */
function readInsert(sql: string, from: number) {
  const head = /^INSERT INTO ([^\s(]+) \(([^)]*)\) VALUES\s*/.exec(sql.slice(from, from + 4096))
  if (!head) throw new Error(`Not an INSERT this reader understands, at ${from}`)
  const table = unquote(head[1].split('.').pop()!)
  const columns = head[2].split(',').map((c) => unquote(c.trim()))
  const rows: SqlValue[][] = []
  let at = from + head[0].length
  for (;;) {
    at = skipSpace(sql, at)
    if (sql[at] !== '(') throw new Error(`Expected a row at ${at} in ${table}`)
    const { values, end } = readRow(sql, at + 1)
    if (values.length !== columns.length) {
      throw new Error(`${table}: a row has ${values.length} values for ${columns.length} columns`)
    }
    rows.push(values)
    at = skipSpace(sql, end)
    if (sql[at] === ',') {
      at += 1
      continue
    }
    if (sql[at] === ';') return { table, columns, rows, end: at + 1 }
    throw new Error(`Expected , or ; after a row at ${at} in ${table}`)
  }
}

/** The values of one row, from just after its `(` to just after its `)`. */
function readRow(sql: string, from: number): { values: SqlValue[]; end: number } {
  const values: SqlValue[] = []
  let at = from
  for (;;) {
    at = skipSpace(sql, at)
    if (sql[at] === "'") {
      // Standard strings: '' is a quote, and a backslash is just a backslash.
      let text = ''
      let i = at + 1
      for (;;) {
        const q = sql.indexOf("'", i)
        if (q < 0) throw new Error(`A string that never ends, from ${at}`)
        text += sql.slice(i, q)
        if (sql[q + 1] === "'") {
          text += "'"
          i = q + 2
        } else {
          at = q + 1
          break
        }
      }
      values.push(text)
    } else {
      const rest = sql.slice(at, at + 64)
      const bare = BARE.exec(rest)
      const num = bare ? null : NUMBER.exec(rest)
      if (bare) {
        values.push(bare[0] === 'NULL' ? null : bare[0] === 'true')
        at += bare[0].length
      } else if (num) {
        values.push(Number(num[0]))
        at += num[0].length
      } else {
        throw new Error(`A value this reader does not understand at ${at}: ${rest.slice(0, 20)}`)
      }
    }
    at = skipSpace(sql, at)
    if (sql[at] === ',') {
      at += 1
      continue
    }
    if (sql[at] === ')') return { values, end: at + 1 }
    throw new Error(`Expected , or ) in a row at ${at}`)
  }
}

const skipSpace = (sql: string, at: number) => {
  while (at < sql.length && /\s/.test(sql[at])) at += 1
  return at
}

const unquote = (name: string) =>
  name.startsWith('"') && name.endsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name

const quoteName = (name: string) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`)

const literal = (v: SqlValue): string =>
  v === null ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`

/** Rows as pg_dump writes them: one INSERT per `rowsPerInsert` rows, a row to a line. */
export function writeInserts(name: string, columns: string[], rows: SqlValue[][], rowsPerInsert = 200): string {
  const head = `INSERT INTO public.${quoteName(name)} (${columns.map(quoteName).join(', ')}) VALUES\n`
  let out = ''
  for (let i = 0; i < rows.length; i += rowsPerInsert) {
    const chunk = rows.slice(i, i + rowsPerInsert)
    out += head + chunk.map((r) => `\t(${r.map(literal).join(', ')})`).join(',\n') + ';\n'
  }
  return out
}
