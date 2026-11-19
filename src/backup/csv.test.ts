import { describe, expect, it } from 'vitest'
import { csvFiles, monthOf, toCsv } from './csv'

describe('toCsv', () => {
  it('quotes what needs quoting', () => {
    const csv = toCsv({
      columns: ['a', 'b'],
      rows: [
        ['x,y', 'say "hi"'],
        ['two\nlines', null],
        [true, 3],
      ],
    })
    expect(csv).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n"two\nlines",\r\ntrue,3\r\n')
  })

  it('writes a cell Excel would run as a formula as plain text', () => {
    const csv = toCsv({
      columns: ['note'],
      rows: [['=HYPERLINK("http://x","y")'], ['+60 12'], ['-two'], ['@SUM(A1)'], ['\tx'], [-3.5], ['a=b']],
    })
    expect(csv.slice(1).split('\r\n')).toEqual([
      'note',
      `"'=HYPERLINK(""http://x"",""y"")"`,
      "'+60 12",
      "'-two",
      "'@SUM(A1)",
      "'\tx",
      '-3.5',
      'a=b',
      '',
    ])
  })

  it('starts with a byte-order mark and ends lines with CRLF', () => {
    const csv = toCsv({ columns: ['name'], rows: [['Zhōng 中 🇲🇾']] })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('name\r\nZhōng 中 🇲🇾\r\n')
  })
})

describe('csvFiles', () => {
  it('splits a table by month when it has a month column', () => {
    const files = csvFiles([
      {
        name: 'activity',
        columns: ['id', 'at'],
        monthColumn: 'at',
        rows: [
          ['au-1', '2026-10-31T17:30:00.000Z'], // 01:30 on 1 November in Malaysia
          ['au-2', '2026-10-31T15:00:00.000Z'], // 23:00 on 31 October in Malaysia
        ],
      },
      { name: 'sale-lines', columns: ['id', 'day'], monthColumn: 'day', rows: [['sl-1', '2026-10-31']] },
      { name: 'outlets', columns: ['id'], rows: [['klia-t2']] },
    ])
    expect([...files.keys()].sort()).toEqual([
      'activity/2026-10.csv',
      'activity/2026-11.csv',
      'outlets.csv',
      'sale-lines/2026-10.csv',
    ])
    expect(files.get('activity/2026-11.csv')).toBe('﻿id,at\r\nau-1,2026-10-31T17:30:00.000Z\r\n')
  })
})

describe('monthOf', () => {
  it('reads a day as it is, and a moment in Malaysia time', () => {
    expect(monthOf('2026-11-30')).toBe('2026-11')
    expect(monthOf('2026-10-31T17:30:00.000Z')).toBe('2026-11')
    expect(monthOf('2026-10-31T15:59:59.000Z')).toBe('2026-10')
    expect(monthOf('not a date')).toBe('undated')
  })

  it('gives a moment too far ahead to date no month, rather than failing the export', () => {
    expect(monthOf('+275760-09-13T00:00:00.000Z')).toBe('undated')
  })
})
