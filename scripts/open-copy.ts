/**
 * The open copy's export, run each night by `legendary-crm-data`'s job.
 *
 *   npm run open-copy -- people <out.sql>          the logins, passwords left out
 *   npm run open-copy -- schema-people <out.sql>   the logins table's definition
 *   npm run open-copy -- tables <data.sql> <dir>   every table as CSV files
 *
 * `people` signs in with `DATABASE_URL`, the open login
 * (`backup_open_reader`), which cannot read a password column. The job dumps
 * the other three tables with pg_dump; that login cannot dump this one, so
 * its rows and its definition come from here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseDump } from '../src/backup/dump'
import { tablesFrom } from '../src/backup/tables'
import { csvFiles } from '../src/backup/csv'
import { PEOPLE_DDL, peopleInserts, type OpenPerson } from '../src/backup/people'
import { connect } from './db.mjs'

const [mode, ...args] = process.argv.slice(2)

const usage = () => {
  console.error('Usage: npm run open-copy -- people <out.sql> | schema-people <out.sql> | tables <data.sql> <dir>')
  process.exit(1)
}

if (mode === 'people' && args[0]) {
  const client = connect()
  await client.connect()
  try {
    // So each moment is written the way pg_dump writes it.
    await client.query(`set time zone 'UTC'`)
    const { rows } = await client.query<OpenPerson>(
      'select id, username, role, active, doc::text as doc, updated_at::text as updated_at from people order by id',
    )
    writeFileSync(args[0], peopleInserts(rows))
    console.log(`${rows.length} logins written, without their passwords.`)
  } finally {
    await client.end()
  }
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
