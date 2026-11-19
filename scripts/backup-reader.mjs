/**
 * Gives one of the read-only backup logins a fresh password and writes its
 * connection string to a file — never to the screen.
 *
 *   DATABASE_URL=postgresql://… node scripts/backup-reader.mjs backup-url.txt
 *   DATABASE_URL=postgresql://… node scripts/backup-reader.mjs --role backup_open_reader open-url.txt
 *
 * `backup_reader` (the default) is the encrypted nightly backup's login, kept
 * in the backup repository's `BACKUP_DATABASE_URL` secret.
 * `backup_open_reader` is the open copy's, which cannot see a password column,
 * kept in `legendary-crm-data`'s `OPEN_BACKUP_DATABASE_URL` secret.
 *
 * Run `scripts/migrate.mjs` first, so the role exists. The output file is a
 * credential: paste it into the secret and delete it. Running this again
 * rotates the password, so the old secret stops working at once.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { connect } from './db.mjs'

const ROLES = ['backup_reader', 'backup_open_reader']

const args = process.argv.slice(2)
const at = args.indexOf('--role')
const role = at >= 0 ? args.splice(at, 2)[1] : 'backup_reader'
const out = args[0]
if (!ROLES.includes(role)) {
  console.error(`--role must be one of ${ROLES.join(', ')}.`)
  process.exit(1)
}
if (!out) {
  console.error('Say where to write the connection string: node scripts/backup-reader.mjs [--role <role>] <file>')
  process.exit(1)
}

// Letters and digits only, so it needs no escaping anywhere it is pasted.
const password = randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32)

const admin = new URL(process.env.DATABASE_URL.replace(/^postgres(ql)?:/, 'https:'))
// Supabase's pooler names a login `role.projectref`; the project ref is the
// part after the dot in the admin username.
const ref = decodeURIComponent(admin.username).split('.')[1]
if (!ref) {
  console.error('This expects the pooler connection string (user postgres.<project-ref>).')
  process.exit(1)
}

const client = connect()
await client.connect()
try {
  const { rows } = await client.query('select 1 from pg_roles where rolname = $1', [role])
  if (!rows.length) {
    console.error(`No ${role} role yet. Run scripts/migrate.mjs first.`)
    process.exit(1)
  }
  // The password is a parameter only in spirit here: ALTER ROLE cannot take
  // one, so it is quoted by the server's own function instead of by hand. The
  // role name comes from the list above, never from anyone typing.
  const { rows: q } = await client.query('select quote_literal($1) as lit', [password])
  await client.query(`alter role ${role} login password ${q[0].lit}`)
} finally {
  await client.end()
}

// The session pooler, port 5432. pg_dump needs a whole session to itself; the
// transaction pooler on 6543 would hand its connection to somebody else
// between statements.
const url = `postgresql://${role}.${ref}:${password}@${admin.hostname}:5432/postgres`
writeFileSync(out, url + '\n', { mode: 0o600 })
console.log(`${role} has a new password. Connection string written to ${out}.`)
