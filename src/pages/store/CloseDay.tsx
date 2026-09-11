import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Field, NumberInput, Select, TextArea } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { selectClosingFor, selectStock, selectSuggestedPoLines } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { orderableSkus, testerSkus, priceOf, skuById } from '../../data/products'
import { formatDate } from '../../lib/dates'
import { num, rm } from '../../lib/format'
import type { Closing, PurchaseOrder, StockCount } from '../../data/types'

/**
 * Closing the day, on one page, already filled in.
 *
 * The client asked three times for this to be simpler, and each time the thing
 * in the way was the same: the promoter was being asked to type what the
 * system already knew. It knows every sale they recorded, so it knows what
 * sold and what the shelf should therefore hold. So:
 *
 *   · the sales are filled in from Record a sale — nothing to re-enter
 *   · every count box starts at what the shelf should hold, so the promoter
 *     only touches the lines that are actually different
 *   · type the cash and the card fills itself in, so the money always adds up
 *   · the top-up already carries whatever is running low
 *
 * On a normal night that makes closing: check it, type the cash, press the
 * button. No steps, no Next and Back, and no difference column to worry about
 * — the client asked for that to go.
 *
 * The deadline is 11pm and anyone at the counter may file it (Q17, Q18).
 */
export function CloseDay() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const data = useData()
  const submitClosing = useData((s) => s.submitClosing)
  const createPurchaseOrder = useData((s) => s.createPurchaseOrder)
  const push = useToasts((s) => s.push)

  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  // Which of the two prices this store is counted on (Revision 2).
  const basis = location?.priceBasis ?? 'promotion'
  const already = selectClosingFor(data, locationId, data.today)
  const stock = useMemo(() => selectStock(data, locationId), [data, locationId])
  const lines = data.liveLines[locationId] ?? []

  const [refiling, setRefiling] = useState(false)
  const [tried, setTried] = useState(false)
  const [showLines, setShowLines] = useState(false)

  const revenue = lines.reduce((a, l) => a + l.qty * priceOf(skuById(l.skuId), basis), 0)
  const units = lines.reduce((a, l) => a + l.qty, 0)

  /** What sold of each product today, from the sales recorded at the counter. */
  const soldToday = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) m.set(l.skuId, (m.get(l.skuId) ?? 0) + l.qty)
    return m
  }, [lines])

  /** What the shelf should hold now: last night's count, less today's sales. */
  const expectedOf = (skuId: string, onHand: number) =>
    Math.max(0, onHand - (soldToday.get(skuId) ?? 0))

  // Every box starts at what the shelf should hold. The promoter changes only
  // the ones that are actually different.
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(stock.map((s) => [s.skuId, String(expectedOf(s.skuId, s.onHand))])),
  )

  // Type one of the two and the other fills in, so they always add up.
  const [cash, setCash] = useState('')
  const card = cash === '' ? '' : String(Math.max(0, Math.round((revenue - Number(cash)) * 100) / 100))

  const [poQty, setPoQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      selectSuggestedPoLines(data, locationId).map((l) => [l.skuId, l.qtyRequested]),
    ),
  )
  const [poNotes, setPoNotes] = useState('')
  /** The line being added by hand from the picker. */
  const [addSku, setAddSku] = useState('')
  const [raisePo, setRaisePo] = useState(true)

  /**
   * What is actually on the order: whatever has a quantity against it, whether
   * the app suggested it or the promoter added it.
   */
  const orderLines = useMemo(
    () =>
      Object.entries(poQty)
        .filter(([, qty]) => qty > 0)
        .map(([skuId, qty]) => ({ skuId, qty })),
    [poQty],
  )

  // ── What still needs doing, in the promoter's own terms ─────────────────
  const problems: string[] = []
  if (lines.length === 0) {
    problems.push('No sales recorded today. Record them on the Record a sale screen first.')
  }
  if (revenue > 0 && cash === '') {
    problems.push('Type how much came in as cash — enter 0 if it was all card.')
  }
  if (Number(cash) > revenue) {
    problems.push(`Cash cannot be more than today's sales of ${rm(revenue)}.`)
  }
  for (const s of stock) {
    const value = counted[s.skuId]
    if (value === undefined || value === '') {
      problems.push(`${s.label} has no count.`)
      break
    }
    if (Number(value) < 0) {
      problems.push(`${s.label} cannot be a negative number.`)
      break
    }
  }

  const finish = () => {
    setTried(true)
    if (problems.length || !user || !location) return

    const stockCount: StockCount[] = stock.map((s) => ({
      skuId: s.skuId,
      opening: s.onHand,
      counted: Number(counted[s.skuId]) || 0,
    }))

    const closing: Closing = {
      id: `${locationId}-${data.today}`,
      locationId,
      channel: location.channel,
      period: data.today,
      periodType: 'day',
      revenueMYR: revenue,
      tender: {
        cash: Number(cash) || 0,
        // The e-wallet field was removed at the client's request. The column
        // stays so history and the schema still line up.
        ewallet: 0,
        card: Number(card) || 0,
      },
      lines,
      // Kept as zero: the field is gone from the form at the client's request,
      // but the shape of a closing has not changed.
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount,
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
      const seq = data.purchaseOrders.length + 400
      const po: PurchaseOrder = {
        id: `PO-2026-${String(seq).padStart(4, '0')}`,
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

  if (!location || !user) return null

  if (already && !refiling) {
    return (
      <Panel>
        <PanelHeader
          eyebrow={location.name}
          title={`${formatDate(data.today)} is already closed`}
          meta={`Filed by ${already.submittedBy}. Filing again replaces what is on record.`}
        />
        <Rule />
        <PanelBody className="flex flex-wrap items-center gap-5">
          <div>
            <p className="eyebrow">Revenue</p>
            <p className="readout mt-1 font-display text-[22px] text-primary">
              {rm(already.revenueMYR)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Units</p>
            <p className="readout mt-1 font-display text-[22px]">
              {num(already.lines.reduce((a, l) => a + l.qty, 0))}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/today')}>
              Back to today
            </Button>
            <Button variant="primary" icon="clipboard" onClick={() => setRefiling(true)}>
              File it again
            </Button>
          </div>
        </PanelBody>
      </Panel>
    )
  }

  const changedCounts = stock.filter(
    (s) => Number(counted[s.skuId]) !== expectedOf(s.skuId, s.onHand),
  ).length

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">{location.name}</p>
        <h1 className="page-title mt-1">Close the day · {formatDate(data.today)}</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Everything below is filled in from the sales you recorded today. Check it, type the
          cash, and close.
        </p>
      </div>

      {/* ── Today's sales ─────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Today's sales"
          title={lines.length === 0 ? 'Nothing recorded yet' : `${rm(revenue)} from ${num(units)} units`}
          meta={
            lines.length === 0
              ? 'Record today’s sales first — they fill this page in.'
              : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} from Record a sale.`
          }
          action={
            <Link to="/sell">
              <Button size="sm" variant="secondary" icon="plus">
                Add a sale
              </Button>
            </Link>
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
                <Icon
                  name={showLines ? 'chevronDown' : 'chevronRight'}
                  className="h-3.5 w-3.5"
                />
                {showLines ? 'Hide what sold' : 'See what sold'}
              </button>
              {showLines && (
                <ul className="mt-3 space-y-1.5">
                  {lines.map((l, i) => {
                    const s = skuById(l.skuId)
                    return (
                      <li
                        key={`${l.skuId}-${i}`}
                        className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
                      >
                        <span className="readout text-[12.5px] font-semibold text-ink">
                          {l.qty} ×
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {s?.label}
                        </span>
                        <span className="readout text-[12px] text-ink-2">
                          {rm(l.qty * priceOf(s, basis))}
                        </span>
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
          meta={`Today's sales come to ${rm(revenue)}. No float or cash on hand is recorded.`}
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
                autoFocus
              />
            </Field>
            <Field label="Credit card" hint="The rest of today's sales.">
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
          title="Change only what is different"
          meta="Each box already holds what the shelf should have after today's sales. If what you count matches, leave it."
          action={
            changedCounts > 0 ? (
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
          <div className="scroll-x">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {['Product', 'Sold today', 'Should be', 'On the shelf'].map((h, i) => (
                    <th
                      key={h}
                      className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const sold = soldToday.get(s.skuId) ?? 0
                  const expected = expectedOf(s.skuId, s.onHand)
                  const value = counted[s.skuId] ?? ''
                  const changed = value !== '' && Number(value) !== expected
                  return (
                    <tr key={s.skuId} className="border-b border-line/70 last:border-0">
                      <td className="py-2">
                        <p className="text-[13px] leading-tight text-ink">{s.label}</p>
                        <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                      </td>
                      <td
                        className={`readout py-2 pr-3 text-right text-[13px] ${sold > 0 ? 'text-ink' : 'text-ink-3'}`}
                      >
                        {sold > 0 ? num(sold) : '—'}
                      </td>
                      <td className="readout py-2 pr-3 text-right text-[13px] text-ink-2">
                        {num(expected)}
                      </td>
                      <td className="py-2 text-right">
                        <NumberInput
                          className={`ml-auto w-[88px] text-right ${changed ? 'border-warn/60 bg-warn/5' : ''}`}
                          min={0}
                          value={value}
                          onChange={(e) =>
                            setCounted((v) => ({ ...v, [s.skuId]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </PanelBody>
      </Panel>

      {/* ── Ask HQ for stock ──────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Ask HQ for stock"
          title={orderLines.length ? `${orderLines.length} on the order` : 'Nothing to order'}
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
            <Field label="Add something else" className="min-w-[220px] flex-1">
              <Select
                value={addSku}
                onChange={(e) => setAddSku(e.target.value)}
                disabled={!raisePo}
              >
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
              disabled={!raisePo || !addSku}
              onClick={() => {
                if (!addSku) return
                const caseSize = skuById(addSku)?.caseSize ?? 12
                setPoQty((q) => ({ ...q, [addSku]: (q[addSku] ?? 0) + caseSize }))
                setAddSku('')
              }}
            >
              Add
            </Button>
          </div>

          {orderLines.map((line) => {
            const sku = skuById(line.skuId)
            const row = stock.find((x) => x.skuId === line.skuId)
            return (
              <div
                key={line.skuId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
              >
                <div className="min-w-[160px] flex-1">
                  <p className="text-[13px] text-ink">{sku?.label ?? line.skuId}</p>
                  <p className="text-[11px] text-ink-3">
                    {row
                      ? `${num(row.onHand)} on hand · reorder at ${num(row.reorderPoint)}`
                      : 'Tester — not counted on the shelf'}
                  </p>
                </div>
                {row && row.status !== 'ok' && (
                  <Badge tone={row.status === 'low' ? 'warn' : 'critical'} icon="alert">
                    {row.status === 'out'
                      ? 'Out of stock'
                      : row.status === 'critical'
                        ? 'Very low'
                        : 'Low'}
                  </Badge>
                )}
                {sku?.variant === 'tester' && <Badge tone="active">Tester</Badge>}
                <NumberInput
                  className="w-24"
                  min={0}
                  step={sku?.caseSize ?? 12}
                  value={poQty[line.skuId] ?? 0}
                  onChange={(e) =>
                    setPoQty((q) => ({
                      ...q,
                      [line.skuId]: Math.max(0, Number(e.target.value)),
                    }))
                  }
                  disabled={!raisePo}
                />
                <IconButton
                  name="x"
                  label={`Take ${sku?.label ?? 'this'} off the order`}
                  onClick={() =>
                    setPoQty((q) => {
                      const next = { ...q }
                      delete next[line.skuId]
                      return next
                    })
                  }
                />
              </div>
            )
          })}

          {orderLines.length > 0 && (
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

      {/* ── The one button ────────────────────────────────────────────── */}
      {tried && problems.length > 0 && (
        <div className="space-y-1 rounded-xl border border-critical/25 bg-critical/6 px-4 py-3">
          {problems.map((p) => (
            <p key={p} className="flex items-start gap-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {p}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-2">
        <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/today')}>
          Not yet
        </Button>
        <Button
          variant="primary"
          icon="check"
          className="ml-auto"
          onClick={finish}
        >
          {raisePo && orderLines.length ? 'Close the day and send the order' : 'Close the day'}
        </Button>
      </div>
    </div>
  )
}
