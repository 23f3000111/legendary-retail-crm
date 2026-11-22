import { describe, expect, it } from 'vitest'
import { toCsv, toCsvSections } from './exportCsv'

/**
 * Every export opens in Excel, and some cells are typed by people: a reason
 * for rejecting an order (22 November), a product's name, a note. A cell
 * that starts like a formula must arrive as the words typed, never run.
 */
describe('a cell that starts like a formula', () => {
  it('is set as text, the way it was typed', () => {
    const csv = toCsv(['Reason'], [['=HYPERLINK("http://x","Click")'], ['@SUM(A1:A9)'], ['+1+1'], ['-2+3'], ['\tTab']])
    const lines = csv.split('\r\n').slice(1)
    expect(lines).toEqual([`"'=HYPERLINK(""http://x"",""Click"")"`, `"'@SUM(A1:A9)"`, `"'+1+1"`, `"'-2+3"`, `"'\tTab"`])
  })

  it('leaves figures alone, a minus included', () => {
    expect(toCsv(['A', 'B', 'C'], [[-5, '-12.50', '+60']]).split('\r\n')[1]).toBe('-5,-12.50,+60')
  })

  it('does the same in a report of several parts', () => {
    expect(toCsvSections([{ title: 'ORDERS', rows: [['=1+1']] }])).toBe(`ORDERS\r\n"'=1+1"`)
  })
})
