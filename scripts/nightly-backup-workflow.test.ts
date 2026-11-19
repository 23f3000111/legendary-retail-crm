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
