import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Field, NumberInput, TextArea } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import {
  originSlicesFrom,
  selectClosingFor,
  selectStock,
  selectSuggestedPoLines,
} from '../../store/selectors'
import { locationById } from '../../data/locations'
import { skuById } from '../../data/products'
import { formatDate } from '../../lib/dates'
import { num, rm } from '../../lib/format'
import type { Closing, PurchaseOrder, StockCount } from '../../data/types'

const STEPS = [
  { key: 'sales', label: 'Sales', hint: 'Check what you logged' },
  { key: 'money', label: 'Money', hint: 'How it was paid' },
  { key: 'stock', label: 'Stock count', hint: 'Count every perfume' },
  { key: 'topup', label: 'Top-up', hint: 'What to ask HQ for' },
] as const

/**
 * The close, as one flow.
 *
 * Because sales are logged through the day on the Sell screen, closing is a
 * confirmation rather than an hour of recall. The deadline is 11pm and anyone
 * at the counter may file it (Q17, Q18).
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
  const already = selectClosingFor(data, locationId, data.today)
  const stock = useMemo(() => selectStock(data, locationId), [data, locationId])
  const lines = data.liveLines[locationId] ?? []

  const [step, setStep] = useState(0)
  const [refiling, setRefiling] = useState(false)
  const [attempted, setAttempted] = useState<Record<number, boolean>>({})

  const revenue = lines.reduce((a, l) => a + l.qty * (skuById(l.skuId)?.priceMYR ?? 0), 0)
  const units = lines.reduce((a, l) => a + l.qty, 0)

  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [poQty, setPoQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      selectSuggestedPoLines(data, locationId).map((l) => [l.skuId, l.qtyRequested]),
    ),
  )
  const [poNotes, setPoNotes] = useState('')
  const [raisePo, setRaisePo] = useState(true)

  const tenderTotal = (Number(cash) || 0) + (Number(card) || 0)
  const tenderGap = Math.round((revenue - tenderTotal) * 100) / 100

  const mix = useMemo(() => {
    const tally = new Map<string, { units: number; revenue: number }>()
    for (const l of lines) {
      if (!l.countryCode) continue
      const b = tally.get(l.countryCode) ?? { units: 0, revenue: 0 }
      b.units += l.qty
      b.revenue += l.qty * (skuById(l.skuId)?.priceMYR ?? 0)
      tally.set(l.countryCode, b)
    }
    return originSlicesFrom(tally)
  }, [lines])

  const suggested = useMemo(
    () => selectSuggestedPoLines(data, locationId),
    [data, locationId],
  )

  // ── Validation, in the promoter's own terms ───────────────────────────
  const stepErrors: string[] = []
  if (step === 0 && lines.length === 0) {
    stepErrors.push('No sales logged today. Record them on the Record a sale screen first.')
  }
  if (step === 1) {
    if (revenue > 0 && Math.abs(tenderGap) > 0.5) {
      stepErrors.push(
        tenderGap > 0
          ? `Cash, e-wallet and card are ${rm(Math.abs(tenderGap), { decimals: true })} short of ${rm(revenue)}.`
          : `Cash, e-wallet and card are ${rm(Math.abs(tenderGap), { decimals: true })} over ${rm(revenue)}.`,
      )
    }
  }
  if (step === 2) {
    for (const s of stock) {
      const value = counted[s.skuId]
      if (value === undefined || value === '') {
        stepErrors.push(`${s.label} has not been counted.`)
        break
      }
      if (Number(value) < 0) stepErrors.push(`${s.label} cannot be a negative number.`)
    }
  }

  const canAdvance = stepErrors.length === 0

  const finish = () => {
    if (!user || !location) return

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
        // The e-wallet field was removed from the form at the client's
        // request. The column stays so three years of history and the database
        // schema still line up — new closings simply record nothing there.
        ewallet: 0,
        card: Number(card) || 0,
      },
      lines,
      // Kept on the record as zero: the field is gone from the form at the
      // client's request, but the shape of a closing has not changed, so
      // three years of history and the database schema still line up.
      staffSales: { qty: 0, revenueMYR: 0 },
      stockCount,
      writeOffs: [],
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
    }
    submitClosing(closing)

    const poLines = Object.entries(poQty)
      .filter(([, q]) => q > 0)
      .map(([skuId, q]) => ({ skuId, qtyRequested: q, qtyApproved: null, qtyShipped: null }))

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="eyebrow">{location.name}</p>
        <h1 className="page-title mt-1">
          Close the day · {formatDate(data.today)}
        </h1>

        <ol className="mt-5 flex items-center gap-1.5">
          {STEPS.map((s, i) => {
            const done = i < step
            const current = i === step
            return (
              <li key={s.key} className="flex flex-1 items-center gap-1.5">
                <button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex flex-1 flex-col gap-1.5 text-left ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className={`h-[3px] w-full rounded-full transition-colors duration-500 ${
                      current ? 'bg-grad-command' : done ? 'bg-primary/45' : 'bg-line'
                    }`}
                  />
                  <span
                    className={`text-[11px] transition-colors ${
                      current ? 'font-semibold text-primary' : done ? 'text-ink-2' : 'text-ink-3'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ── 1 · Sales ───────────────────────────────────────────── */}
          {step === 0 && (
            <Panel>
              <PanelHeader
                eyebrow="Step 1 of 4"
                title="What you sold today"
                meta="These are the sales you logged as they happened. Fix anything wrong before you go on."
                action={
                  <Link to="/sell">
                    <Button size="sm" variant="secondary" icon="plus">
                      Add a sale
                    </Button>
                  </Link>
                }
              />
              <Rule />
              <PanelBody className="space-y-4">
                <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface-2 px-4 py-3">
                  <div>
                    <p className="eyebrow">Revenue</p>
                    <p className="readout mt-0.5 text-[19px] font-semibold text-ink">{rm(revenue)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Units</p>
                    <p className="readout mt-0.5 text-[19px] font-semibold text-ink">{num(units)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Sales logged</p>
                    <p className="readout mt-0.5 text-[19px] font-semibold text-ink">
                      {num(lines.length)}
                    </p>
                  </div>
                </div>

                {location.recordsCountries && mix.length > 0 && (
                  <div>
                    <p className="eyebrow mb-2">Countries today</p>
                    <OriginRibbon slices={mix} height={40} />
                  </div>
                )}

                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {lines.map((l, i) => {
                    const s = skuById(l.skuId)
                    return (
                      <div
                        key={`${i}-${l.skuId}`}
                        className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2"
                      >
                        <span className="readout text-[12.5px] font-semibold text-ink">
                          {l.qty} ×
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {s?.label}
                        </span>
                        <span className="readout text-[12px] text-ink-2">
                          {rm(l.qty * (s?.priceMYR ?? 0))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </PanelBody>
            </Panel>
          )}

          {/* ── 2 · Money ───────────────────────────────────────────── */}
          {step === 1 && (
            <Panel>
              <PanelHeader
                eyebrow="Step 2 of 4"
                title="How it was paid"
                meta={`Split the ${rm(revenue)} between cash and card. No float or cash on hand is recorded.`}
              />
              <Rule />
              <PanelBody className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cash">
                    <NumberInput prefix="RM" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Credit card">
                    <NumberInput prefix="RM" value={card} onChange={(e) => setCard(e.target.value)} placeholder="0.00" />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
                  <div>
                    <p className="eyebrow">Sales total</p>
                    <p className="readout mt-0.5 text-[15px] text-ink">{rm(revenue)}</p>
                  </div>
                  <div className="ml-auto">
                    {revenue > 0 && Math.abs(tenderGap) <= 0.5 ? (
                      <Badge tone="good" icon="check">
                        Payments match the sales
                      </Badge>
                    ) : revenue > 0 ? (
                      <Badge tone="warn" icon="alert">
                        {rm(Math.abs(tenderGap), { decimals: true })}{' '}
                        {tenderGap > 0 ? 'still to account for' : 'over'}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </PanelBody>
            </Panel>
          )}

          {/* ── 3 · Stock ───────────────────────────────────────────── */}
          {step === 2 && (
            <Panel>
              <PanelHeader
                eyebrow="Step 3 of 4"
                title="Count every perfume"
                meta="Type what is physically on the shelf. The expected figure is shown so a mismatch stands out."
              />
              <Rule />
              <PanelBody className="space-y-4">
                <div className="scroll-x">
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead>
                      <tr className="border-b border-line">
                        {['Product', 'Expected', 'Counted', 'Difference'].map((h, i) => (
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
                        const soldToday = lines
                          .filter((l) => l.skuId === s.skuId)
                          .reduce((a, l) => a + l.qty, 0)
                        const expected = Math.max(0, s.onHand - soldToday)
                        const value = counted[s.skuId]
                        const diff = value === undefined || value === '' ? null : Number(value) - expected
                        return (
                          <tr key={s.skuId} className="border-b border-line/70 last:border-0">
                            <td className="py-2">
                              <p className="text-[13px] leading-tight text-ink">{s.label}</p>
                              <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                            </td>
                            <td className="readout py-2 pr-3 text-right text-[13px] text-ink-2">
                              {num(expected)}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <NumberInput
                                className="ml-auto w-[86px] text-right"
                                min={0}
                                value={value ?? ''}
                                onChange={(e) =>
                                  setCounted((v) => ({ ...v, [s.skuId]: e.target.value }))
                                }
                                placeholder="—"
                              />
                            </td>
                            <td
                              className={`readout py-2 text-right text-[13px] ${
                                diff === null
                                  ? 'text-ink-3'
                                  : diff === 0
                                    ? 'text-good'
                                    : 'text-critical'
                              }`}
                            >
                              {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

              </PanelBody>
            </Panel>
          )}

          {/* ── 4 · Top-up ──────────────────────────────────────────── */}
          {step === 3 && (
            <Panel>
              <PanelHeader
                eyebrow="Step 4 of 4"
                title="Ask HQ for a top-up"
                meta="Anything at or below its reorder level is listed. Change the numbers before you send."
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
                {suggested.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-good/25 bg-good/8 px-4 py-3">
                    <Icon name="check" className="h-4 w-4 shrink-0 text-good" />
                    <p className="text-[12.5px] text-ink">
                      Everything is above its reorder level. Nothing to ask for tonight.
                    </p>
                  </div>
                ) : (
                  <>
                    {stock
                      .filter((s) => s.status !== 'ok')
                      .map((s) => (
                        <div
                          key={s.skuId}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
                        >
                          <div className="min-w-[160px] flex-1">
                            <p className="text-[13px] text-ink">{s.label}</p>
                            <p className="text-[11px] text-ink-3">
                              {num(s.onHand)} on hand · reorder at {num(s.reorderPoint)}
                              {s.daysCover !== null && ` · ${s.daysCover.toFixed(1)} days left`}
                            </p>
                          </div>
                          <Badge tone={s.status === 'low' ? 'warn' : 'critical'} icon="alert">
                            {s.status === 'out' ? 'Out of stock' : s.status === 'critical' ? 'Very low' : 'Low'}
                          </Badge>
                          <NumberInput
                            className="w-24"
                            min={0}
                            step={skuById(s.skuId)?.caseSize ?? 12}
                            value={poQty[s.skuId] ?? 0}
                            onChange={(e) =>
                              setPoQty((q) => ({ ...q, [s.skuId]: Math.max(0, Number(e.target.value)) }))
                            }
                            disabled={!raisePo}
                          />
                        </div>
                      ))}

                    <Field label="Note for Kelly (optional)" hint="Anything she should know before deciding.">
                      <TextArea
                        value={poNotes}
                        onChange={(e) => setPoNotes(e.target.value)}
                        placeholder="Tour group booked in on Saturday — expecting a run on the Signature line."
                        disabled={!raisePo}
                      />
                    </Field>
                  </>
                )}
              </PanelBody>
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>

      {attempted[step] && stepErrors.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {stepErrors.map((e) => (
            <li key={e} className="flex items-start gap-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button
          variant="ghost"
          icon="chevronLeft"
          onClick={() => (step === 0 ? navigate('/today') : setStep((s) => s - 1))}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        <span className="ml-auto text-[12px] text-ink-3">{STEPS[step].hint}</span>
        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            iconRight="chevronRight"
            onClick={() => {
              setAttempted((a) => ({ ...a, [step]: true }))
              if (canAdvance) setStep((s) => s + 1)
            }}
          >
            Next
          </Button>
        ) : (
          <Button variant="primary" icon="check" onClick={finish}>
            {raisePo && suggested.length ? 'Close day and send order' : 'Close the day'}
          </Button>
        )}
      </div>
    </div>
  )
}
