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

  check('the 40 logins are there', (await one('select count(*)::int n from people')).n === 40)

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
  // Sogo 118 and TRX are open (18 November): any Kuala Lumpur promoter may pick them.
  for (const [id, name] of [['sogo-118', 'Sogo 118'], ['trx', 'TRX']]) {
    const opened = await one('select choose_store($1, $2, $3) r', [kl, id, name])
    check(`a Kuala Lumpur promoter can pick ${name}, now open`, opened.r.ok === true, opened.r.error)
  }
  const klPick = await one("select choose_store($1, 'klcc-isetan', 'KLCC Isetan') r", [kl])
  check('a promoter can pick another outlet in their town', klPick.r.ok === true, klPick.r.error)
  const klWrong = await one("select choose_store($1, 'klia-t2', 'KLIA T2') r", [kl])
  check('but not one in another town', klWrong.r.ok === false, klWrong.r.error)
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
  const soloClosed = await one("select choose_store($1, 'melaka-parkland', 'Melaka Parkland Mall') r", [solo])
  check('nor one in their town that has not opened', soloClosed.r.ok === false, soloClosed.r.error)
  const soloPick = await one("select choose_store($1, 'melaka', 'Melaka') r", [solo])
  check('a one-outlet town still offers its outlet', soloPick.r.ok === true, soloPick.r.error)
  const soloAfter = await put(solo, [
    { kind: 'sale_line', id: 'sl-solo', location_id: 'melaka', doc: { skuId: 'x', qty: 1 } },
  ])
  check('and once picked, recording works', soloAfter.r.ok === true, soloAfter.r.error)
  const who = await one('select whoami($1) r', [solo])
  check('the session remembers the outlet picked', who.r.locationId === 'melaka', who.r.locationId)

  // Changing a filed day (client, 29 September). The store changes today's
  // outright; an earlier day's only by asking, for three days; only Kelly or
  // Davy decide. These closings exist only inside this transaction.
  const daysAgo = async (n) =>
    (await one(`select to_char(_today()::date - $1::int, 'YYYY-MM-DD') d`, [n])).d
  const filedDay = async (id, day) => {
    const doc = { id, locationId: 'klia-t2', period: day, revenueMYR: 800, tender: { cash: 800, ewallet: 0, card: 0 }, lines: [] }
    await client.query(
      `insert into docs(kind, id, location_id, day, doc) values ('closing', $1, 'klia-t2', $2, $3::jsonb)`,
      [id, day, JSON.stringify(doc)],
    )
    return doc
  }
  const closingPut = (token, doc) =>
    put(token, [{ kind: 'closing', id: doc.id, location_id: 'klia-t2', day: doc.period, doc }])
  const request = {
    status: 'pending',
    reason: 'verify',
    requestedBy: 'Teo Kok Nian',
    requestedAt: '2026-01-01T00:00:00.000Z',
    previousRevenueMYR: 800,
  }

  const earlier = await filedDay('verify-closing-earlier', await daysAgo(1))
  const outright = await closingPut(promoter, { ...earlier, revenueMYR: 1 })
  check('a store cannot change an earlier day outright', outright.r.ok === false, outright.r.error)
  const asked = await closingPut(promoter, { ...earlier, correction: request })
  check('but can ask Kelly to change it', asked.r.ok === true, asked.r.error)
  const selfApproved = await closingPut(promoter, { ...earlier, correction: { ...request, status: 'approved' } })
  check('and cannot approve its own request', selfApproved.r.ok === false, selfApproved.r.error)
  const kelly = await session('kellytew')
  const approvedDoc = { ...earlier, revenueMYR: 900, correction: { ...request, status: 'approved', approvedBy: 'Kelly Tew' } }
  const approved = await closingPut(kelly, approvedDoc)
  check('Kelly can approve it', approved.r.ok === true, approved.r.error)
  const { correction: _decided, ...undone } = approvedDoc
  const undo = await closingPut(promoter, undone)
  check('and the store cannot undo her decision', undo.r.ok === false, undo.r.error)

  const tooOld = await filedDay('verify-closing-old', await daysAgo(5))
  const late = await closingPut(promoter, { ...tooOld, correction: request })
  check('nor ask after three days', late.r.ok === false, late.r.error)

  const todays = await filedDay('verify-closing-today', await daysAgo(0))
  const same = await closingPut(promoter, { ...todays, revenueMYR: 950 })
  check("a store changes today's closing outright", same.r.ok === true, same.r.error)
  const gone = await one('select remove_docs($1, $2, $3::text[]) r', [promoter, 'closing', [todays.id]])
  check('but cannot delete a filed day', gone.r.ok === false, gone.r.error)

  // Every product counted at 0 on a day that sold is no count (26 November),
  // whichever version of the app sends it: KLIA T2 filed one from a phone
  // still on the version before the app refused it.
  const zeroDay = await daysAgo(0)
  const zeroDoc = {
    id: 'verify-closing-zero',
    locationId: 'klia-t2',
    period: zeroDay,
    revenueMYR: 188,
    tender: { cash: 0, ewallet: 0, card: 188 },
    lines: [{ skuId: 'orchid-retail', qty: 1 }],
    stockCount: [
      { skuId: 'orchid-retail', opening: 0, counted: 0 },
      { skuId: 'violet-retail', opening: 0, counted: 0 },
    ],
  }
  const zero = await closingPut(promoter, zeroDoc)
  check(
    'every product at 0 on a day that sold is refused',
    zero.r.ok === false && /Every product is at 0/.test(zero.r.error ?? ''),
    zero.r.error,
  )
  const quiet = await closingPut(promoter, { ...zeroDoc, id: 'verify-closing-quiet', lines: [], revenueMYR: 0 })
  check('but not on a day that sold nothing', quiet.r.ok === true, quiet.r.error)
  const real = await closingPut(promoter, {
    ...zeroDoc,
    stockCount: [{ ...zeroDoc.stockCount[0], counted: 4 }, zeroDoc.stockCount[1]],
  })
  check('and a real count goes through', real.r.ok === true, real.r.error)
  await client.query(
    `insert into docs(kind, id, location_id, day, doc) values ('closing', $1, 'klia-t2', $2, $3::jsonb)`,
    ['verify-closing-zero-filed', zeroDay, JSON.stringify({ ...zeroDoc, id: 'verify-closing-zero-filed' })],
  )
  const followed = await closingPut(promoter, {
    ...zeroDoc,
    id: 'verify-closing-zero-filed',
    revenueMYR: 376,
    lines: [...zeroDoc.lines, { skuId: 'violet-retail', qty: 1 }],
  })
  check('a day filed at 0 before can still be changed, its counts left as they were', followed.r.ok === true, followed.r.error)

  // A full load leaves out the sale lines a filed closing already carries
  // (16 November): they were most of what head office was sent at sign-in.
  // Today's lines still come, filed or not, and so does a day not yet filed;
  // a changed line still reaches every device on the next look.
  const lineOn = (id, day) =>
    client.query(
      `insert into docs(kind, id, location_id, day, doc) values ('sale_line', $1, 'klia-t2', $2, $3::jsonb)`,
      [id, day, JSON.stringify({ id, saleId: id, skuId: 'x', qty: 1, day, locationId: 'klia-t2' })],
    )
  const { d: neverFiled } = await one(
    `select to_char(d, 'YYYY-MM-DD') d
       from generate_series(_today()::date - 400, _today()::date - 1, interval '1 day') d
      where not exists (select 1 from docs k where k.kind = 'closing' and k.location_id = 'klia-t2'
                                              and k.day = to_char(d, 'YYYY-MM-DD'))
      order by d limit 1`,
  )
  await lineOn('sl-verify-filed', tooOld.period)
  await lineOn('sl-verify-today', todays.period)
  await lineOn('sl-verify-unfiled', neverFiled)
  const sent = new Set((await one('select load_state($1) r', [kelly])).r.docs.map((d) => d.id))
  check('a full load leaves out the sale lines of a filed day', !sent.has('sl-verify-filed'))
  check("but sends today's, and a day not yet filed",
    sent.has('sl-verify-today') && sent.has('sl-verify-unfiled'))
  const { t: justBefore } = await one(
    `select to_char((now() - interval '1 second') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') t`,
  )
  const again = (await one('select load_state($1, $2) r', [kelly, justBefore])).r
  check('and a changed line still reaches every device', again.docs.some((d) => d.id === 'sl-verify-filed'))

  // Dealers' and consignment partners' months, keyed in at head office
  // (client's fifth revision): Davy, Kelly, Chloe and Finance only.
  const partnerDoc = (id, over = {}) => [
    {
      kind: 'partner_sales',
      id: `${id}::2026-09`,
      location_id: id,
      day: '2026-09-01',
      doc: { locationId: id, month: '2026-09', revenueMYR: 1200.5, enteredBy: 'verify', enteredAt: 'x', ...over },
    },
  ]
  const finance = await session('siewfang')
  const keyedByFinance = await put(finance, partnerDoc('dlr-beauty-scent'))
  check('Finance can key in a dealer’s month', keyedByFinance.r.ok === true, keyedByFinance.r.error)
  const keyedByPromoter = await put(promoter, partnerDoc('dlr-zapin'))
  check('a promoter cannot', keyedByPromoter.r.ok === false, keyedByPromoter.r.error)
  const warehouse = await session('xianan')
  const keyedByWarehouse = await put(warehouse, partnerDoc('dlr-zapin'))
  check('nor can the warehouse', keyedByWarehouse.r.ok === false, keyedByWarehouse.r.error)
  const forMainStore = await put(finance, partnerDoc('pavilion-5'))
  check('a main store’s sales are never keyed in', forMainStore.r.ok === false, forMainStore.r.error)
  const below = await put(finance, partnerDoc('dlr-zapin', { revenueMYR: -1 }))
  check('nor a figure below 0', below.r.ok === false, below.r.error)
  const claimed = await put(finance, partnerDoc('dlr-zapin', { enteredBy: 'Lim Davy' }))
  const signed = await one(
    `select doc->>'enteredBy' as entered_by from docs where kind = 'partner_sales' and id = 'dlr-zapin::2026-09'`,
  )
  const { name: financeName } = await one(`select doc->>'name' as name from people where username = 'siewfang'`)
  check(
    'a figure is signed by whoever sent it',
    claimed.r.ok === true && signed?.entered_by === financeName,
    signed?.entered_by ?? claimed.r.error,
  )

  // Products, kept by Davy, Kelly and Chloe (client, 20 October).
  const productDoc = (over = {}) => [
    {
      kind: 'product',
      id: 'verify-orchid-retail-75ml',
      doc: {
        skuId: 'verify-orchid-retail-75ml',
        productId: 'orchid',
        variant: 'retail',
        size: '75ml',
        code: 'LGD-ORC-R75',
        retailPriceMYR: 288,
        promotionPriceMYR: 238,
        reorderPoint: 12,
        caseSize: 6,
        changedBy: 'Somebody Else',
        ...over,
      },
    },
  ]
  const added = await put(kelly, productDoc())
  check('Kelly can add a product', added.r.ok === true, added.r.error)
  const productSigned = await one(
    `select doc->>'changedBy' as changed_by from docs where kind = 'product' and id = 'verify-orchid-retail-75ml'`,
  )
  const { name: kellyName } = await one(`select doc->>'name' as name from people where username = 'kellytew'`)
  check('and the product is signed by whoever sent it', productSigned?.changed_by === kellyName, productSigned?.changed_by)
  const byFinance = await put(finance, productDoc())
  check('Finance cannot', byFinance.r.ok === false, byFinance.r.error)
  const byStore = await put(solo, productDoc())
  check('nor can a promoter', byStore.r.ok === false, byStore.r.error)
  const badPrice = await put(kelly, productDoc({ promotionPriceMYR: -5 }))
  check('a product with a price below 0 is refused', badPrice.r.ok === false, badPrice.r.error)
  const goneProduct = await one('select remove_docs($1, $2, $3::text[]) r', [kelly, 'product', ['verify-orchid-retail-75ml']])
  check('a product is taken off, never deleted', goneProduct.r.ok === false, goneProduct.r.error)

  // The order the range is listed in, arranged by Davy, Kelly or Chloe
  // (Revision 10, 16 November). One record for the whole range.
  const orderDoc = (over = {}) => [
    {
      kind: 'product_order',
      id: 'range',
      doc: { skuIds: ['dream-retail', 'orchid-retail', 'orchid-vial'], changedBy: 'Somebody Else' },
      ...over,
    },
  ]
  const arranged = await put(kelly, orderDoc())
  check('Kelly can arrange the range', arranged.r.ok === true, arranged.r.error)
  const orderSigned = await one(`select doc->>'changedBy' as changed_by from docs where kind = 'product_order' and id = 'range'`)
  check('and the order is signed by whoever sent it', orderSigned?.changed_by === kellyName, orderSigned?.changed_by)
  const orderByFinance = await put(finance, orderDoc())
  check('Finance cannot arrange it', orderByFinance.r.ok === false, orderByFinance.r.error)
  const orderByStore = await put(solo, orderDoc())
  check('nor can a promoter', orderByStore.r.ok === false, orderByStore.r.error)
  const twice = await put(kelly, orderDoc({ doc: { skuIds: ['orchid-retail', 'orchid-retail'] } }))
  check('a product listed twice is refused', twice.r.ok === false, twice.r.error)
  const notIds = await put(kelly, orderDoc({ doc: { skuIds: ['Not An Id'] } }))
  check('something that is not a product is refused', notIds.r.ok === false, notIds.r.error)
  const noList = await put(kelly, orderDoc({ doc: {} }))
  check('an order with no list is refused', noList.r.ok === false, noList.r.error)
  const otherId = await put(kelly, orderDoc({ id: 'elsewhere' }))
  check('an order filed under another name is refused', otherId.r.ok === false, otherId.r.error)
  const forAStore = await put(kelly, orderDoc({ location_id: 'bsas' }))
  check('an order for one store is refused', forAStore.r.ok === false, forAStore.r.error)

  // An order saved as a draft, without closing the day (20 October): the
  // store may delete its draft, and nobody may delete an order once sent.
  const order = (id, status) => [
    { kind: 'po', id, location_id: 'melaka', doc: { id, locationId: 'melaka', status, lines: [], events: [] } },
  ]
  await put(solo, order('PO-VERIFY-DRAFT', 'draft'))
  await put(solo, order('PO-VERIFY-SENT', 'submitted'))
  const draftGone = await one('select remove_docs($1, $2, $3::text[]) r', [solo, 'po', ['PO-VERIFY-DRAFT']])
  check('a store can delete its own draft order', draftGone.r.ok === true, draftGone.r.error)
  const sentKept = await one('select remove_docs($1, $2, $3::text[]) r', [solo, 'po', ['PO-VERIFY-SENT']])
  check('but not an order it has sent', sentKept.r.ok === false, sentKept.r.error)
  // Every write is held to the order's chain: no way round that.
  const backToDraft = await put(solo, order('PO-VERIFY-SENT', 'draft'))
  check('nor turn a sent order back into a draft', backToDraft.r.ok === false, backToDraft.r.error)
  const ownApproval = await put(solo, order('PO-VERIFY-SENT', 'approved'))
  check('nor approve its own order', ownApproval.r.ok === false, ownApproval.r.error)
  const kellyApproves = await put(kelly, order('PO-VERIFY-SENT', 'approved'))
  check('Kelly approves it', kellyApproves.r.ok === true, kellyApproves.r.error)

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

  // The open copy's login (19 November) reads what a backup holds, and from
  // the logins only what is not a password. Acting as it needs a membership
  // the admin login does not have; the grant is rolled back with the rest.
  const openReader = await (async () => {
    await client.query('savepoint open_reader')
    try {
      await client.query('grant backup_open_reader to postgres with set true')
      await client.query('set local role backup_open_reader')
      const docs = (await one('select count(*)::int n from docs')).n
      const people = (await refuses('select id, username, role, active, doc, updated_at from people limit 1'))
        ? 0
        : (await one('select count(*)::int n from people')).n
      const password = await refuses('select password_hash from people limit 1')
      const write = await refuses(`insert into docs(kind, id, doc) values ('target', 'open-reader-verify', '{}'::jsonb)`)
      const call = await refuses('select load_state(null)')
      await client.query('reset role')
      await client.query('release savepoint open_reader')
      return { docs, people, password, write, call }
    } catch (e) {
      await client.query('rollback to savepoint open_reader')
      return { error: e.message }
    }
  })()
  check("the open copy's login reads the documents", openReader.docs > 0, openReader.error)
  check('and the logins without their passwords', openReader.people > 0, openReader.error)
  check('but never a password', openReader.password === true, openReader.error)
  check('nor writes anything', openReader.write === true, openReader.error)
  check("nor calls the app's functions", openReader.call === true, openReader.error)

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
    check('and every login untouched', (await one('select count(*)::int n from people')).n === 40)
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
