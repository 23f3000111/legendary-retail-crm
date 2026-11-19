/**
 * The encrypted nightly job (ops/backup, which runs in legendary-crm-backups):
 * what it hands to code from npm, and when (final review, 19 November).
 *
 * The restore test needs the `pg` package. Anything that package brings in
 * can read the job's environment and the files on the runner, and can change
 * how every later step runs. So: no secret is given to the whole job, every
 * step that holds one runs before any code from npm does, and npm installs
 * exactly the locked versions with none of their install scripts.
 */
import { describe, expect, it } from 'vitest'
import workflowAsSaved from '../ops/backup/.github/workflows/nightly-backup.yml?raw'
import pkg from '../ops/backup/package.json'

// A Windows checkout saves it with CRLF.
const workflow = workflowAsSaved.replace(/\r\n/g, '\n')

interface Lock {
  packages: Record<string, { version?: string; integrity?: string; dependencies?: Record<string, string> }>
}
const locks = import.meta.glob<Lock>('../ops/backup/package-lock.json', { eager: true, import: 'default' })
const lock = locks['../ops/backup/package-lock.json'] as Lock | undefined

interface Step {
  name: string
  text: string
}

/** The job's steps, each with its own lines. */
const steps: Step[] = workflow
  .slice(workflow.indexOf('\n    steps:\n'))
  .split(/\n(?=      - )/)
  .slice(1)
  .map((text) => ({ name: (/name: (.+)/.exec(text) ?? /uses: (.+)/.exec(text))?.[1] ?? '?', text }))

const jobEnv = workflow.slice(workflow.indexOf('\n    env:\n'), workflow.indexOf('\n    steps:\n'))
const code = (s: Step) => s.text.replace(/#.*$/gm, '')
const runsNpmCode = (s: Step) => /\bnpm\b|\bnode\b/.test(code(s))
const holdsSecret = (s: Step) => /secrets\.|github\.token/.test(code(s))
const named = (name: string) => steps.findIndex((s) => s.name === name)
const step = (name: string) => {
  const s = steps.find((x) => x.name === name)
  expect(s, name).toBeDefined()
  return s!
}

describe('the encrypted nightly job', () => {
  it('gives no secret to the whole job, and the database login only to the steps that use it', () => {
    // Whether Cloudflare is set up is a yes or no, not the secret itself.
    const exposed = [...jobEnv.matchAll(/\$\{\{\s*secrets\.(\w+)\s*(!= '')?\s*\}\}/g)].filter((m) => !m[2]).map((m) => m[1])
    expect(exposed).toEqual([])
    expect(steps.filter((s) => s.text.includes('secrets.BACKUP_DATABASE_URL')).map((s) => s.name)).toEqual([
      'Check the secrets are set',
      'Take the backup',
    ])
  })

  it('runs every step that holds a secret before any code from npm runs', () => {
    const firstNpm = steps.findIndex(runsNpmCode)
    expect(firstNpm).toBeGreaterThan(0)
    expect(steps.slice(firstNpm).filter(holdsSecret).map((s) => s.name)).toEqual([])
  })

  it('installs exactly the locked versions, with none of their install scripts', () => {
    expect(steps.filter(runsNpmCode).map(code).join('\n')).toMatch(/npm ci --ignore-scripts/)
    expect(workflow).not.toMatch(/npm install/)
    expect(lock?.packages['']?.dependencies).toEqual(pkg.dependencies)
    expect(lock?.packages['node_modules/pg']).toMatchObject({
      version: expect.stringMatching(/^8\./),
      integrity: expect.stringMatching(/^sha512-/),
    })
  })

  it('copies to Cloudflare through the page, with a key that can only add a backup: GitHub holds no Cloudflare key', () => {
    // A Cloudflare key here could have changed the site or sent mail as
    // legendary.com.my (go-live, 19 November).
    expect(workflow).not.toMatch(/api\.cloudflare\.com|CF_KV_TOKEN|CF_ACCOUNT_ID|CF_KV_NAMESPACE/)
    expect(jobEnv).toMatch(/HAS_CLOUDFLARE: \$\{\{ secrets\.BACKUP_UPLOAD_KEY != '' \}\}/)
    const copy = code(steps[named('Copy to Cloudflare')])
    expect(copy).toMatch(/UPLOAD_KEY: \$\{\{ secrets\.BACKUP_UPLOAD_KEY \}\}/)
    expect(copy).toMatch(/https:\/\/legendary-crm\.pages\.dev\/api\/backups\/upload\/\$1/)
    // The key reaches curl on its standard input, never its command line,
    // where any process on the runner could read it.
    expect(copy).toMatch(/printf 'Authorization: Bearer %s\\n' "\$UPLOAD_KEY" \| curl /)
    expect(copy).toMatch(/ -H @- /)
    expect(copy).not.toMatch(/Bearer \$UPLOAD_KEY/)
  })

  it('keeps every night for good, as a file on that month’s release, not as an artifact GitHub deletes', () => {
    // Artifacts share the free plan's 500 MB, which these alone would fill by
    // about June 2027; release files have no total limit (19 November).
    expect(workflow).not.toMatch(/upload-artifact|retention-days/)
    const keep = code(step('Keep the nightly one'))
    expect(keep).toMatch(/tag="nightly-\$\{STAMP:0:7\}"/)
    expect(keep).toMatch(/gh release upload "\$tag" "\$NAME\.tar\.gz\.gpg" -R "\$GITHUB_REPOSITORY" --clobber/)
    expect(keep).toMatch(/gh release create "\$tag" "\$NAME\.tar\.gz\.gpg" -R "\$GITHUB_REPOSITORY"[\s\S]*--latest=false/)
  })

  it('makes every copy whenever there is an encrypted file, even when another copy failed', () => {
    for (const name of ['Keep the nightly one', 'Keep the monthly one', 'Copy to Cloudflare']) {
      expect(step(name).text, name).toMatch(/if: \$\{\{ !cancelled\(\) && steps\.encrypt\.outcome == 'success'/)
    }
    expect(step('Copy to Cloudflare').text).toMatch(/&& env\.HAS_CLOUDFLARE == 'true' \}\}/)
    expect(named('Keep the nightly one')).toBeLessThan(named('Keep the monthly one'))
  })

  it('leaves no GitHub token on disk for a later step’s code to find', () => {
    expect(steps.find((s) => s.name.startsWith('actions/checkout'))?.text).toMatch(/persist-credentials: false/)
  })

  it('tests the very file it kept — unlocked again, even when a copy failed — and shreds what it unlocked, whatever happened', () => {
    const unlock = steps.findIndex((s) => /--decrypt "\$NAME\.tar\.gz\.gpg"/.test(s.text))
    expect(unlock).toBeGreaterThan(named('Copy to Cloudflare'))
    expect(unlock).toBeLessThan(steps.findIndex(runsNpmCode))
    expect(steps[unlock].text).toMatch(/if: \$\{\{ !cancelled\(\) && steps\.encrypt\.outcome == 'success' \}\}/)
    const last = steps[steps.length - 1]
    expect(last.text).toMatch(/if: always\(\)/)
    expect(code(last)).toMatch(/shred -u/)
  })
})
