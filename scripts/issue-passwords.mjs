/**
 * Gives everyone a fresh password and prints the list, so Imran can hand them
 * out without reading each one off the Logins screen.
 *
 *   DATABASE_URL=postgresql://… node scripts/issue-passwords.mjs > passwords.txt
 *   DATABASE_URL=… node scripts/issue-passwords.mjs imran kellytew   # just these
 *
 * The old password joins the history, so it can never be reissued — the same
 * rule set_password() applies. The output is a list of live credentials:
 * keep it out of the repository, hand it over, and delete it.
 */
import { randomBytes } from 'node:crypto'
import { connect } from './db.mjs'

const only = process.argv.slice(2)

// Two words and a number: long enough for the rules, short enough to read out.
const WORDS = ['Orchid', 'Mahsuri', 'Violet', 'Kebaya', 'Nyonya', 'Ondeh', 'Spirit', 'Wish',
               'Pavilion', 'Langkawi', 'Melaka', 'Genting', 'Isetan', 'Parkson']
const pick = () => WORDS[randomBytes(1)[0] % WORDS.length]
const make = () => `${pick()}-${pick()}-${100 + (randomBytes(2).readUInt16BE(0) % 900)}`

const client = connect()
await client.connect()
try {
  const { rows } = await client.query(
    `select id, username, role, doc->>'name' as name from people
     where ($1::text[] is null or username = any($1)) order by role, username`,
    [only.length ? only : null],
  )
  const lines = []
  for (const p of rows) {
    const password = make()
    await client.query(
      `update people
          set password_history = array_append(password_history, password_hash),
              password_hash = crypt($2, gen_salt('bf', 10)),
              password_cipher = pgp_sym_encrypt($2, _password_key()),
              doc = doc || jsonb_build_object(
                'passwordChanges', coalesce((doc->>'passwordChanges')::int, 0) + 1,
                'passwordSetAt', _now_text(), 'passwordSetBy', 'System'),
              updated_at = now()
        where id = $1`,
      [p.id, password],
    )
    lines.push({ ...p, password })
  }
  const pad = (s, n) => String(s).padEnd(n)
  console.log('Legendary Retail CRM — sign-in details')
  console.log(`Issued ${new Date().toISOString().slice(0, 10)}. Hand these over in person and delete this file.\n`)
  console.log(`${pad('Name', 22)}${pad('Username', 16)}${pad('Job', 20)}Password`)
  console.log('-'.repeat(78))
  for (const l of lines) console.log(`${pad(l.name, 22)}${pad(l.username, 16)}${pad(l.role, 20)}${l.password}`)
  console.error(`\n${lines.length} passwords issued.`)
} finally {
  await client.end()
}
