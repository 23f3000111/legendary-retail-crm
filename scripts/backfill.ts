/**
 * Copies the backups already taken into the places that started later.
 *
 *   vite-node scripts/backfill.ts --open-copy --passphrase-file <file> --work <dir> [--dry-run]
 *
 * `--open-copy` unlocks every encrypted backup still on GitHub (the nightly
 * artifacts not yet expired, and the monthly releases), takes the passwords
 * out of each (`redactDumpText`), and attaches them all, unencrypted, to one
 * release of `legendary-crm-data`: `history-2026-11-19`. That repository's
 * own nightly job keeps everything from 19 November on.
 *
 * Needs `gh` signed in as the owner of both repositories, `gpg` and `tar` on
 * the PATH. The passphrase is read from the last line of the file, as kept in
 * `docs/backup-passphrase.txt`. Everything unlocked is written under `--work`
 * and shredded before the script ends, whatever happens.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactDumpText } from '../src/backup/people'

export const ENCRYPTED = '23f3000111/legendary-crm-backups'
export const OPEN = '23f3000111/legendary-crm-data'
const HISTORY_TAG = 'history-2026-11-19'

export interface EncryptedBackup {
  /** `legendary-crm-YYYY-MM-DD_HHMM` */
  name: string
  /** `YYYY-MM-DD_HHMM`, Malaysia time */
  stamp: string
  source: 'artifact' | 'release'
  runId?: number
  tag?: string
}

const gh = (args: string[], cwd?: string) => execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 })
const stampOf = (name: string) => /^legendary-crm-(\d{4}-\d{2}-\d{2}_\d{4})$/.exec(name)?.[1]

/** Every encrypted backup still on GitHub, oldest first, each once. */
export function listEncryptedBackups(): EncryptedBackup[] {
  const found = new Map<string, EncryptedBackup>()
  const releases = JSON.parse(gh(['api', `repos/${ENCRYPTED}/releases?per_page=100`])) as {
    tag_name: string
    assets: { name: string }[]
  }[]
  for (const r of releases) {
    for (const a of r.assets) {
      const name = a.name.replace(/\.tar\.gz\.gpg$/, '')
      const stamp = stampOf(name)
      if (stamp) found.set(name, { name, stamp, source: 'release', tag: r.tag_name })
    }
  }
  const pages = JSON.parse(
    gh(['api', '--paginate', '--slurp', `repos/${ENCRYPTED}/actions/artifacts?per_page=100`]),
  ) as { artifacts: { name: string; expired: boolean; workflow_run: { id: number } }[] }[]
  for (const a of pages.flatMap((p) => p.artifacts)) {
    const stamp = stampOf(a.name)
    // A monthly release is the same night as its artifact: kept once, from the release.
    if (stamp && !a.expired && !found.has(a.name)) {
      found.set(a.name, { name: a.name, stamp, source: 'artifact', runId: a.workflow_run.id })
    }
  }
  return [...found.values()].sort((a, b) => (a.stamp < b.stamp ? -1 : 1))
}

/** Downloads one backup and unlocks it into `<work>/<name>/`. Returns that folder. */
export function fetchAndUnlock(b: EncryptedBackup, work: string, passphrase: string): string {
  const folder = join(work, b.name)
  mkdirSync(folder, { recursive: true })
  if (b.source === 'artifact') gh(['run', 'download', String(b.runId), '-R', ENCRYPTED, '-n', b.name, '-D', folder])
  else gh(['release', 'download', b.tag!, '-R', ENCRYPTED, '-p', `${b.name}.tar.gz.gpg`, '-D', folder])
  execFileSync(
    'gpg',
    ['--batch', '--yes', '--quiet', '--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--decrypt',
      '--output', `${b.name}.tar.gz`, `${b.name}.tar.gz.gpg`],
    { cwd: folder, input: passphrase },
  )
  // Relative names and a working folder: Windows tar takes "C:" for a remote host.
  execFileSync('tar', ['-xzf', `${b.name}.tar.gz`], { cwd: folder })
  return folder
}

/** Overwrites and deletes every file under `dir`. */
export function shredAll(dir: string) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) execFileSync('shred', ['-u', join(entry.parentPath ?? entry.path, entry.name)])
  }
  rmSync(dir, { recursive: true, force: true })
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function openCopy(dryRun: boolean) {
  const backups = listEncryptedBackups()
  console.log(`${backups.length} encrypted backups on GitHub:`)
  for (const b of backups) console.log(`  ${b.name}  (${b.source}${b.tag ? ` ${b.tag}` : ''})`)
  if (dryRun) return

  const passphraseFile = arg('--passphrase-file')
  const work = arg('--work')
  if (!passphraseFile || !work) throw new Error('Give --passphrase-file and --work.')
  const passphrase = readFileSync(passphraseFile, 'utf8').split(/\r?\n/).filter(Boolean).pop()!
  const out = join(work, 'open')
  mkdirSync(out, { recursive: true })
  try {
    const assets: string[] = []
    for (const b of backups) {
      const folder = fetchAndUnlock(b, work, passphrase)
      const dataSql = join(folder, 'data.sql')
      writeFileSync(dataSql, redactDumpText(readFileSync(dataSql, 'utf8')))
      const asset = `legendary-crm-open-${b.stamp}.tar.gz`
      execFileSync('tar', ['-czf', join('..', 'open', asset), 'schema.sql', 'data.sql', 'counts-before.txt', 'counts-after.txt'], {
        cwd: folder,
      })
      shredAll(folder)
      assets.push(asset)
      console.log(`  ${asset}`)
    }
    gh([
      'release', 'create', HISTORY_TAG, '-R', OPEN, '--title', 'Snapshots taken before 19 Nov 2026',
      '--notes', 'Every backup taken before this repository existed, from 24 September: not encrypted, passwords taken out. See README.md to restore one.',
    ])
    for (let i = 0; i < assets.length; i += 10) gh(['release', 'upload', HISTORY_TAG, '-R', OPEN, ...assets.slice(i, i + 10)], out)
    console.log(`${assets.length} snapshots attached to ${OPEN} release ${HISTORY_TAG}.`)
  } finally {
    shredAll(work)
  }
}

if (process.argv.includes('--open-copy')) {
  await openCopy(process.argv.includes('--dry-run'))
} else if (!process.argv.includes('--cloudflare')) {
  console.error('Usage: vite-node scripts/backfill.ts --open-copy --passphrase-file <file> --work <dir> [--dry-run]')
  process.exit(1)
}
