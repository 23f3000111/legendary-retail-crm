/**
 * One connection to the shared server, for the scripts in this folder.
 *
 * TLS is verified against Supabase's own root certificate, which sits beside
 * this file — their pooler presents a chain the public CAs do not cover, and
 * turning verification off instead would leave an admin connection open to
 * anyone able to sit in the middle of it.
 *
 * The connection string is a secret: pass it in the environment, never write
 * it into this repository.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

export function connect() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Set DATABASE_URL to the Supabase connection string first.')
    console.error('Supabase → Settings → Database → Connection string (session pooler).')
    process.exit(1)
  }
  const client = new pg.Client({
    connectionString,
    ssl: {
      ca: readFileSync(join(here, 'supabase-ca.crt'), 'utf8'),
      rejectUnauthorized: true,
      // The pooler's certificate is issued to the project host.
      servername: new URL(connectionString.replace(/^postgres(ql)?:/, 'https:')).hostname,
    },
  })
  return client
}
