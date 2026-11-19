/**
 * The open copy's export, run each night by `legendary-crm-data`'s job.
 *
 *   npm run open-copy -- people <people.json> <out.sql>   the logins, passwords left out
 *   npm run open-copy -- schema-people <out.sql>          the logins table's definition
 *   npm run open-copy -- tables <data.sql> <dir>          every table as CSV files
 *
 * None of these touches the database. The job reads it in a step of its own
 * that runs nothing but pg_dump and psql, so the open login's password is
 * never in reach of the npm packages this needs (19 November). That login
 * cannot dump the logins table, so psql writes its six readable columns to
 * `people.json`:
 *
 *   PGTZ=UTC psql … -Atc "select coalesce(json_agg(json_build_object(
 *     'id', id, 'username', username, 'role', role, 'active', active,
 *     'doc', doc::text, 'updated_at', updated_at::text) order by id), '[]') from people"
 *
 * and this turns them into INSERTs, with placeholder passwords.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseDump } from '../src/backup/dump'
import { tablesFrom } from '../src/backup/tables'
import { csvFiles } from '../src/backup/csv'
import { PEOPLE_DDL, peopleInserts, type OpenPerson } from '../src/backup/people'

const [mode, ...args] = process.argv.slice(2)

const usage = () => {
  console.error(
    'Usage: npm run open-copy -- people <people.json> <out.sql> | schema-people <out.sql> | tables <data.sql> <dir>',
  )
  process.exit(1)
}

if (mode === 'people' && args[0] && args[1]) {
  const rows = JSON.parse(readFileSync(args[0], 'utf8')) as OpenPerson[]
  if (!Array.isArray(rows) || rows.some((p) => typeof p.id !== 'string' || typeof p.doc !== 'string')) {
    console.error(`${args[0]} is not the logins as psql writes them.`)
    process.exit(1)
  }
  writeFileSync(args[1], peopleInserts(rows))
  console.log(`${rows.length} logins written, without their passwords.`)
} else if (mode === 'schema-people' && args[0]) {
  writeFileSync(args[0], PEOPLE_DDL)
} else if (mode === 'tables' && args[0] && args[1]) {
  const files = csvFiles(tablesFrom(parseDump(readFileSync(args[0], 'utf8'))))
  for (const [path, csv] of files) {
    const full = join(args[1], path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, csv)
  }
  console.log(`${files.size} files written to ${args[1]}.`)
} else {
  usage()
}
