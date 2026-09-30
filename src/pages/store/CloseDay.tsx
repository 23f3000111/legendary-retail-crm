import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { Field, NumberInput, Select, TextArea } from '../../components/ui/Field'
import { Flag } from '../../components/ui/Flag'
import { Icon } from '../../components/ui/icons'
import { ChangeList, Notice } from '../../components/ui/Notice'
import { SaleEditor, type SaleDraft } from '../../components/SaleEditor'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import {
  selectClosingFor,
  selectClosingOutOfStep,
  selectStock,
  selectSuggestedPoLines,
} from '../../store/selectors'
import { locationById, type Location } from '../../data/locations'
import {
  lineUnitPrice,
  orderableSkus,
  skuById,
  skuLabel,
  testerSkus,
  TIER_LABEL,
} from '../../data/products'
import { countryByCode, MALAYSIA_SEGMENT_LABEL } from '../../data/countries'
import { formatDate, formatTimestamp } from '../../lib/dates'
import { num } from '../../lib/format'
import { newId, newOrderId } from '../../lib/ids'
import { closingEditMode, CORRECTION_WINDOW_DAYS, type ClosingEditMode } from '../../lib/editing'
import { clock, describeLineChanges, describeClosingChanges, figuresOf, money, toSen } from '../../lib/changes'
import type { Result } from '../../api/backend'
import type {
  Closing,
  ClosingFigures,
  DateStr,
  PurchaseOrder,
  SaleLine,
  StockCount,
} from '../../data/types'

/**
 * Closing the day — and changing it afterwards — on one page, already filled in.
 *
 * The client asked three times for closing to be simpler, and each time the
 * thing in the way was the same: the promoter was being asked to type what the
 * system already knew. It knows every sale they recorded, so it knows what sold
 * and what the shelf should therefore hold. So:
 *
 *   · the sales are filled in from Record a sale — nothing to re-enter
 *   · every count box starts at what the shelf should hold, so the promoter
 *     only touches the lines that are actually different
 *   · type the cash and the card fills itself in, so the money always adds up
 *   · the top-up already carries whatever is running low
 *
 * **Changing a closing** is the same page, opened on what was filed: the cash
 * as typed, every count as counted, the sales as they stand. Change the one
 * figure that is wrong and save — the fourth time the client asked, it was for
 * exactly this (29 September): a wrong figure used to mean filling in the whole
 * day again, and every box came back wrong.
 *
 * Who may change what is in `lib/editing.ts`: the store changes today's
 * outright; an earlier day's, for three days, goes to Kelly or Davy to approve
 * (Q19), and nothing moves until they do; Kelly and Davy change any day,
 * opening this page from their own screens with `?store=`.
 *
 * Most closings are filed on a phone, so below `sm` every list here is a stack
 * of cards with the box to type in always on screen. The shelf table only
 * appears where there is room for it.
 *
 * A day with no sales can still be closed, and an order still raised (client's
 * third revision). A day that was missed can be filed late from the Today
 * screen, which opens this page with `?day=`. The deadline is 11pm and anyone
 * at the counter may file it (Q17, Q18).
 */
export function CloseDay() {
  const [params] = useSearchParams()
  const user = useCurrentUser()
  const capability = useCan()
  const data = useData()

  // Kelly and Davy open any store's closing from their screens; everyone else
  // gets their own counter's.
  const named = params.get('store')
  const locationId = named && capability.approveCorrections ? named : (user?.locationId ?? '')
  const location = locationById(locationId)
  const asked = params.get('day')
  const day = asked && asked <= data.today ? asked : data.today
  const filed = selectClosingFor(data, locationId, day)

  if (!user) return null
  if (data.syncStatus === 'idle' || data.syncStatus === 'loading') {
    return (
      <Panel>
        <EmptyState icon="clock" title="Loading the day…" body="One moment while the latest figures arrive." />
      </Panel>
    )
  }
  if (!location) {
    return (
      <Panel>
        <EmptyState
          icon="clipboard"
          title="Open a store's closing from its own page"
          body="Pick a store on the Closings or Stores screen, then the day you want."
        />
      </Panel>
    )
  }

  if (!filed) {
    // Nothing filed: closing it is the promoter's, at their own counter.
    if (user.role !== 'promoter') {
      return (
        <Panel>
          <EmptyState
            icon="clipboard"
            title={`${location.shortName} has not filed ${formatDate(day)}`}
            body="A day is closed by the promoter at the counter. Once it is filed it can be changed here."
          />
        </Panel>
      )
    }
    return <ClosingForm key={`${locationId}:${day}:new`} location={location} day={day} mode="new" />
  }

  const mode = closingEditMode(user, user.locationId, filed, data.today)
  const waiting = filed.correction?.status === 'pending'
  const editing =
    params.get('edit') === '1' &&
    (mode === 'request' || (mode === 'direct' && !waiting))

  return editing ? (
    <ClosingForm
      key={`${locationId}:${day}:${mode}`}
      location={location}
      day={day}
      filed={filed}
      mode={mode as 'direct' | 'request'}
    />
  ) : (
    <FiledDay location={location} day={day} filed={filed} mode={mode} />
  )
}

/** A link back into this page, keeping the store for head office. */
const closeHref = (locationId: string, day: DateStr, today: DateStr, forStore: boolean): string => {
  const q = new URLSearchParams()
  if (forStore) q.set('store', locationId)
  if (day !== today) q.set('day', day)
  q.set('edit', '1')
  return `/close?${q.toString()}`
}

const filedLine = (c: Closing): string =>
  `Filed by ${c.submittedBy} at ${formatTimestamp(c.submittedAt)}` +
  (c.editedBy && c.editedAt ? ` · changed by ${c.editedBy} at ${formatTimestamp(c.editedAt)}` : '')

// ── A day already filed ─────────────────────────────────────────────────────

function FiledDay({
  location,
  day,
  filed,
  mode,
}: {
  location: Location
  day: DateStr
  filed: Closing
  mode: ClosingEditMode
}) {
  const navigate = useNavigate()
  const data = useData()
  const user = useCurrentUser()
  const capability = useCan()
  const resolveCorrection = useData((s) => s.resolveCorrection)
  const push = useToasts((s) => s.push)
  const [turningDown, setTurningDown] = useState(false)
  const [why, setWhy] = useState('')
  const atCounter = user?.role === 'promoter'
  const isToday = day === data.today
  const outOfStep = isToday && selectClosingOutOfStep(data, location.id)
  const correction = filed.correction
  const waiting = correction?.status === 'pending'
  const href = closeHref(location.id, day, data.today, !atCounter)
  const units = filed.lines.reduce((a, l) => a + l.qty, 0)
  // Kelly or Davy, looking at a day a store has asked to correct: decide it here.
  const decides = waiting && capability.approveCorrections

  const decide = (approve: boolean) => {
    if (!user) return
    const result = resolveCorrection({
      closingId: filed.id,
      approvedBy: user.name,
      role: user.role,
      approve,
      note: approve ? undefined : why.trim() || undefined,
    })
    if (!result.ok) return push(result.error ?? 'That could not be decided.', 'critical')
    push(approve ? 'Correction approved — the closing now reads as corrected' : 'Correction turned down', approve ? 'good' : 'info')
    setTurningDown(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Panel>
        <PanelHeader eyebrow={location.name} title={`${formatDate(day)} is closed`} meta={filedLine(filed)} />
        <Rule />
        <PanelBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Sales', value: money(filed.revenueMYR), strong: true },
              { label: 'Units', value: num(units) },
              { label: 'Cash', value: money(filed.tender?.cash ?? 0) },
              { label: 'Card', value: money(filed.tender?.card ?? 0) },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <p className="eyebrow">{f.label}</p>
                <p className={`readout mt-1 text-[15px] ${f.strong ? 'font-semibold text-primary' : 'text-ink'}`}>
                  {f.value}
                </p>
              </div>
            ))}
          </div>

          {outOfStep && (
            <Notice tone="warn" icon="alert">
              <b>The sales have changed since this was filed.</b> Update the closing so it matches —
              the cash and the counts stay as they were unless you change them.
            </Notice>
          )}

          {correction && (
            <Notice tone={waiting ? 'warn' : correction.status === 'approved' ? 'good' : 'neutral'} icon="clipboard">
              <b>
                {waiting
                  ? `${correction.requestedBy} asked to correct this day — waiting for Kelly or Davy.`
                  : correction.status === 'approved'
                    ? `Corrected — asked for by ${correction.requestedBy}, approved by ${correction.approvedBy}.`
                    : `A correction asked for by ${correction.requestedBy} was turned down by ${correction.approvedBy}.`}
              </b>{' '}
              {correction.reason}
              {correction.status === 'rejected' && correction.note ? ` — “${correction.note}”` : ''}
              {waiting && correction.changes?.length ? <ChangeList changes={correction.changes} className="mt-2" /> : null}
            </Notice>
          )}

          {mode === 'locked' && (
            <Notice tone="neutral" icon="lock">
              This day is more than {CORRECTION_WINDOW_DAYS} days old, so it can no longer be changed from
              the counter. Kelly or Davy can still change it.
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" icon="chevronLeft" onClick={() => (atCounter ? navigate('/today') : navigate(-1))}>
              Back
            </Button>
            {mode === 'direct' && !waiting && (
              <Link to={href} className="flex-1 sm:flex-none">
                <Button variant="primary" icon="pencil" className="w-full">
                  {outOfStep ? 'Update the closing' : 'Change this closing'}
                </Button>
              </Link>
            )}
            {decides && !turningDown && (
              <>
                <Button variant="ghost" className="sm:ml-auto" onClick={() => setTurningDown(true)}>
                  Turn down
                </Button>
                <Button variant="primary" icon="check" className="flex-1 sm:flex-none" onClick={() => decide(true)}>
                  Approve the correction
                </Button>
              </>
            )}
            {mode === 'request' && (
              <Link to={href} className="flex-1 sm:flex-none">
                <Button variant="primary" icon="pencil" className="w-full">
                  {waiting ? 'Change what you asked for' : 'Ask Kelly to correct it'}
                </Button>
              </Link>
            )}
          </div>

          {decides && turningDown && (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <Field label="Tell the store why (optional)" hint="They see this on their closing history. The day stays as it was filed.">
                <TextArea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="The card slip total says RM 688 — please check it again."
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setTurningDown(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={() => decide(false)}>
                  Turn it down
                </Button>
              </div>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}

// ── The form: a first filing, or a change to one ────────────────────────────

/** Which customer a line belongs to. Lines from before the shared server stand alone. */
const saleKey = (l: SaleLine): string => l.saleId ?? l.id ?? ''

function ClosingForm({
  location,
  day,
  filed,
  mode,
}: {
  location: Location
  day: DateStr
  filed?: Closing
  mode: 'new' | 'direct' | 'request'
}) {
  const navigate = useNavigate()
  const user = useCurrentUser()!
  const data = useData()
  const submitClosing = useData((s) => s.submitClosing)
  const editClosing = useData((s) => s.editClosing)
  const requestCorrection = useData((s) => s.requestCorrection)
  const withdrawCorrection = useData((s) => s.withdrawCorrection)
  const createPurchaseOrder = useData((s) => s.createPurchaseOrder)
  const updateSale = useData((s) => s.updateSale)
  const removeSale = useData((s) => s.removeSale)
  const push = useToasts((s) => s.push)

  const locationId = location.id
  // Which of the two prices this store is counted on (Revision 2).
  const basis = location.priceBasis ?? 'promotion'
  const isToday = day === data.today
  const atCounter = user.role === 'promoter'

  // While the day is the store's own — closing it, or changing today's — the
  // sales are the sale records themselves, and changing one changes it at
  // once, exactly as on Record a sale. Anything else is a draft: an earlier
  // day being corrected, or Kelly changing a store's closing. A draft changes
  // nothing until it is saved or approved.
  const liveSales = mode === 'new' || (mode === 'direct' && atCounter)
  // A request already waiting is picked up where it was left.
  const pendingMine =
    mode === 'request' && filed?.correction?.status === 'pending' && filed.correction.proposed
      ? filed.correction
      : undefined
  const onRecord = filed ? figuresOf(filed) : undefined
  const start: ClosingFigures | undefined = pendingMine?.proposed ?? onRecord

  const [draft, setDraft] = useState<SaleLine[]>(() => start?.lines ?? [])
  const liveList = isToday ? (data.liveLines[locationId] ?? []) : (data.unfiledLines[locationId]?.[day] ?? [])
  const lines = liveSales ? liveList : draft

  const revenue = toSen(lines.reduce((a, l) => a + l.qty * lineUnitPrice(l, basis), 0))
  const units = lines.reduce((a, l) => a + l.qty, 0)

  /** The day's sales, one group per customer, in the order they were rung up. */
  const sales = useMemo(() => {
    const groups = new Map<string, SaleLine[]>()
    for (const l of lines) {
      const k = saleKey(l)
      ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(l)
    }
    return [...groups.entries()]
  }, [lines])

  /** What sold of each product that day. */
  const soldToday = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) m.set(l.skuId, (m.get(l.skuId) ?? 0) + l.qty)
    return m
  }, [lines])

  // The shelf as the day began: the count from the closing before it. Never
  // the day's own closing — that already has the day's sales taken off.
  const stock = useMemo(() => selectStock(data, locationId, day), [data, locationId, day])

  /** What the shelf should hold now: the opening count, less the day's sales. */
  const expectedOf = (skuId: string, onHand: number) => Math.max(0, onHand - (soldToday.get(skuId) ?? 0))

  /**
   * The store's very first closing, where nothing is known about the shelf.
   *
   * The whole page is built on "we know what should be there, change only
   * what is different" — and on the first night that is not true. Prefilling
   * zero and saying "all as expected" would invite a promoter to file a count
   * of nothing for every product. So on the first night the boxes start empty
   * and every one has to be typed.
   */
  const firstCount = stock.length > 0 && !stock[0].counted

  const countOnRecord = useMemo(
    () => new Map((onRecord?.stockCount ?? []).map((s) => [s.skuId, s.counted])),
    [onRecord],
  )

  // A first filing starts every box at what the shelf should hold; a change
  // starts every box at what was counted.
  const [counted, setCounted] = useState<Record<string, string>>(() => {
    const was = new Map((start?.stockCount ?? []).map((s) => [s.skuId, s.counted]))
    return Object.fromEntries(
      stock.map((s) => [
        s.skuId,
        was.has(s.skuId) ? String(was.get(s.skuId)) : firstCount ? '' : String(expectedOf(s.skuId, s.onHand)),
      ]),
    )
  })

  // Type one of the two and the other fills in, so they always add up. The
  // e-wallet box was removed at the client's request; a day filed with an
  // e-wallet figure before then keeps it, so changing the cash never quietly
  // moves that money onto the card.
  const [cash, setCash] = useState(() => (start?.tender ? String(start.tender.cash) : ''))
  const ewallet = start?.tender?.ewallet ?? 0
  const card = cash === '' ? '' : String(Math.max(0, toSen(revenue - Number(cash) - ewallet)))

  // Kept as the text in the box, not a number: clearing the box to type a new
  // figure must not make the line vanish, which is what parsing '' as 0 and
  // dropping zeroes did. A line only leaves the order by its own cross.
  const [poQty, setPoQty] = useState<Record<string, string>>(() =>
    mode === 'new'
      ? Object.fromEntries(
          selectSuggestedPoLines(data, locationId).map((l) => [l.skuId, String(l.qtyRequested)]),
        )
      : {},
  )
  const [poNotes, setPoNotes] = useState('')
  /** The line being added by hand from the picker. */
  const [addSku, setAddSku] = useState('')
  const [raisePo, setRaisePo] = useState(mode === 'new')

  const [reason, setReason] = useState(pendingMine?.reason ?? '')
  const [tried, setTried] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [showLines, setShowLines] = useState(false)
  /** The sale open in the editor: its key, or 'new' for one that was missed. */
  const [editingSale, setEditingSale] = useState<string | null>(null)

  /** Every line on the order, whether the app suggested it or the promoter added it. */
  const orderRows = useMemo(() => Object.keys(poQty), [poQty])

  /** The ones that will actually be sent: those with a quantity against them. */
  const orderLines = useMemo(
    () =>
      Object.entries(poQty)
        .map(([skuId, qty]) => ({ skuId, qty: Math.max(0, Math.floor(Number(qty)) || 0) }))
        .filter((l) => l.qty > 0),
    [poQty],
  )

  const stockCount: StockCount[] = [
    ...stock.map((s) => ({
      skuId: s.skuId,
      opening: s.onHand,
      counted: Number(counted[s.skuId]) || 0,
    })),
    // A count filed for something no longer counted on the shelf is kept as
    // it was, rather than dropped by an edit that never showed it.
    ...(start?.stockCount ?? []).filter((c) => !stock.some((s) => s.skuId === c.skuId)),
  ]
  const figures: ClosingFigures = {
    revenueMYR: revenue,
    tender: { cash: Number(cash) || 0, ewallet, card: Number(card) || 0 },
    lines,
    stockCount,
  }
  const changes = onRecord ? describeClosingChanges(onRecord, figures, basis) : []

  // ── What still needs doing, in the promoter's own terms ─────────────────
  const problems: string[] = []
  if (revenue > 0 && cash === '') {
    problems.push('Type how much came in as cash — enter 0 if it was all card.')
  }
  if (Number(cash) + ewallet > revenue) {
    problems.push(
      ewallet
        ? `Cash and e-wallet cannot come to more than the day's sales of ${money(revenue)}.`
        : `Cash cannot be more than the day's sales of ${money(revenue)}.`,
    )
  }
  for (const s of stock) {
    const value = counted[s.skuId]
    if (value === undefined || value === '') {
      const blanks = stock.filter((x) => !counted[x.skuId]).length
      problems.push(
        firstCount && mode === 'new'
          ? `${blanks} ${blanks === 1 ? 'product has' : 'products have'} not been counted yet — start with ${s.label}.`
          : `${s.label} has no count.`,
      )
      break
    }
    if (Number(value) < 0) {
      problems.push(`${s.label} cannot be a negative number.`)
      break
    }
  }
  if (mode === 'new' && raisePo) {
    const blank = orderRows.find((skuId) => !orderLines.some((l) => l.skuId === skuId))
    if (blank) {
      problems.push(
        `${skuById(blank)?.label ?? blank} is on the order with no quantity — type one, or take it off with the cross.`,
      )
    }
  }
  if (mode !== 'new' && changes.length === 0) {
    problems.push('Nothing has been changed yet — change the figure that is wrong, then save.')
  }
  if (mode === 'request' && !reason.trim()) {
    problems.push('Say what was wrong, so Kelly knows what she is approving.')
  }

  const leave = () => (atCounter ? navigate('/today') : navigate(-1))

  const finish = () => {
    setTried(true)
    setFailure(null)
    if (problems.length) return

    if (mode === 'direct') {
      const result = editClosing({ closingId: filed!.id, figures })
      if (!result.ok) return setFailure(result.error ?? 'That could not be saved.')
      push('Closing updated', 'good')
      return leave()
    }
    if (mode === 'request') {
      const result = requestCorrection({ closingId: filed!.id, figures, reason })
      if (!result.ok) return setFailure(result.error ?? 'That could not be sent.')
      push('Sent to Kelly for approval', 'good')
      return navigate('/history')
    }

    const closing: Closing = {
      id: `${locationId}-${day}`,
      locationId,
      channel: location.channel,
      period: day,
      periodType: 'day',
      ...figures,
      // Kept as zero: the field is gone from the form at the client's request,
      // but the shape of a closing has not changed.
      staffSales: { qty: 0, revenueMYR: 0 },
      writeOffs: [],
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
    }
    submitClosing(closing)

    const poLines = orderLines.map((l) => ({
      skuId: l.skuId,
      qtyRequested: l.qty,
      qtyApproved: null,
      qtyShipped: null,
    }))

    if (raisePo && poLines.length) {
      const po: PurchaseOrder = {
        id: newOrderId(data.today),
        locationId,
        createdBy: user.name,
        createdAt: new Date().toISOString(),
        priority: poLines.length >= 3 ? 'urgent' : 'standard',
        notes: poNotes,
        status: 'submitted',
        lines: poLines,
        events: [
          { status: 'draft', actor: user.name, role: 'promoter', at: new Date().toISOString() },
          {
            status: 'submitted',
            actor: user.name,
            role: 'promoter',
            at: new Date().toISOString(),
            note: poNotes || undefined,
          },
        ],
      }
      createPurchaseOrder(po)
      push(`Day closed and ${po.id} sent to Kelly`, 'good')
      navigate(`/orders/${po.id}`)
      return
    }

    push('Day closed', 'good')
    navigate('/today')
  }

  const takeBack = () => {
    const result = withdrawCorrection(filed!.id)
    if (!result.ok) return setFailure(result.error ?? 'That could not be taken back.')
    push('Request taken back', 'info')
    navigate('/history')
  }

  // ── Changing one sale ────────────────────────────────────────────────────
  const editingLines =
    editingSale && editingSale !== 'new' ? (sales.find(([k]) => k === editingSale)?.[1] ?? []) : []

  /** A sale changed in the draft. The day's other sales are left exactly as they were. */
  const keepInDraft = (key: string, d: SaleDraft): Result => {
    const before = key === 'new' ? [] : draft.filter((l) => saleKey(l) === key)
    const saleId = before[0]?.saleId ?? newId()
    const now = new Date().toISOString()
    const after: SaleLine[] = d.lines.map((l) => {
      const { countryCode: _c, segment: _s, ...rest } = l
      void _c, _s
      return {
        ...rest,
        id: l.id ?? newId(),
        saleId,
        day,
        locationId,
        ...(key === 'new' ? { by: user.id, byName: user.name } : {}),
        ...(d.countryCode ? { countryCode: d.countryCode } : {}),
        ...(d.countryCode === 'MY' && d.segment ? { segment: d.segment } : {}),
        editedAt: now,
        editedBy: user.name,
      }
    })
    if (key !== 'new' && describeLineChanges(before, after, basis).length === 0) return { ok: true }
    setDraft((all) => {
      const at = all.findIndex((l) => saleKey(l) === key)
      const rest = all.filter((l) => saleKey(l) !== key)
      if (at < 0) return [...rest, ...after]
      return [...rest.slice(0, at), ...after, ...rest.slice(at)]
    })
    return { ok: true }
  }

  const shelf = stock.map((s) => {
    const expected = expectedOf(s.skuId, s.onHand)
    const value = counted[s.skuId] ?? ''
    const was = countOnRecord.get(s.skuId)
    return {
      ...s,
      sold: soldToday.get(s.skuId) ?? 0,
      expected,
      value,
      was,
      // Filing: flag a count that differs from what the shelf should hold.
      // Changing: flag a count that differs from what was filed.
      changed:
        value !== '' &&
        (mode === 'new' ? !firstCount && Number(value) !== expected : was !== undefined && Number(value) !== was),
    }
  })
  const changedCounts = shelf.filter((s) => s.changed).length
  const stillToCount = shelf.filter((s) => s.value === '').length
  const setCount = (skuId: string, value: string) => setCounted((v) => ({ ...v, [skuId]: value }))

  const heading =
    mode === 'new'
      ? `${isToday ? 'Close the day' : 'Close a missed day'} · ${formatDate(day)}`
      : mode === 'request'
        ? `Ask to correct ${formatDate(day)}`
        : `Change the closing · ${formatDate(day)}`

  const intro =
    mode === 'new'
      ? isToday
        ? 'Everything below is filled in from the sales recorded today. Check it, type the cash, and close.'
        : 'This day was never closed. Everything below is filled in from the sales recorded that day.'
      : mode === 'request'
        ? pendingMine
          ? `You asked on ${formatTimestamp(pendingMine.requestedAt)} — below is what you sent. Change it and send it again, or take the request back.`
          : `${filedLine(filed!)}. Everything below is what was filed — change only what is wrong. Kelly or Davy approves it before it counts.`
        : `${filedLine(filed!)}. Everything below is what was filed — change only what is wrong, then save.${
            atCounter ? '' : ' It changes at once and is written to the activity log.'
          }`

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SaleEditor
        open={editingSale !== null}
        onClose={() => setEditingSale(null)}
        title={editingSale === 'new' ? 'Add a sale that was missed' : 'Change this sale'}
        subtitle={
          editingSale === 'new'
            ? `It goes into the ${formatDate(day)} closing.`
            : editingLines[0]?.at
              ? `Rung up at ${clock(editingLines[0].at)}${editingLines[0].byName ? ` by ${editingLines[0].byName}` : ''}. Change only what is wrong.`
              : 'Change only what is wrong.'
        }
        initial={{
          lines: editingLines,
          countryCode: editingLines[0]?.countryCode,
          segment: editingLines[0]?.segment,
        }}
        basis={basis}
        needsCountry={location.recordsCountries}
        saveLabel={liveSales ? 'Save changes' : 'Keep this'}
        onSave={(d) => {
          if (!liveSales) return keepInDraft(editingSale!, d)
          const result = updateSale({ saleId: editingSale!, ...d })
          if (result.ok) push('Sale changed', 'good')
          return result
        }}
        onDelete={
          editingSale === 'new'
            ? undefined
            : () => {
                if (liveSales) {
                  removeSale(editingSale!)
                  push('Sale taken back', 'info')
                } else {
                  setDraft((all) => all.filter((l) => saleKey(l) !== editingSale))
                }
              }
        }
      />

      <div>
        <p className="eyebrow">{location.name}</p>
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="mt-1 text-[13px] text-ink-2">{intro}</p>
      </div>

      {/* ── The day's sales ───────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow={isToday ? "Today's sales" : `Sales on ${formatDate(day)}`}
          title={lines.length === 0 ? 'No sales recorded' : `${money(revenue)} from ${num(units)} units`}
          meta={
            lines.length === 0
              ? 'A quiet day can still be closed — the count and the top-up matter just as much.'
              : liveSales
                ? `${sales.length} ${sales.length === 1 ? 'customer' : 'customers'} from Record a sale. Change one here if it was keyed in wrongly.`
                : `${sales.length} ${sales.length === 1 ? 'customer' : 'customers'}. Change a sale that was wrong, or add one that was missed.`
          }
          action={
            liveSales ? (
              isToday ? (
                <Link to="/sell">
                  <Button size="sm" variant="secondary" icon="plus">
                    Add a sale
                  </Button>
                </Link>
              ) : undefined
            ) : (
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setEditingSale('new')}>
                Add a missed sale
              </Button>
            )
          }
        />
        {lines.length > 0 && (
          <>
            <Rule />
            <PanelBody>
              <button
                onClick={() => setShowLines((v) => !v)}
                className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
              >
                <Icon name={showLines ? 'chevronDown' : 'chevronRight'} className="h-3.5 w-3.5" />
                {showLines ? 'Hide the sales' : 'See the sales'}
              </button>
              {showLines && (
                <ul className="mt-3 space-y-2">
                  {sales.map(([key, group]) => {
                    const first = group[0]
                    const c = first.countryCode ? countryByCode(first.countryCode) : undefined
                    const total = group.reduce((a, l) => a + l.qty * lineUnitPrice(l, basis), 0)
                    return (
                      <li key={key} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {c && <Flag code={c.code} size={16} />}
                          <span className="text-[12.5px] text-ink">
                            {c ? c.name : 'Customer'}
                            {first.segment ? ` · ${MALAYSIA_SEGMENT_LABEL[first.segment]}` : ''}
                          </span>
                          <span className="text-[11.5px] text-ink-3">
                            {[first.at && clock(first.at), first.byName, first.editedBy && 'changed']
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <span className="readout ml-auto text-[12.5px] font-semibold text-ink">{money(total)}</span>
                          <button
                            onClick={() => setEditingSale(key)}
                            className="flex min-h-[32px] items-center gap-1 rounded-lg px-1.5 text-[11.5px] font-medium text-primary hover:underline"
                          >
                            <Icon name="pencil" className="h-3 w-3" />
                            Change
                          </button>
                        </div>
                        <p className="mt-1 text-[12px] text-ink-2">
                          {group
                            .map(
                              (l) =>
                                `${l.qty} × ${skuLabel(l.skuId)}${
                                  l.priceTier && l.priceTier !== basis
                                    ? ` (${TIER_LABEL[l.priceTier]}${l.priceTier === 'other' ? ` ${money(lineUnitPrice(l, basis))}` : ''})`
                                    : ''
                                }`,
                            )
                            .join(' · ')}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </PanelBody>
          </>
        )}
      </Panel>

      {/* ── How it was paid ───────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="How it was paid"
          title="Type the cash — card fills itself in"
          meta={
            mode === 'new'
              ? `The day's sales come to ${money(revenue)}. No float or cash on hand is recorded.`
              : `The day's sales come to ${money(revenue)}. Filed as ${money(onRecord?.tender?.cash ?? 0)} cash${
                  ewallet ? `, ${money(ewallet)} e-wallet` : ''
                } and ${money(onRecord?.tender?.card ?? 0)} card.`
          }
        />
        <Rule />
        <PanelBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cash">
              <NumberInput
                prefix="RM"
                min={0}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
                autoFocus={mode === 'new'}
              />
            </Field>
            <Field
              label="Credit card"
              hint={ewallet ? `The rest of the day's sales, after ${money(ewallet)} by e-wallet.` : "The rest of the day's sales."}
            >
              <div className="flex h-10 items-center rounded-xl border border-line bg-surface-2 px-3">
                <span className="mr-1.5 text-[12px] text-ink-3">RM</span>
                <span className="readout text-[14px] text-ink">
                  {card === '' ? '—' : Number(card).toFixed(2)}
                </span>
              </div>
            </Field>
          </div>
        </PanelBody>
      </Panel>

      {/* ── On the shelf ──────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="On the shelf"
          title={
            mode !== 'new'
              ? 'Change only a count that was wrong'
              : firstCount
                ? 'Count everything, this first time'
                : 'Change only what is different'
          }
          meta={
            mode !== 'new'
              ? 'Each box holds the count that was filed.'
              : firstCount
                ? 'Nothing has been counted at this store yet, so tonight every product is counted from scratch. From tomorrow the boxes fill themselves in and you only change what is different.'
                : "Each box already holds what the shelf should have after today's sales. If what you count matches, leave it."
          }
          action={
            mode !== 'new' ? (
              changedCounts > 0 ? (
                <Badge tone="active">{changedCounts} changed</Badge>
              ) : (
                <Badge tone="good" icon="check">
                  As filed
                </Badge>
              )
            ) : firstCount ? (
              <Badge tone={stillToCount > 0 ? 'warn' : 'good'} icon={stillToCount > 0 ? 'alert' : 'check'}>
                {stillToCount > 0 ? `${stillToCount} still to count` : 'All counted'}
              </Badge>
            ) : changedCounts > 0 ? (
              <Badge tone="warn">{changedCounts} changed</Badge>
            ) : (
              <Badge tone="good" icon="check">
                All as expected
              </Badge>
            )
          }
        />
        <Rule />
        <PanelBody>
          {/* Phone: one card per product, the box always in reach of a thumb. */}
          <div className="space-y-2 sm:hidden">
            {shelf.map((s) => (
              <div
                key={s.skuId}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  s.changed
                    ? mode === 'new'
                      ? 'border-warn/50 bg-warn/5'
                      : 'border-primary/45 bg-primary/5'
                    : 'border-line bg-surface-2'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-tight text-ink">{s.label}</p>
                  <p className="mt-1 text-[11.5px] text-ink-3">
                    {s.sold > 0 ? `Sold ${num(s.sold)}${firstCount ? '' : ' · '}` : ''}
                    {firstCount ? (
                      s.sold > 0 || mode !== 'new' ? '' : 'Type what is on the shelf'
                    ) : (
                      <>
                        should be <span className="readout font-medium text-ink-2">{num(s.expected)}</span>
                      </>
                    )}
                    {mode !== 'new' && s.changed && s.was !== undefined ? ` · filed ${num(s.was)}` : ''}
                  </p>
                </div>
                <div className="w-[84px] shrink-0">
                  <NumberInput
                    aria-label={`On the shelf: ${s.label}`}
                    className={`text-right ${s.changed ? (mode === 'new' ? 'border-warn/60 bg-warn/5' : 'border-primary/60 bg-primary/5') : ''}`}
                    min={0}
                    value={s.value}
                    onChange={(e) => setCount(s.skuId, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Wider screens: the same thing as a table. */}
          <div className="scroll-x hidden sm:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {[
                    'Product',
                    'Sold',
                    firstCount ? '' : 'Should be',
                    mode === 'new' ? '' : 'Filed',
                    'On the shelf',
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shelf.map((s) => (
                  <tr key={s.skuId} className="border-b border-line/70 last:border-0">
                    <td className="py-2">
                      <p className="text-[13px] leading-tight text-ink">{s.label}</p>
                      <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                    </td>
                    <td className={`readout py-2 pr-3 text-right text-[13px] ${s.sold > 0 ? 'text-ink' : 'text-ink-3'}`}>
                      {s.sold > 0 ? num(s.sold) : '—'}
                    </td>
                    <td className="readout py-2 pr-3 text-right text-[13px] text-ink-2">
                      {firstCount ? '' : num(s.expected)}
                    </td>
                    <td className="readout py-2 pr-3 text-right text-[13px] text-ink-3">
                      {mode === 'new' ? '' : s.was === undefined ? '—' : num(s.was)}
                    </td>
                    <td className="py-2">
                      <div className="ml-auto w-[88px]">
                        <NumberInput
                          aria-label={`On the shelf: ${s.label}`}
                          className={`text-right ${s.changed ? (mode === 'new' ? 'border-warn/60 bg-warn/5' : 'border-primary/60 bg-primary/5') : ''}`}
                          min={0}
                          value={s.value}
                          onChange={(e) => setCount(s.skuId, e.target.value)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBody>
      </Panel>

      {/* ── Ask HQ for stock ──────────────────────────────────────────── */}
      {mode === 'new' ? (
        <Panel>
          <PanelHeader
            eyebrow="Ask HQ for stock"
            title={
              orderRows.length === 0
                ? 'Nothing to order'
                : orderRows.length === orderLines.length
                  ? `${orderLines.length} on the order`
                  : `${orderLines.length} on the order · ${orderRows.length - orderLines.length} still to fill in`
            }
            meta="Anything low is filled in for you. Add anything else, including testers."
            action={
              <button
                onClick={() => setRaisePo((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors ${
                  raisePo
                    ? 'border-primary/45 bg-primary/10 text-primary'
                    : 'border-line text-ink-3 hover:text-ink'
                }`}
              >
                {raisePo ? 'Order will be sent' : 'No order tonight'}
              </button>
            }
          />
          <Rule />
          <PanelBody className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add something else" className="min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[220px]">
                <Select value={addSku} onChange={(e) => setAddSku(e.target.value)} disabled={!raisePo}>
                  <option value="">Choose a product…</option>
                  <optgroup label="Bottles and sets">
                    {orderableSkus
                      .filter((k) => k.sellable)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Testers">
                    {testerSkus.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              <Button
                variant="secondary"
                icon="plus"
                className="w-full sm:w-auto"
                disabled={!raisePo || !addSku}
                onClick={() => {
                  if (!addSku) return
                  const caseSize = skuById(addSku)?.caseSize ?? 12
                  setPoQty((q) => ({
                    ...q,
                    [addSku]: String((Number(q[addSku]) || 0) + caseSize),
                  }))
                  setAddSku('')
                }}
              >
                Add
              </Button>
            </div>

            {orderRows.map((skuId) => {
              const sku = skuById(skuId)
              const qty = poQty[skuId] ?? ''
              const row = stock.find((x) => x.skuId === skuId)
              const blank = !(Number(qty) > 0)
              return (
                <div
                  key={skuId}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3 ${
                    blank && raisePo ? 'border-warn/50 bg-warn/5' : 'border-line bg-surface-2'
                  }`}
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-0 sm:min-w-[160px]">
                    <p className="text-[13px] text-ink">{sku?.label ?? skuId}</p>
                    <p className="text-[11px] text-ink-3">
                      {row
                        ? row.counted
                          ? `${num(row.onHand)} on hand · reorder at ${num(row.reorderPoint)}`
                          : `No count filed yet · reorder at ${num(row.reorderPoint)}`
                        : 'Tester — not counted on the shelf'}
                    </p>
                  </div>
                  {row && row.status !== 'ok' && (
                    <Badge tone={row.status === 'low' ? 'warn' : 'critical'} icon="alert">
                      {row.status === 'out' ? 'Out of stock' : row.status === 'critical' ? 'Very low' : 'Low'}
                    </Badge>
                  )}
                  {sku?.variant === 'tester' && <Badge tone="active">Tester</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-24">
                      <NumberInput
                        aria-label={`Units of ${sku?.label ?? skuId} to order`}
                        min={0}
                        step={sku?.caseSize ?? 12}
                        value={qty}
                        placeholder="0"
                        onChange={(e) => setPoQty((q) => ({ ...q, [skuId]: e.target.value }))}
                        disabled={!raisePo}
                      />
                    </div>
                    <IconButton
                      name="x"
                      label={`Take ${sku?.label ?? 'this'} off the order`}
                      onClick={() =>
                        setPoQty((q) => {
                          const next = { ...q }
                          delete next[skuId]
                          return next
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}

            {orderRows.length > 0 && (
              <Field label="Note for Kelly (optional)" hint="Anything she should know before deciding.">
                <TextArea
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Tour group booked in on Saturday."
                  disabled={!raisePo}
                />
              </Field>
            )}
          </PanelBody>
        </Panel>
      ) : (
        <Notice tone="neutral" icon="doc">
          An order sent with a closing is changed on its own page, while it waits for Kelly.{' '}
          <Link to="/orders" className="text-primary hover:underline">
            Open the orders
          </Link>
        </Notice>
      )}

      {/* ── What is changing ──────────────────────────────────────────── */}
      {mode !== 'new' && (
        <Panel>
          <PanelHeader
            eyebrow={mode === 'request' ? 'What Kelly will see' : 'What you are changing'}
            title={
              changes.length === 0
                ? 'Nothing yet'
                : `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`
            }
            meta={
              changes.length === 0
                ? 'Everything is as it was filed.'
                : mode === 'request'
                  ? 'Nothing changes until Kelly or Davy approves it.'
                  : 'Saved as soon as you press the button, and written to the activity log.'
            }
          />
          {(changes.length > 0 || mode === 'request') && (
            <>
              <Rule />
              <PanelBody className="space-y-4">
                {changes.length > 0 && <ChangeList changes={changes} />}
                {mode === 'request' && (
                  <Field label="What was wrong" hint="Kelly reads this when she decides.">
                    <TextArea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Typed the cash as 800 — it was 500 cash and the rest card."
                    />
                  </Field>
                )}
              </PanelBody>
            </>
          )}
        </Panel>
      )}

      {/* ── The one button ────────────────────────────────────────────── */}
      {((tried && problems.length > 0) || failure) && (
        <div className="space-y-1 rounded-xl border border-critical/25 bg-critical/6 px-4 py-3">
          {(failure ? [failure] : problems).map((p) => (
            <p key={p} className="flex items-start gap-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {p}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pb-2 sm:flex-row sm:items-center">
        <Button
          variant="ghost"
          icon="chevronLeft"
          className="self-start sm:self-auto"
          onClick={() => (mode === 'new' ? navigate('/today') : leave())}
        >
          {mode === 'new' ? 'Not yet' : 'Cancel'}
        </Button>
        {pendingMine && (
          <Button variant="danger" className="self-start sm:self-auto" onClick={takeBack}>
            Take the request back
          </Button>
        )}
        <Button variant="primary" icon="check" className="w-full sm:ml-auto sm:w-auto" onClick={finish}>
          {mode === 'direct'
            ? 'Save the changes'
            : mode === 'request'
              ? pendingMine
                ? 'Send the new request'
                : 'Send to Kelly'
              : raisePo && orderLines.length
                ? 'Close the day and send the order'
                : 'Close the day'}
        </Button>
      </div>
    </div>
  )
}
