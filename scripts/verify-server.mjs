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
 * **Safe on the live server.** Every check runs inside one transaction that is
 * rolled back at the end, so nothing it does persists: no test sale, no test
 * session, and no line in the activity log filed against a real person's
 * name. Checks that would lock the documents table — "Start over" — run only
 * when the server is empty, because on a live one the lock would stall every
 * promoter's screen while it held.
 */
import { connect } from './db.mjs'


const client = connect()
await client.connect()

const checks = []
const check = (name, pass, detail = '') => checks.push({ name, pass, detail })
const one = async (sql, params) => (await client.query(sql, params)).rows[0]
// An error aborts the whole transaction, so an expected one is fenced off in
// a savepoint and the transaction carries on.
let fence = 0
const refuses = async (sql) => {
  const sp = `expected_${(fence += 1)}`
  await client.query(`savepoint ${sp}`)
  try {
    await client.query(sql)
    await client.query(`release savepoint ${sp}`)
    return false
  } catch {
    await client.query(`rollback to savepoint ${sp}`)
    return true
  }
}

const { n: existing } = await one('select count(*)::int n from docs')
const live = existing > 0
console.log(
  live
    ? `Live server, ${existing} documents on it. Checking inside a transaction that is rolled back.`
    : 'Empty server. Checking everything, inside a transaction that is rolled back.',
)
console.log('')

await client.query('begin')
try {

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
  await one("select choose_store($1, 'klia-t2', 'KLIA T2') r", [promoter])
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

  // Every promoter picks at every sign-in, even in a one-outlet town — and
  // until they have, they are at no counter and can record nothing.
  const solo = await session('khookwoktsu')
  const soloBefore = await put(solo, [
    { kind: 'sale_line', id: 'sl-solo', location_id: 'melaka', doc: { skuId: 'x', qty: 1 } },
  ])
  check('a promoter must pick an outlet before recording', soloBefore.r.ok === false, soloBefore.r.error)
  const soloPick = await one("select choose_store($1, 'melaka', 'Melaka') r", [solo])
  check('a one-outlet town still offers its outlet', soloPick.r.ok === true, soloPick.r.error)
  const soloAfter = await put(solo, [
    { kind: 'sale_line', id: 'sl-solo', location_id: 'melaka', doc: { skuId: 'x', qty: 1 } },
  ])
  check('and once picked, recording works', soloAfter.r.ok === true, soloAfter.r.error)
  const who = await one('select whoami($1) r', [solo])
  check('the session remembers the outlet picked', who.r.locationId === 'melaka', who.r.locationId)

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

  // Starting over. A refusal takes no lock, so that half always runs.
  const promoterClear = await one('select clear_all_data($1) r', [promoter])
  check('a promoter cannot start over', promoterClear.r.ok === false, promoterClear.r.error)
  if (!live) {
    const itClear = await one('select clear_all_data($1) r', [imran])
    check('IT can start over', itClear.r.ok === true, itClear.r.error)
    // One line survives: the record that it happened.
    check('and it really empties the documents', (await one('select count(*)::int n from docs')).n === 1)
    check('leaving the record that it happened',
      (await one(`select count(*)::int n from docs where doc->>'action'='data.cleared'`)).n === 1)
    check('and every login untouched', (await one('select count(*)::int n from people')).n === 39)
  }
} finally {
  // Nothing above is kept: not a session, not a sale, not a line in the log.
  await client.query('rollback')
  const { n: after } = await one('select count(*)::int n from docs')
  check('and the server is exactly as it was', after === existing, `${existing} before, ${after} after`)
  await client.end()
}

const failed = checks.filter((c) => !c.pass)
for (const c of checks) {
  console.log(`${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  - ${c.detail}` : ''}`)
}
console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
if (live) {
  console.log('("Start over" was not exercised: on a live server it would lock the documents while it ran.)')
}
process.exit(failed.length ? 1 : 0)
