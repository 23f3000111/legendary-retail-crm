import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { freshWorkFolder, shredAll } from './encrypted-backups'

let base: string
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('the backfill’s working folder', () => {
  it('is a new folder of its own, so shredding it never touches what was there', () => {
    base = mkdtempSync(join(tmpdir(), 'backfill-test-'))
    // What someone might point --work at: a folder holding the only readable passphrase.
    writeFileSync(join(base, 'backup-passphrase.txt'), 'the only readable copy\n')

    const work = freshWorkFolder(base)
    expect(work.startsWith(base)).toBe(true)
    expect(work).not.toBe(base)
    expect(readdirSync(work)).toEqual([])
    writeFileSync(join(work, 'data.sql'), 'unlocked')

    shredAll(work)

    expect(existsSync(work)).toBe(false)
    expect(readFileSync(join(base, 'backup-passphrase.txt'), 'utf8')).toBe('the only readable copy\n')
  })
})
