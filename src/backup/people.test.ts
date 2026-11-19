import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/0001_init.sql?raw'
import { parseDump } from './dump'
import { DEAD_PASSWORD_HASH, PEOPLE_DDL, peopleInserts, redactDumpText } from './people'

const HASH = '$2a$10$uTeb0Rm1PsASq7eRak19XOrhxUddztb9ypmfQ8DrYwAfDtRF2iPs6'
const COLUMNS = ['id', 'username', 'role', 'active', 'doc', 'password_hash', 'password_cipher', 'password_history', 'updated_at']

describe('the open copy of the logins', () => {
  it("writes people with placeholder passwords, in the table's column order", () => {
    const sql = peopleInserts([
      { id: 'kelly', username: 'kellytew', role: 'ops', active: true, doc: '{"name": "Kelly Tew"}', updated_at: '2026-09-22 04:54:52.651+00' },
    ])
    const [people] = parseDump(sql)
    expect(people.name).toBe('people')
    expect(people.columns).toEqual(COLUMNS)
    expect(people.rows).toEqual([
      ['kelly', 'kellytew', 'ops', true, '{"name": "Kelly Tew"}', HASH, '\\x', '{}', '2026-09-22 04:54:52.651+00'],
    ])
  })

  it('the placeholder is a well-formed bcrypt hash', () => {
    // So that signing in after a restore answers "wrong password" instead of
    // the server failing on a hash it cannot read.
    expect(DEAD_PASSWORD_HASH).toMatch(/^\$2[ab]\$10\$[./A-Za-z0-9]{53}$/)
  })

  it('takes the passwords out of a dump and leaves everything else as it was', () => {
    const header = '--\n-- PostgreSQL database dump\n--\n\n\\restrict 9c\n\nSET standard_conforming_strings = on;\n\n'
    const docs = "INSERT INTO public.docs (kind, id, doc) VALUES\n\t('audit', 'au-1', '{\"summary\": \"it''s\"}');"
    const realHash = '$2a$10$O2qVb5t0W9ZsH9wq6jOq0e6S4n3m1aQ9b8r7c6d5e4f3g2h1i0j1k'
    const people =
      'INSERT INTO public.people (id, username, role, active, doc, password_hash, password_cipher, password_history, updated_at) VALUES\n' +
      `\t('kelly', 'kellytew', 'ops', true, '{"name": "Kelly Tew"}', '${realHash}', '\\xc30d0409', '{${realHash}}', '2026-09-22 04:54:52.651+00');`
    const settings = "INSERT INTO public.settings (key, value) VALUES\n\t('two_step', 'false');"
    const trailer = '\n\n\\unrestrict 9c\n'
    const sql = `${header}${docs}\n\n${people}\n\n${settings}${trailer}`

    const out = redactDumpText(sql)

    const redacted =
      'INSERT INTO public.people (id, username, role, active, doc, password_hash, password_cipher, password_history, updated_at) VALUES\n' +
      `\t('kelly', 'kellytew', 'ops', true, '{"name": "Kelly Tew"}', '${HASH}', '\\x', '{}', '2026-09-22 04:54:52.651+00');`
    expect(out).toBe(`${header}${docs}\n\n${redacted}\n\n${settings}${trailer}`)
    expect(out).not.toContain(realHash)
    expect(out).not.toContain('c30d0409')
  })

  it('PEOPLE_DDL matches the people table in 0001_init.sql', () => {
    const inMigration = /create table if not exists people \(([\s\S]*?)\n\);/.exec(migration)?.[1]
    const inDdl = /create table public\.people \(([\s\S]*?)\n\);/.exec(PEOPLE_DDL)?.[1]
    expect(inMigration).toBeDefined()
    expect(inDdl).toBeDefined()
    expect(columnsOf(inDdl!)).toEqual(columnsOf(inMigration!))
  })
})

/** name, type and whether it may be empty, for each column of a CREATE TABLE body. */
function columnsOf(body: string) {
  // A Windows checkout has CRLF line ends; the comment-stripping must see each line whole.
  return body
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, '').trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((l) => {
      const [name, type] = l.split(/\s+/)
      return { name, type, required: /not null|primary key/.test(l) }
    })
}
