import { describe, expect, it } from 'vitest'
import type { DumpTable, SqlValue } from './dump'
import { PASSWORD_COLUMNS, tablesFrom, type Table } from './tables'

const DOC_COLUMNS = ['kind', 'id', 'location_id', 'day', 'doc', 'updated_at', 'updated_by', 'deleted']

/** A `docs` row as the dump holds it: the document is jsonb text. */
const doc = (kind: string, id: string, location: string | null, day: string | null, body: object): SqlValue[] => [
  kind,
  id,
  location,
  day,
  JSON.stringify(body),
  '2026-11-18 01:00:00+00',
  'kelly',
  false,
]

const docs = (rows: SqlValue[][]): DumpTable => ({ name: 'docs', columns: DOC_COLUMNS, rows, spans: [] })

const closing = doc('closing', 'klia-t2-2026-11-18', 'klia-t2', '2026-11-18', {
  id: 'klia-t2-2026-11-18',
  period: '2026-11-18',
  revenueMYR: 376,
  tender: { cash: 188, card: 188 },
  staffSales: { qty: 0, revenueMYR: 0 },
  lines: [
    { id: 'l1', skuId: 'orchid-retail', qty: 1, unitPriceMYR: 188 },
    { id: 'l2', skuId: 'violet-retail', qty: 1, unitPriceMYR: 188 },
  ],
  stockCount: [{ skuId: 'orchid-retail', counted: 11 }],
  writeOffs: [{ skuId: 'orchid-tester', qty: 1, reason: 'tester' }],
})

const order = doc('po', 'PO-7', 'melaka', null, {
  id: 'PO-7',
  status: 'approved',
  notes: 'Two cases',
  lines: [{ skuId: 'orchid-retail', qtyRequested: 12, qtyApproved: 12, qtyShipped: null }],
  events: [
    { status: 'submitted', actor: 'Khoo', role: 'promoter', at: '2026-11-17T02:00:00.000Z' },
    { status: 'approved', actor: 'Kelly Tew', role: 'ops', at: '2026-11-17T05:00:00.000Z' },
  ],
})

const table = (tables: Table[], name: string): Table => {
  const t = tables.find((x) => x.name === name)
  if (!t) throw new Error(`no table ${name}; have ${tables.map((x) => x.name).join(', ')}`)
  return t
}
const cell = (t: Table, row: number, column: string) => t.rows[row][t.columns.indexOf(column)]

describe('tablesFrom', () => {
  it('makes one table per kind, an unknown kind included', () => {
    const tables = tablesFrom([
      docs([
        doc('sale_line', 'sl-1', 'klia-t2', '2026-11-18', { id: 'sl-1', day: '2026-11-18', qty: 1 }),
        closing,
        doc('audit', 'au-1', null, null, { id: 'au-1', at: '2026-11-18T01:00:00.000Z', summary: 'Signed in' }),
        doc('gift_card', 'g-1', null, null, { id: 'g-1', value: 50 }),
      ]),
      { name: 'locations', columns: ['id', 'name'], rows: [['klia-t2', 'KLIA T2']], spans: [] },
      { name: 'settings', columns: ['key', 'value'], rows: [['two_step', 'false']], spans: [] },
    ])
    const names = tables.map((t) => t.name)
    for (const name of ['sale-lines', 'closings', 'activity', 'gift-card', 'outlets', 'settings']) {
      expect(names).toContain(name)
    }
    expect(table(tables, 'sale-lines').monthColumn).toBe('day')
    expect(table(tables, 'activity').monthColumn).toBe('at')
    expect(table(tables, 'closings').monthColumn).toBeUndefined()
  })

  it("puts the record's own columns first, then the document's, flattened", () => {
    const tables = tablesFrom([
      docs([closing, doc('sale_line', 'sl-1', 'klia-t2', '2026-11-18', { id: 'sl-1', day: '2026-11-18', qty: 2 })]),
    ])
    const closings = table(tables, 'closings')
    expect(closings.columns.slice(0, 6)).toEqual(['id', 'location_id', 'day', 'updated_at', 'updated_by', 'deleted'])
    expect(closings.columns).toEqual(expect.arrayContaining(['period', 'revenueMYR', 'tender.cash', 'tender.card', 'staffSales.qty']))
    expect(closings.columns.filter((c) => c === 'id')).toHaveLength(1)
    for (const gone of ['lines', 'stockCount', 'writeOffs', 'tender']) expect(closings.columns).not.toContain(gone)
    expect(cell(closings, 0, 'id')).toBe('klia-t2-2026-11-18')
    expect(cell(closings, 0, 'tender.cash')).toBe(188)
    // A document key that would collide with the record's own column says so.
    const sales = table(tables, 'sale-lines')
    expect(cell(sales, 0, 'day')).toBe('2026-11-18')
    expect(cell(sales, 0, 'doc.day')).toBe('2026-11-18')
    expect(cell(sales, 0, 'qty')).toBe(2)
  })

  it("gives a closing's lines, stock counts and write-offs their own tables, each tied to its closing", () => {
    const tables = tablesFrom([docs([closing])])
    const lines = table(tables, 'closing-lines')
    expect(lines.columns.slice(0, 3)).toEqual(['closing_id', 'location_id', 'day'])
    expect(lines.rows).toHaveLength(2)
    expect(lines.rows.map((r) => r[0])).toEqual(['klia-t2-2026-11-18', 'klia-t2-2026-11-18'])
    expect(cell(lines, 1, 'skuId')).toBe('violet-retail')
    expect(lines.monthColumn).toBe('day')
    const stock = table(tables, 'closing-stock')
    expect(cell(stock, 0, 'counted')).toBe(11)
    expect(stock.monthColumn).toBe('day')
    expect(cell(table(tables, 'closing-write-offs'), 0, 'reason')).toBe('tester')
  })

  it("gives an order's lines and events their own tables", () => {
    const tables = tablesFrom([docs([order])])
    const orders = table(tables, 'orders')
    expect(orders.columns).not.toContain('lines')
    expect(orders.columns).not.toContain('events')
    const lines = table(tables, 'order-lines')
    expect(lines.columns.slice(0, 2)).toEqual(['order_id', 'location_id'])
    expect(lines.rows[0].slice(0, 2)).toEqual(['PO-7', 'melaka'])
    expect(cell(lines, 0, 'qtyShipped')).toBeNull()
    const events = table(tables, 'order-events')
    expect(events.rows.map((r) => cell({ ...events, rows: [r] }, 0, 'status'))).toEqual(['submitted', 'approved'])
  })

  it('never carries a password column', () => {
    const hash = '$2a$10$abcdefghijklmnopqrstuuJhbHn1Ns1qdl5/1L9z5cM7sP0r1zXfu'
    const tables = tablesFrom([
      {
        name: 'people',
        columns: ['id', 'username', 'role', 'active', 'doc', 'password_hash', 'password_cipher', 'password_history', 'updated_at'],
        rows: [
          [
            'kelly',
            'kellytew',
            'ops',
            true,
            JSON.stringify({ id: 'kelly', username: 'kellytew', name: 'Kelly Tew', role: 'ops', password: 'old', passwordHistory: ['x'] }),
            hash,
            '\\xc30d04090302',
            `{${hash}}`,
            '2026-09-22 04:54:52.651+00',
          ],
        ],
        spans: [],
      },
    ])
    const logins = table(tables, 'logins')
    for (const column of PASSWORD_COLUMNS) expect(logins.columns).not.toContain(column)
    expect(logins.columns).not.toContain('password')
    expect(logins.columns).not.toContain('passwordHistory')
    expect(JSON.stringify(logins.rows)).not.toContain('$2a$10$')
    expect(JSON.stringify(logins.rows)).not.toContain('c30d0409')
    expect(cell(logins, 0, 'name')).toBe('Kelly Tew')
    expect(logins.columns.filter((c) => c === 'username')).toHaveLength(1)
  })
})
