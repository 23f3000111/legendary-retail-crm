import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Table } from '../backup/tables'
import { formatMyt, hoursOld, visibleRows } from './view'

afterEach(() => vi.unstubAllEnvs())

const sales: Table = {
  name: 'sale-lines',
  columns: ['id', 'location_id', 'byName', 'unitPriceMYR'],
  rows: Array.from({ length: 450 }, (_, i) => [`sl-${i}`, i % 3 === 0 ? 'klia-t2' : 'pavilion-5', i % 2 ? 'Kelly Tew' : 'Teo Kok Nian', i === 7 ? 1234.5 : 238]),
}

describe('the Backups page', () => {
  it('draws at most 200 rows, and says how many matched', () => {
    const shown = visibleRows(sales, '')
    expect(shown.rows).toHaveLength(200)
    expect(shown.matched).toBe(450)
    expect(visibleRows(sales, '', 400).rows).toHaveLength(400)
  })

  it('searches every column, ignoring case', () => {
    expect(visibleRows(sales, 'KLIA').matched).toBe(150)
    expect(visibleRows(sales, 'kelly tew').matched).toBe(225)
    expect(visibleRows(sales, '1234.5').rows).toEqual([['sl-7', 'pavilion-5', 'Kelly Tew', 1234.5]])
    expect(visibleRows(sales, '  ').matched).toBe(450)
  })

  it('formats in Malaysia time whatever the device says', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(formatMyt('2026-11-18T01:06:00.000Z')).toBe('18 Nov 2026, 09:06')
    expect(formatMyt('2026-09-30T16:30:00.000Z')).toBe('1 Oct 2026, 00:30')
  })

  it("judges staleness by the server's clock", () => {
    expect(hoursOld('2026-11-18T01:00:00.000Z', '2026-11-19T07:30:00.000Z')).toBe(30.5)
    expect(hoursOld('2026-11-19T01:00:00.000Z', '2026-11-19T01:00:00.000Z')).toBe(0)
  })
})
