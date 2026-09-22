/**
 * Runs the SQL in supabase/migrations against the shared server, in order.
 *
 *   DATABASE_URL=postgresql://… node scripts/migrate.mjs
 *
 * Idempotent: every statement is "create or replace" / "if not exists", and
 * seed_people() leaves existing logins alone. The connection string is the
 * project's pooler URL from Supabase → Settings → Database. It is a secret;
 * pass it through the environment, never write it into this repository.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { connect } from './db.mjs'


const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const client = connect()
await client.connect()
try {
  for (const f of files) {
    process.stdout.write(`${f} … `)
    const sql = readFileSync(join(dir, f), 'utf8')
    const result = await client.query(sql)
    const last = Array.isArray(result) ? result[result.length - 1] : result
    console.log(last?.rows?.length ? JSON.stringify(last.rows[0]) : 'ok')
  }
} finally {
  await client.end()
}
