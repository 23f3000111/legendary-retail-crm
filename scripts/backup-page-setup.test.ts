import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(__dirname, 'backup-page-setup.mjs')
let cwd: string
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

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
