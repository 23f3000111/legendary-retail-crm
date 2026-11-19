/**
 * A dump as tables a person can read: one per kind of record, with a
 * closing's lines and an order's lines given tables of their own, and
 * nothing that could open an account.
 *
 * Shared by the open copy's nightly export, which writes them as CSV files,
 * and the Backups page, which shows them. Kept generic on purpose: a field
 * added to a document tomorrow appears as a column without a change here.
 */
import type { DumpTable, SqlValue } from './dump'

export type Cell = string | number | boolean | null

export interface Table {
  name: string
  columns: string[]
  rows: Cell[][]
  /** A column holding a day or a moment; the table is split by month on it. */
  monthColumn?: string
}

/** Never shown, never written out. The encrypted backup keeps them for a restore. */
export const PASSWORD_COLUMNS = ['password_hash', 'password_cipher', 'password_history'] as const

/** A record's own columns in `docs`, ahead of its document's. */
const RECORD_COLUMNS = ['id', 'location_id', 'day', 'updated_at', 'updated_by', 'deleted'] as const

/** Kinds by the name a person would look for, in the order they are listed. */
const KIND_TABLES: [kind: string, name: string, monthColumn?: string][] = [
  ['closing', 'closings'],
  ['sale_line', 'sale-lines', 'day'],
  ['po', 'orders'],
  ['partner_sales', 'dealer-and-consignment'],
  ['target', 'targets'],
  ['promotion', 'promotions'],
  ['product', 'products'],
  ['audit', 'activity', 'at'],
  ['alert_read', 'alerts-read'],
  ['setting', 'app-settings'],
]

/** Arrays inside a document that are tables of their own, and what ties each row back. */
const CHILD_TABLES: Record<string, { key: string; name: string; monthColumn?: string }[]> = {
  closing: [
    { key: 'lines', name: 'closing-lines', monthColumn: 'day' },
    { key: 'stockCount', name: 'closing-stock', monthColumn: 'day' },
    { key: 'writeOffs', name: 'closing-write-offs' },
  ],
  po: [
    { key: 'lines', name: 'order-lines' },
    { key: 'events', name: 'order-events' },
  ],
}

/** Keys a login's document carries that must never be written out. */
const LOGIN_SECRETS = new Set(['password', 'passwordHistory'])

/** Builds a table a row at a time, adding columns as new keys turn up. */
class Builder {
  readonly columns: string[]
  private readonly index = new Map<string, number>()
  readonly rows: Map<string, Cell>[] = []

  constructor(
    readonly name: string,
    fixed: readonly string[],
    readonly monthColumn?: string,
  ) {
    this.columns = [...fixed]
    fixed.forEach((c, i) => this.index.set(c, i))
  }

  add(row: Map<string, Cell>) {
    for (const key of row.keys()) {
      if (!this.index.has(key)) {
        this.index.set(key, this.columns.length)
        this.columns.push(key)
      }
    }
    this.rows.push(row)
  }

  table(): Table {
    const rows = this.rows.map((r) => this.columns.map((c) => (r.has(c) ? r.get(c)! : null)))
    // Sorted by the first column, so a night's export changes only the rows that changed.
    const order = rows.map((_, i) => i)
    order.sort((a, b) => compare(rows[a][0], rows[b][0]) || a - b)
    return {
      name: this.name,
      columns: this.columns,
      rows: order.map((i) => rows[i]),
      ...(this.monthColumn ? { monthColumn: this.monthColumn } : {}),
    }
  }
}

const compare = (a: Cell, b: Cell) => {
  const x = a === null ? '' : String(a)
  const y = b === null ? '' : String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** `{a: {b: 1}, c: [1]}` → a.b = 1, c = "[1]". Keys in `skip` are left out. */
function flatten(value: Record<string, unknown>, into: Map<string, Cell>, taken: Set<string>, prefix = '', skip = new Set<string>()) {
  for (const [key, v] of Object.entries(value)) {
    if (!prefix && skip.has(key)) continue
    const name = prefix ? `${prefix}.${key}` : key
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v as Record<string, unknown>, into, taken, name)
      continue
    }
    const cell: Cell =
      v === null || v === undefined ? null : Array.isArray(v) ? JSON.stringify(v) : (v as string | number | boolean)
    // A document key that would land on one of the record's own columns says where it came from.
    into.set(!prefix && taken.has(name) ? `doc.${name}` : name, cell)
  }
}

const rowOf = (columns: string[], values: SqlValue[]) => new Map(columns.map((c, i) => [c, values[i]]))

/** Every table a person may read in a dump. Tables with no rows are left out. */
export function tablesFrom(dump: DumpTable[]): Table[] {
  const builders = new Map<string, Builder>()
  const builder = (name: string, fixed: readonly string[], monthColumn?: string) => {
    let b = builders.get(name)
    if (!b) builders.set(name, (b = new Builder(name, fixed, monthColumn)))
    return b
  }
  const recordColumns = new Set<string>(RECORD_COLUMNS)

  for (const t of dump) {
    if (t.name === 'docs') {
      for (const values of t.rows) {
        const r = rowOf(t.columns, values)
        const kind = String(r.get('kind'))
        const known = KIND_TABLES.find(([k]) => k === kind)
        const name = known ? known[1] : kind.replace(/_/g, '-')
        const body = JSON.parse(String(r.get('doc') ?? '{}')) as Record<string, unknown>
        const children = CHILD_TABLES[kind] ?? []

        const row = new Map<string, Cell>(RECORD_COLUMNS.map((c) => [c, (r.get(c) ?? null) as Cell]))
        flatten(body, row, recordColumns, '', new Set(['id', ...children.map((c) => c.key)]))
        builder(name, RECORD_COLUMNS, known?.[2]).add(row)

        for (const child of children) {
          const items = Array.isArray(body[child.key]) ? (body[child.key] as Record<string, unknown>[]) : []
          const tie = kind === 'po' ? ['order_id', 'location_id'] : ['closing_id', 'location_id', 'day']
          for (const item of items) {
            const childRow = new Map<string, Cell>([
              [tie[0], r.get('id') as Cell],
              ['location_id', (r.get('location_id') ?? null) as Cell],
              ...(tie[2] ? ([['day', (r.get('day') ?? null) as Cell]] as [string, Cell][]) : []),
            ])
            flatten(item, childRow, new Set(tie))
            builder(child.name, tie, child.monthColumn).add(childRow)
          }
        }
      }
    } else if (t.name === 'people') {
      for (const values of t.rows) {
        const r = rowOf(t.columns, values)
        const own = ['id', 'username', 'role', 'active', 'updated_at']
        const row = new Map<string, Cell>(own.map((c) => [c, (r.get(c) ?? null) as Cell]))
        const body = JSON.parse(String(r.get('doc') ?? '{}')) as Record<string, unknown>
        flatten(body, row, new Set(own), '', new Set([...LOGIN_SECRETS, ...own]))
        builder('logins', own).add(row)
      }
    } else {
      const name = t.name === 'locations' ? 'outlets' : t.name
      const keep = t.columns.filter((c) => !(PASSWORD_COLUMNS as readonly string[]).includes(c))
      for (const values of t.rows) {
        const r = rowOf(t.columns, values)
        builder(name, keep).add(new Map(keep.map((c) => [c, (r.get(c) ?? null) as Cell])))
      }
    }
  }

  // Known kinds in their usual order, each followed by its own children; then the rest.
  const order = [
    ...KIND_TABLES.flatMap(([kind, name]) => [name, ...(CHILD_TABLES[kind] ?? []).map((c) => c.name)]),
  ]
  const rank = (name: string) => {
    const i = order.indexOf(name)
    if (i >= 0) return i
    const tail = ['logins', 'outlets', 'settings'].indexOf(name)
    return tail >= 0 ? 10_000 + tail : 5_000
  }
  return [...builders.values()]
    .map((b) => b.table())
    .filter((t) => t.rows.length > 0)
    .sort((a, b) => rank(a.name) - rank(b.name))
}
