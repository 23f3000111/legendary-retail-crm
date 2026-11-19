import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(__dirname, 'backup-page-setup.mjs')
let cwd: string
let aside: string | undefined
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  if (aside) rmSync(aside, { recursive: true, force: true })
  aside = undefined
})

describe('setting up the Backups page', () => {
  it('gives the nightly job a key that can only add a backup, and no Cloudflare key', () => {
    cwd = mkdtempSync(join(tmpdir(), 'setup-'))
    aside = mkdtempSync(join(tmpdir(), 'setup-aside-'))
    writeFileSync(join(aside, 'passphrase.txt'), 'The backup passphrase.\n\nthe-passphrase\n')
    // Cloudflare has no namespace yet; Resend knows the domain.
    writeFileSync(
      join(aside, 'fake-fetch.mjs'),
      `globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).startsWith('https://api.resend.com')
        ? { data: [{ id: 'd1', name: 'legendary.com.my', status: 'verified' }] }
        : { success: true, result: [] }), { status: 200 })\n`,
    )
    const plan = execFileSync(
      'node',
      [
        '--import', pathToFileURL(join(aside, 'fake-fetch.mjs')).href, SCRIPT,
        '--alert-emails', 'a@example.com,b@example.com', '--reply-to', 'a@example.com',
        '--passphrase-file', join(aside, 'passphrase.txt'), '--dry-run',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'pages', CLOUDFLARE_BACKUP_TOKEN: 'kv', RESEND_API_KEY: 're_full' },
      },
    )
    const steps = plan.split('\n').filter((l) => l.startsWith('[dry run]'))
    expect(steps.find((l) => l.includes('on Pages project legendary-crm'))).toContain('BACKUP_UPLOAD_KEY')
    expect(steps.filter((l) => l.includes('set the secret'))).toEqual([
      '[dry run] would set the secret BACKUP_UPLOAD_KEY on 23f3000111/legendary-crm-backups',
    ])
    expect(plan).not.toMatch(/CF_KV_TOKEN|KV_JOB/)
    expect(readdirSync(cwd)).toEqual([])
  })
})

describe('changing the Backups page password', () => {
  it('takes effect at once: the script redeploys the CRM and signs in with the new password', () => {
    cwd = mkdtempSync(join(tmpdir(), 'rotate-'))
    const plan = execFileSync('node', [SCRIPT, '--rotate-password', '--dry-run'], { cwd, encoding: 'utf8' })
    const steps = plan.split('\n').filter((l) => l.startsWith('[dry run]'))
    expect(steps).toEqual([
      '[dry run] would set BACKUP_PASSWORD_HMAC, BACKUP_SESSION_SECRET on Pages project legendary-crm',
      '[dry run] would write the page password to docs/backup-page-password.txt',
      "[dry run] would start the CRM's deploy and wait for it, so the new settings take effect",
      '[dry run] would sign in at https://crm.legendary.com.my/backups/ with the new password, to confirm it works',
    ])
    // A dry run writes nothing.
    expect(readdirSync(cwd)).toEqual([])
  })
})
