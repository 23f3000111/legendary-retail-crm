import { describe, expect, it } from 'vitest'
import gpgMade from './__fixtures__/gpg-made.tar.gz.gpg.b64?raw'
import { makeBackup } from './__fixtures__/make-backup'
import { bytesOf } from '../backup/__fixtures__/bytes'
import { CannotUnlock, openBackup } from './open'

const PASSPHRASE = 'test-passphrase-only'

describe('opening a backup in the browser', () => {
  it('opens a backup made the way the nightly job makes them', async () => {
    const opened = await openBackup(bytesOf(gpgMade), PASSPHRASE)
    expect(opened.counts).toEqual({ people: 1, docs: 3, locations: 1, settings: 1 })
    const names = opened.tables.map((t) => t.name)
    for (const name of ['closings', 'closing-lines', 'closing-stock', 'sale-lines', 'activity', 'logins', 'outlets', 'settings']) {
      expect(names).toContain(name)
    }
    const sales = opened.tables.find((t) => t.name === 'sale-lines')!
    expect(sales.rows[0][sales.columns.indexOf('note')]).toBe("it's a gift")
  }, 30_000)

  it('opens one encrypted here with OpenPGP.js at AES-256 and 65,011,712 rounds', async () => {
    const encrypted = await makeBackup(
      {
        'data.sql': "INSERT INTO public.settings (key, value) VALUES\n\t('two_step', 'false');\n",
        'counts-before.txt': 'settings|1\n',
      },
      'another-passphrase',
    )
    const opened = await openBackup(encrypted, 'another-passphrase')
    expect(opened.counts).toEqual({ settings: 1 })
    expect(opened.tables).toEqual([{ name: 'settings', columns: ['key', 'value'], rows: [['two_step', 'false']] }])
  }, 30_000)

  it('says so when it cannot unlock', async () => {
    await expect(openBackup(bytesOf(gpgMade), 'not-the-passphrase')).rejects.toBeInstanceOf(CannotUnlock)
    await expect(openBackup(new Uint8Array([1, 2, 3]), PASSPHRASE)).rejects.toBeInstanceOf(CannotUnlock)
  }, 30_000)

  it('never hands back a password column', async () => {
    const opened = await openBackup(bytesOf(gpgMade), PASSPHRASE)
    const everything = JSON.stringify(opened.tables)
    expect(everything).not.toContain('password_hash')
    expect(everything).not.toContain('$2a$10$')
    expect(everything).not.toContain('c30d040903')
  }, 30_000)
})
