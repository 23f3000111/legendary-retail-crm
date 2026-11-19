/**
 * The logins, as the open copy keeps them: everything but the passwords.
 *
 * The open copy is unencrypted, so nothing in it may open an account. Its
 * read-only login cannot even see the three password columns
 * (`0007_open_backup_reader.sql`); where a dump needs them filled — a restore
 * puts every column back — they hold placeholders that open nothing:
 *
 * - a bcrypt hash of 32 random bytes that were thrown away the moment it was
 *   made, so no password matches it, and signing in answers "wrong password"
 *   rather than the server failing on a hash it cannot read;
 * - an empty readable copy;
 * - no history.
 *
 * After a restore from the open copy, `scripts/issue-passwords.mjs` gives
 * everyone a new one. The encrypted backup keeps the real hashes.
 */
import { parseDump, writeInserts, type SqlValue } from './dump'

export const DEAD_PASSWORD_HASH = '$2a$10$uTeb0Rm1PsASq7eRak19XOrhxUddztb9ypmfQ8DrYwAfDtRF2iPs6'

/** The people table's columns, in its own order (`0001_init.sql`). */
export const PEOPLE_COLUMNS = [
  'id',
  'username',
  'role',
  'active',
  'doc',
  'password_hash',
  'password_cipher',
  'password_history',
  'updated_at',
] as const

const PLACEHOLDERS: Record<string, SqlValue> = {
  password_hash: DEAD_PASSWORD_HASH,
  password_cipher: '\\x',
  password_history: '{}',
}

/** For the open copy's schema.sql: the open login cannot dump this table's definition itself. */
export const PEOPLE_DDL = `create table public.people (
  id               text primary key,
  username         text not null unique,
  role             text not null,
  active           boolean not null default true,
  doc              jsonb not null,
  password_hash    text not null,
  password_cipher  bytea not null,
  password_history text[] not null default '{}',
  updated_at       timestamptz not null default now()
);
`

export interface OpenPerson {
  id: string
  username: string
  role: string
  active: boolean
  /** The person's document, as the server writes jsonb. */
  doc: string
  /** As the server writes a timestamptz in UTC. */
  updated_at: string
}

/**
 * Keys a login's document must never carry. The server strips them on every
 * write (0001_init.sql) and the spreadsheets drop them too (tables.ts), but
 * the open copy is unencrypted, so its SQL does not rely on either (security
 * review, 19 November). A document without them is left byte for byte.
 */
const DOC_SECRETS = ['password', 'passwordHistory']

const withoutSecrets = (doc: SqlValue): SqlValue => {
  if (typeof doc !== 'string') return doc
  const parsed: unknown = JSON.parse(doc)
  if (typeof parsed !== 'object' || parsed === null || !DOC_SECRETS.some((k) => k in parsed)) return doc
  const clean = { ...(parsed as Record<string, unknown>) }
  for (const k of DOC_SECRETS) delete clean[k]
  return JSON.stringify(clean)
}

const withPlaceholders = (p: Record<string, SqlValue>): SqlValue[] =>
  PEOPLE_COLUMNS.map((c) => (c in PLACEHOLDERS ? PLACEHOLDERS[c] : c === 'doc' ? withoutSecrets(p[c]) : p[c]))

/** The logins as INSERT statements, passwords replaced. */
export function peopleInserts(rows: OpenPerson[], rowsPerInsert = 200): string {
  return writeInserts('people', [...PEOPLE_COLUMNS], rows.map((p) => withPlaceholders({ ...p })), rowsPerInsert)
}

/**
 * A dump with every `people` INSERT rewritten with placeholder passwords and
 * every other byte left as it was. Each statement is rewritten in place, with
 * the same rows it had.
 */
export function redactDumpText(sql: string): string {
  const people = parseDump(sql).find((t) => t.name === 'people')
  if (!people) return sql
  let out = ''
  let from = 0
  for (const [start, end] of people.spans) {
    const [statement] = parseDump(sql.slice(start, end))
    const rows = statement.rows.map((values) =>
      withPlaceholders(Object.fromEntries(statement.columns.map((c, i) => [c, values[i]]))),
    )
    out += sql.slice(from, start) + writeInserts('people', [...PEOPLE_COLUMNS], rows, rows.length).replace(/\n$/, '')
    from = end
  }
  return out + sql.slice(from)
}
