import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import gpgMade from './__fixtures__/gpg-made.tar.gz.gpg.b64?raw'
import { bytesOf } from '../backup/__fixtures__/bytes'
import { createCore, type Reply } from './worker-core'

/** A core and everything it has said. */
const harness = () => {
  const said: Reply[] = []
  const core = createCore((reply) => said.push(reply))
  return { core, said }
}

describe('the Backups page’s worker', () => {
  it('answers an open with its stages, then the tables’ names and sizes, not their rows', async () => {
    const { core, said } = harness()
    await core({ id: 1, kind: 'open', encrypted: bytesOf(gpgMade), passphrase: 'test-passphrase-only' })
    expect(said.slice(0, 2)).toEqual([
      { id: 1, kind: 'stage', stage: 'Unlocking…' },
      { id: 1, kind: 'stage', stage: 'Reading…' },
    ])
    const opened = said[2]
    expect(opened).toMatchObject({ id: 1, kind: 'opened', counts: { people: 1, docs: 3, locations: 1, settings: 1 } })
    if (opened.kind !== 'opened') throw new Error('not opened')
    expect(opened.tables.find((t) => t.name === 'sale-lines')).toEqual({
      name: 'sale-lines',
      columns: expect.arrayContaining(['id', 'note']),
      rowCount: 1,
    })
    expect(JSON.stringify(opened)).not.toContain("it's a gift")
  }, 30_000)

  it('hands over a page of rows, searched there', async () => {
    const { core, said } = harness()
    await core({ id: 1, kind: 'open', encrypted: bytesOf(gpgMade), passphrase: 'test-passphrase-only' })
    await core({ id: 2, kind: 'rows', table: 'sale-lines', query: 'GIFT', limit: 200 })
    await core({ id: 3, kind: 'rows', table: 'sale-lines', query: 'nothing like it', limit: 200 })
    const [found, none] = said.slice(-2)
    expect(found).toMatchObject({ id: 2, kind: 'rows', matched: 1 })
    if (found.kind !== 'rows') throw new Error('not rows')
    expect(JSON.stringify(found.rows)).toContain("it's a gift")
    expect(none).toEqual({ id: 3, kind: 'rows', rows: [], matched: 0 })
  }, 30_000)

  it('writes one table as a spreadsheet, and every table into a zip', async () => {
    const { core, said } = harness()
    await core({ id: 1, kind: 'open', encrypted: bytesOf(gpgMade), passphrase: 'test-passphrase-only' })
    await core({ id: 2, kind: 'csv', table: 'outlets' })
    await core({ id: 3, kind: 'zip' })
    const [csv, zip] = said.slice(-2)
    if (csv.kind !== 'csv' || zip.kind !== 'zip') throw new Error('wrong replies')
    expect(csv.csv).toBe('﻿id,name,channel,city,status\r\nklia-t2,KLIA T2,main,KLIA,open\r\n')
    const files = unzipSync(zip.zip)
    expect(Object.keys(files)).toContain('outlets.csv')
    expect(strFromU8(files['sale-lines/2026-11.csv'])).toContain("it's a gift")
  }, 30_000)

  it('says when it cannot unlock, in words the page can show', async () => {
    const { core, said } = harness()
    await core({ id: 1, kind: 'open', encrypted: bytesOf(gpgMade), passphrase: 'not-it' })
    expect(said[said.length - 1]).toEqual({
      id: 1,
      kind: 'error',
      message: "This backup can't be unlocked with the key the page holds.",
    })
  }, 30_000)
})
