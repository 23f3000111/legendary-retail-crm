/**
 * Puts a backup back.
 *
 *   DATABASE_URL=postgresql://… node restore.mjs data.sql            (what would happen)
 *   DATABASE_URL=postgresql://… node restore.mjs data.sql --yes      (do it)
 *
 * `data.sql` is the file inside a decrypted backup — see README.md for the
 * two commands that get it out. The connection string must be the admin one
 * (user `postgres.<project-ref>`), not the backup's read-only login.
 *
 * It replaces the four tables a backup holds — people, docs, locations,
 * settings — all at once or not at all: one transaction, so a restore that
 * fails half-way leaves the server exactly as it was. Everyone is signed out,
 * because sessions are not in a backup and must not survive one.
 *
 * The nightly job runs this same script against a scratch database after
 * every backup, so a backup that could not be restored would fail that night,
 * not on the day it was needed.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import pg from 'pg'

const TABLES = ['people', 'docs', 'locations', 'settings']

const file = process.argv[2]
const confirmed = process.argv.includes('--yes')
const url = process.env.DATABASE_URL
if (!file || !url) {
  console.error('Usage: DATABASE_URL=… node restore.mjs <data.sql> [--yes]')
  process.exit(1)
}

const raw = readFileSync(file)
const dump = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')

// Since Postgres 17.6, pg_dump brackets its output with `\restrict` and
// `\unrestrict` lines. They are instructions to psql, not SQL, and a server
// rejects them, so they are set aside here. Anything else starting with a
// backslash would be a file this script does not understand, so it stops.
const lines = dump.split('\n')
const unknown = lines.filter((l) => l.startsWith('\\') && !/^\\(restrict|unrestrict) /.test(l))
if (unknown.length) {
  console.error(`This file has psql commands this script does not know: ${unknown[0].slice(0, 40)}`)
  process.exit(1)
}
const sql = lines.filter((l) => !l.startsWith('\\')).join('\n')

// What the backup holds, counted from the file itself: each INSERT carries
// one or more `(…)` rows, and pg_dump writes one row per line.
const inBackup = Object.fromEntries(TABLES.map((t) => [t, 0]))
let current = null
for (const line of sql.split('\n')) {
  const m = line.match(/^INSERT INTO public\.(\w+) /)
  if (m) {
    current = m[1]
    continue
  }
  if (current && /^\t?\(/.test(line)) inBackup[current] += 1
  else if (!line.startsWith('\t')) current = null
}

// A database on this machine has no certificate to check. Anywhere else, the
// server is checked against Supabase's own root — the file beside this one —
// so a restore cannot be pointed at an impostor.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || process.env.PGSSLMODE === 'disable'
const ssl = local
  ? false
  : {
      ca: readFileSync(process.env.PGSSLROOTCERT ?? new URL('./supabase-ca.crt', import.meta.url), 'utf8'),
      rejectUnauthorized: true,
    }

const client = new pg.Client({ connectionString: url, ssl })
await client.connect()

const count = async (t) => {
  const exists = await client.query('select to_regclass($1) as r', [`public.${t}`])
  if (!exists.rows[0].r) return null
  return (await client.query(`select count(*)::int n from public.${t}`)).rows[0].n
}

try {
  console.log('table        now  →  in the backup')
  for (const t of TABLES) {
    console.log(`${t.padEnd(10)} ${String((await count(t)) ?? '—').padStart(5)}  →  ${inBackup[t]}`)
  }

  if (!confirmed) {
    console.log('\nNothing changed. Add --yes to replace these four tables with the backup.')
    process.exit(0)
  }

  await client.query('begin')
  // CASCADE because sessions and pending codes point at people: they go too,
  // which signs everybody out — right after a restore.
  await client.query(`truncate ${TABLES.map((t) => `public.${t}`).join(', ')} cascade`)
  // pg_dump's own file, run as it is. Truncating and inserting fire neither
  // the activity log's append-only guard (update/delete) nor anything else.
  await client.query(sql)

  // Every row the file held must now be here, or nothing is kept.
  for (const t of TABLES) {
    const n = await count(t)
    if (n !== inBackup[t]) {
      throw new Error(`${t}: expected ${inBackup[t]} rows after the restore, found ${n}`)
    }
  }
  await client.query('commit')
  console.log('\nRestored. Everybody has been signed out; they sign in again as normal.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error(`\nNot restored — the server is unchanged. ${e instanceof Error ? e.message : e}`)
  process.exitCode = 1
} finally {
  await client.end()
}
