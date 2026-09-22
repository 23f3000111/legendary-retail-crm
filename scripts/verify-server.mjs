/**
 * Checks the rules the SQL is supposed to enforce, against a real database.
 *
 *   DATABASE_URL=postgresql://... node scripts/verify-server.mjs
 *
 * The vitest suite runs against the local backend, so nothing there can catch
 * a mistake in `0001_init.sql` — and one of them (a BEFORE DELETE trigger
 * returning NEW, which is null, silently cancelling every delete) was exactly
 * the kind that looks fine until the day somebody presses "Start over".
 *
 * It creates its own rows and clears up after itself, and refuses to run if
 * the server already holds documents, so it can never wipe a trial in
 * progress.
 */
import { connect } from './db.mjs'


const client = connect()
await client.connect()

const checks = []
const check = (name, pass, detail = '') => checks.push({ name, pass, detail })
const one = async (sql, params) => (await client.query(sql, params)).rows[0]
const refuses = async (sql) => {
  try {
    await client.query(sql)
    return false
  } catch {
    return true
  }
}

try {
  const { n: existing } = await one('select count(*)::int n from docs')
  if (existing > 0) {
    console.error(`Refusing to run: ${existing} documents are already on this server.`)
    console.error('This check clears up after itself, so it only runs on an empty one.')
    process.exit(1)
  }

  check('the 39 logins are there', (await one('select count(*)::int n from people')).n === 39)

  // Nothing without a session.
  check('no session, no data', (await one('select load_state(null) r')).r.ok === false)
  check('no session, no write', (await one("select put_docs('nope', '[]'::jsonb) r")).r.ok === false)

  // The activity log is append-only.
  await client.query(`insert into docs(kind,id,doc)
    values ('audit','au-verify','{"summary":"original"}'::jsonb) on conflict (kind,id) do nothing`)
  check(
    'a log line cannot be edited',
    await refuses(`update docs set doc='{"summary":"tampered"}'::jsonb
                   where kind='audit' and id='au-verify'`),
  )
  check('a log line cannot be deleted', await refuses(
    `delete from docs where kind='audit' and id='au-verify'`))

  // ...but an ordinary document can be.
  await client.query(`insert into docs(kind,id,doc) values ('target','t-verify','{}'::jsonb)
    on conflict (kind,id) do nothing`)
  await client.query(`delete from docs where kind='target' and id='t-verify'`)
  check('an ordinary document still deletes',
    (await one(`select count(*)::int n from docs where kind='target' and id='t-verify'`)).n === 0)

  const session = async (username) => {
    const { id } = await one('select id from people where username = $1', [username])
    const token = `verify-${Math.random().toString(36).slice(2)}`
    await client.query('insert into sessions(token, person_id) values ($1,$2)', [token, id])
    return token
  }
  const promoter = await session('teokoknian')
  const imran = await session('imran')
  const vins = await session('vinslim')
  const put = (token, docs) => one('select put_docs($1, $2::jsonb) r', [token, JSON.stringify(docs)])

  const otherStore = await put(promoter, [
    { kind: 'sale_line', id: 'sl-verify', location_id: 'pavilion-5', doc: {} },
  ])
  check('a promoter cannot write for another store', otherStore.r.ok === false, otherStore.r.error)

  const ownStore = await put(promoter, [
    { kind: 'sale_line', id: 'sl-verify', location_id: 'klia-t2', doc: { skuId: 'x', qty: 1 } },
  ])
  check('a promoter can write for their own store', ownStore.r.ok === true, ownStore.r.error)

  const target = await put(promoter, [{ kind: 'target', id: 'klia-t2::2026-09', doc: {} }])
  check('a promoter cannot set a target', target.r.ok === false, target.r.error)

  const readOnly = await put(vins, [{ kind: 'target', id: 'klia-t2::2026-09', doc: {} }])
  check('the founder is read-only', readOnly.r.ok === false, readOnly.r.error)

  // The log is filed against the session, not against whatever was sent.
  await put(promoter, [
    {
      kind: 'audit',
      id: 'au-verify-actor',
      doc: { id: 'au-verify-actor', actorId: 'davy', actorName: 'Lim Davy', summary: 'forged' },
    },
  ])
  const stamped = await one(
    `select doc->>'actorName' n from docs where kind='audit' and id='au-verify-actor'`,
  )
  check('the log names whoever is signed in', stamped?.n === 'Teo Kok Nian', `got ${stamped?.n}`)

  // Where a promoter may be rostered.
  check('the outlets are loaded', (await one("select count(*)::int n from locations")).n > 0)
  const kl = await session('danzeltan')
  const klPick = await one("select choose_store($1, 'klcc-isetan', 'KLCC Isetan') r", [kl])
  check('a promoter can pick another outlet in their town', klPick.r.ok === true, klPick.r.error)
  const klWrong = await one("select choose_store($1, 'klia-t2', 'KLIA T2') r", [kl])
  check('but not one in another town', klWrong.r.ok === false, klWrong.r.error)
  const klClosed = await one("select choose_store($1, 'trx', 'TRX') r", [kl])
  check('nor one that has not opened', klClosed.r.ok === false, klClosed.r.error)
  const klWrite = await put(kl, [
    { kind: 'sale_line', id: 'sl-kl', location_id: 'klcc-isetan', doc: { skuId: 'x', qty: 1 } },
  ])
  check('and writes go to the outlet they picked', klWrite.r.ok === true, klWrite.r.error)

  // A town with one outlet asks nothing, so the session must find it anyway —
  // otherwise those promoters could write nothing at all.
  const solo = await session('khookwoktsu')
  const soloWrite = await put(solo, [
    { kind: 'sale_line', id: 'sl-solo', location_id: 'melaka', doc: { skuId: 'x', qty: 1 } },
  ])
  check('a one-outlet town needs no choice before writing', soloWrite.r.ok === true, soloWrite.r.error)

  // Passwords.
  const weak = await one("select set_password($1, 'kim', 'legendary123') r", [imran])
  check('a weak password is refused', weak.r.ok === false, weak.r.error)
  const notMine = await one("select set_password($1, 'davy', 'kebaya-tanjung-417') r", [promoter])
  check('a promoter cannot set another password', notMine.r.ok === false, notMine.r.error)
  const peek = await one("select reveal_password($1, 'davy') r", [promoter])
  check('a promoter cannot read a password', peek.r.ok === false, peek.r.error)
  const itPeek = await one("select reveal_password($1, 'davy') r", [imran])
  check('IT can read a password', itPeek.r.ok === true && Boolean(itPeek.r.password))
  check('and the look-up is recorded',
    (await one(`select count(*)::int n from docs where doc->>'action'='password.revealed'`)).n > 0)

  // Sign-in never says which half was wrong.
  const noUser = await one("select sign_in('nobody-here', 'whatever-123') r")
  const badPw = await one("select sign_in('kellytew', 'whatever-123') r")
  check('sign-in gives nothing away', noUser.r.error === badPw.r.error, noUser.r.error)

  // Starting over.
  const promoterClear = await one('select clear_all_data($1) r', [promoter])
  check('a promoter cannot start over', promoterClear.r.ok === false, promoterClear.r.error)
  const itClear = await one('select clear_all_data($1) r', [imran])
  check('IT can start over', itClear.r.ok === true, itClear.r.error)
  // One line survives: the record that it happened.
  check('and it really empties the documents', (await one('select count(*)::int n from docs')).n === 1)
  check('leaving the record that it happened',
    (await one(`select count(*)::int n from docs where doc->>'action'='data.cleared'`)).n === 1)
  check('and every login untouched', (await one('select count(*)::int n from people')).n === 39)
} finally {
  await client.query('delete from sessions')
  await client.query('delete from login_attempts')
  // The log guard has no off switch, so clearing up goes the same way the
  // app does: disable the trigger inside one transaction, and put it back.
  await client.query('begin')
  await client.query('alter table docs disable trigger docs_audit_append_only')
  await client.query('delete from docs')
  await client.query('alter table docs enable trigger docs_audit_append_only')
  await client.query('commit')
  await client.end()
}

const failed = checks.filter((c) => !c.pass)
for (const c of checks) {
  console.log(`${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  - ${c.detail}` : ''}`)
}
console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
process.exit(failed.length ? 1 : 0)
