/**
 * The encrypted backups on GitHub, for the scripts that copy them elsewhere
 * (`scripts/backfill.ts`): listing them, fetching and unlocking one, and
 * shredding what was unlocked.
 *
 * Everything is unlocked inside a working folder made fresh for the run
 * (`freshWorkFolder`), and only that folder is shredded — never the folder
 * the person named, which may hold anything, the only readable copy of the
 * passphrase included (19 November review).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const ENCRYPTED = '23f3000111/legendary-crm-backups'

export interface EncryptedBackup {
  /** `legendary-crm-YYYY-MM-DD_HHMM` */
  name: string
  /** `YYYY-MM-DD_HHMM`, Malaysia time */
  stamp: string
  source: 'artifact' | 'release'
  runId?: number
  tag?: string
}

export const gh = (args: string[], cwd?: string) =>
  execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 })

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

/** A new, empty folder of the script's own under `base`. Only this is ever shredded. */
export function freshWorkFolder(base: string): string {
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, 'backfill-'))
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

/** Overwrites and deletes every file under `dir`, then `dir` itself. */
export function shredAll(dir: string) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) execFileSync('shred', ['-u', join(entry.parentPath ?? entry.path, entry.name)])
  }
  rmSync(dir, { recursive: true, force: true })
}
