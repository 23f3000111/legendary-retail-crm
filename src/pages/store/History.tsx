import { useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { Field, NumberInput, TextArea } from '../../components/ui/Field'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { HeatCalendar } from '../../components/charts/HeatCalendar'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { useData, CORRECTION_WINDOW_DAYS } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { emptyFilter, originSlicesFrom, selectTimeSeries } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { priceOf, skuById } from '../../data/products'
import { addDays, daysBetween, formatDayShort } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'
import type { Closing } from '../../data/types'

/**
 * Filed closings, with one day openable in full.
 *
 * A closing can be corrected for three days, and Kelly approves the change
 * (Q19) — so the button disappears once the window has passed rather than
 * failing after the fact.
 */
export function History() {
  const user = useCurrentUser()
  const data = useData()
  const requestCorrection = useData((s) => s.requestCorrection)
  const push = useToasts((s) => s.push)
  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  // Which of the two prices this store is counted on (Revision 2).
  const basis = location?.priceBasis ?? 'promotion'

  const [open, setOpen] = useState<Closing | null>(null)
  const [correcting, setCorrecting] = useState<Closing | null>(null)
  const [reason, setReason] = useState('')
  const [newRevenue, setNewRevenue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rows = data.closings
    .filter((c) => c.locationId === locationId)
    .sort((a, b) => (a.period < b.period ? 1 : -1))

  const window90 = { ...emptyFilter(addDays(data.today, -89), data.today), locationIds: [locationId] }
  const heat = selectTimeSeries(data, window90, 'revenue')

  const withinWindow = (c: Closing) => daysBetween(c.period, data.today) <= CORRECTION_WINDOW_DAYS

  const columns: Column<Closing>[] = [
    {
      key: 'date',
      header: 'Day',
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink">{formatDayShort(c.period)}</span>
          {c.correction?.status === 'pending' && <Badge tone="warn">Correction pending</Badge>}
          {c.correction?.status === 'approved' && <Badge tone="good">Corrected</Badge>}
        </div>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (c) => <span className="readout text-[13px] text-ink">{rm(c.revenueMYR)}</span>,
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (c) => (
        <span className="readout text-[13px] text-ink-2">
          {num(c.lines.reduce((a, l) => a + l.qty, 0))}
        </span>
      ),
    },
    {
      key: 'cash',
      header: 'Cash',
      align: 'right',
      render: (c) => (
        <span className="readout text-[13px] text-ink-2">{rm(c.tender?.cash ?? 0)}</span>
      ),
    },
    {
      key: 'card',
      header: 'Card',
      align: 'right',
      render: (c) => (
        <span className="readout text-[13px] text-ink-2">{rm(c.tender?.card ?? 0)}</span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      width: '120px',
      render: (c) =>
        withinWindow(c) && !c.correction ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              setCorrecting(c)
              setNewRevenue(String(c.revenueMYR))
              setReason('')
              setError(null)
            }}
          >
            Correct
          </Button>
        ) : null,
    },
  ]

  const exportRows = () =>
    downloadCsv(
      `legendary-${location?.code ?? 'store'}-closings.csv`,
      ['Date', 'Revenue MYR', 'Units', 'Cash', 'E-wallet', 'Card', 'Staff units', 'Staff MYR'],
      rows.map((c) => [
        c.period,
        c.revenueMYR,
        c.lines.reduce((a, l) => a + l.qty, 0),
        c.tender?.cash ?? 0,
        c.tender?.ewallet ?? 0,
        c.tender?.card ?? 0,
        c.staffSales.qty,
        c.staffSales.revenueMYR,
      ]),
    )

  if (!location) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{location.name}</p>
          <h1 className="page-title mt-1">
            Closing history
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Corrections are allowed for {CORRECTION_WINDOW_DAYS} days, with Kelly's approval.
          </p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportRows}>
          Export
        </Button>
      </div>

      <ChartFrame title="Trading pattern" meta="Last 90 days, darker is busier" height={150}>
        <HeatCalendar data={heat} format={rmCompact} />
      </ChartFrame>

      <Panel>
        <PanelHeader eyebrow="Filed" title={`${rows.length} days`} meta="Open a day to see the detail." />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            onRowClick={setOpen}
            dense
            empty={<EmptyState title="Nothing filed yet" body="Close a day and it will appear here." />}
          />
        </PanelBody>
      </Panel>

      {/* ── Day detail ────────────────────────────────────────────────── */}
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? formatDayShort(open.period) : ''}
        subtitle={open ? `Filed by ${open.submittedBy}` : undefined}
        width="max-w-2xl"
      >
        {open && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Revenue', value: rm(open.revenueMYR) },
                { label: 'Cash', value: rm(open.tender?.cash ?? 0) },
                { label: 'E-wallet', value: rm(open.tender?.ewallet ?? 0) },
                { label: 'Card', value: rm(open.tender?.card ?? 0) },
              ].map((f) => (
                <div key={f.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <p className="eyebrow">{f.label}</p>
                  <p className="readout mt-1 text-[13px] text-ink">{f.value}</p>
                </div>
              ))}
            </div>

            {open.lines.some((l) => l.countryCode) && (
              <div>
                <p className="eyebrow mb-2">Countries that day</p>
                <OriginRibbon
                  slices={originSlicesFrom(
                    open.lines.reduce((m, l) => {
                      if (!l.countryCode) return m
                      const b = m.get(l.countryCode) ?? { units: 0, revenue: 0 }
                      b.units += l.qty
                      b.revenue += l.qty * priceOf(skuById(l.skuId), basis)
                      m.set(l.countryCode, b)
                      return m
                    }, new Map<string, { units: number; revenue: number }>()),
                  )}
                  height={40}
                />
              </div>
            )}

            {open.writeOffs.length > 0 && (
              <div>
                <p className="eyebrow mb-2">Testers, damages and samples</p>
                <ul className="space-y-1.5">
                  {open.writeOffs.map((w, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]"
                    >
                      <span className="readout font-semibold text-ink">{w.qty} ×</span>
                      <span className="flex-1 text-ink">{skuById(w.skuId)?.label}</span>
                      <Badge tone="warn">{w.reason}</Badge>
                      {w.approvedBy && (
                        <span className="text-[11px] text-ink-3">approved by {w.approvedBy}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="eyebrow mb-2">Stock counted</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    {['Product', 'Opening', 'Counted'].map((h, i) => (
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
                  {open.stockCount.map((m) => (
                    <tr key={m.skuId} className="border-b border-line/70 last:border-0">
                      <td className="py-1.5 text-[12.5px] text-ink">{skuById(m.skuId)?.label}</td>
                      <td className="readout py-1.5 text-right text-[12.5px] text-ink-3">
                        {num(m.opening)}
                      </td>
                      <td className="readout py-1.5 text-right text-[12.5px] text-ink">
                        {num(m.counted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Correction request ────────────────────────────────────────── */}
      <Modal
        open={correcting !== null}
        onClose={() => setCorrecting(null)}
        title="Ask to correct this closing"
        subtitle={
          correcting
            ? `${formatDayShort(correcting.period)} · Kelly approves corrections`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCorrecting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!correcting || !user) return
                const result = requestCorrection({
                  closingId: correcting.id,
                  requestedBy: user.name,
                  reason,
                  revenueMYR: Number(newRevenue) || correcting.revenueMYR,
                })
                if (!result.ok) {
                  setError(result.error ?? 'That correction could not be sent.')
                  return
                }
                push('Correction sent to Kelly', 'good')
                setCorrecting(null)
              }}
            >
              Send to Kelly
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Corrected revenue" hint="What the figure should have been.">
            <NumberInput
              prefix="RM"
              value={newRevenue}
              onChange={(e) => setNewRevenue(e.target.value)}
            />
          </Field>
          <Field label="What went wrong" error={error} hint="Kelly sees this when she decides.">
            <TextArea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Two sales were logged twice by mistake."
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
