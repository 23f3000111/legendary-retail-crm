import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { ChangeList, Notice } from '../../components/ui/Notice'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { HeatCalendar } from '../../components/charts/HeatCalendar'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { emptyFilter, originSlicesFrom, selectTimeSeries } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { lineUnitPrice, skuById, skuLabel, TIER_LABEL, type PriceBasis } from '../../data/products'
import { addDays, formatDayShort, formatTimestamp } from '../../lib/dates'
import { closingEditMode, CORRECTION_WINDOW_DAYS } from '../../lib/editing'
import { money } from '../../lib/changes'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'
import type { Closing } from '../../data/types'

/**
 * Filed closings, with one day openable in full — and changeable.
 *
 * Today's closing is changed straight away. An earlier day's can be changed
 * for three days, and Kelly approves the change (Q19): the store opens the
 * same closing form, filled in with what was filed, changes only what was
 * wrong, and sends it. The button says which of the two it will be, and goes
 * once the window has passed rather than failing after the fact.
 */
export function History() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const data = useData()
  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  // Which of the two prices this store is counted on (Revision 2).
  const basis = location?.priceBasis ?? 'promotion'

  const [open, setOpen] = useState<Closing | null>(null)
  // The row opened is a copy; show the latest version of that day.
  const shown = open ? (data.closings.find((c) => c.id === open.id) ?? open) : null

  const rows = data.closings
    .filter((c) => c.locationId === locationId)
    .sort((a, b) => (a.period < b.period ? 1 : -1))

  const window90 = { ...emptyFilter(addDays(data.today, -89), data.today), locationIds: [locationId] }
  const heat = selectTimeSeries(data, window90, 'revenue')

  /** What this person can do to a filed day, and the words on the button. */
  const actionFor = (c: Closing): { label: string; href: string } | null => {
    if (!user) return null
    const mode = closingEditMode(user, user.locationId, c, data.today)
    const href = c.period === data.today ? '/close?edit=1' : `/close?day=${c.period}&edit=1`
    if (mode === 'direct') return { label: 'Change', href }
    if (mode === 'request') {
      return { label: c.correction?.status === 'pending' ? 'Change request' : 'Ask to correct', href }
    }
    return null
  }

  const columns: Column<Closing>[] = [
    {
      key: 'date',
      header: 'Day',
      render: (c) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink">{formatDayShort(c.period)}</span>
          {c.correction?.status === 'pending' && <Badge tone="warn">Waiting for Kelly</Badge>}
          {c.correction?.status === 'approved' && <Badge tone="good">Corrected</Badge>}
          {c.correction?.status === 'rejected' && <Badge tone="neutral">Correction turned down</Badge>}
          {c.editedAt && !c.correction && <Badge tone="active">Changed</Badge>}
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
      width: '140px',
      render: (c) => {
        const action = actionFor(c)
        return action ? (
          <Button
            size="sm"
            variant="ghost"
            icon="pencil"
            onClick={(e) => {
              e.stopPropagation()
              navigate(action.href)
            }}
          >
            {action.label}
          </Button>
        ) : null
      },
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
            Today's closing can be changed straight away. An earlier day can be corrected for{' '}
            {CORRECTION_WINDOW_DAYS} days, and Kelly approves the change.
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
        open={shown !== null}
        onClose={() => setOpen(null)}
        title={shown ? formatDayShort(shown.period) : ''}
        subtitle={
          shown
            ? `Filed by ${shown.submittedBy} at ${formatTimestamp(shown.submittedAt)}${
                shown.editedBy && shown.editedAt
                  ? ` · changed by ${shown.editedBy} at ${formatTimestamp(shown.editedAt)}`
                  : ''
              }`
            : undefined
        }
        width="max-w-2xl"
        footer={
          shown && actionFor(shown) ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Close
              </Button>
              <Button variant="primary" size="sm" icon="pencil" onClick={() => navigate(actionFor(shown)!.href)}>
                {actionFor(shown)!.label === 'Change' ? 'Change this closing' : actionFor(shown)!.label}
              </Button>
            </>
          ) : undefined
        }
      >
        {shown && <DayDetail day={shown} basis={basis} />}
      </Modal>
    </div>
  )
}

/** One filed day in full: the money, who bought, what sold, what was counted. */
function DayDetail({ day, basis }: { day: Closing; basis: PriceBasis }) {
  return (
    <div className="space-y-5">
      {day.correction && (
        <Notice
          tone={day.correction.status === 'pending' ? 'warn' : day.correction.status === 'approved' ? 'good' : 'neutral'}
          icon="clipboard"
        >
          <b>
            {day.correction.status === 'pending'
              ? `${day.correction.requestedBy} asked to correct this day — waiting for Kelly.`
              : day.correction.status === 'approved'
                ? `Corrected — approved by ${day.correction.approvedBy}.`
                : `The correction was turned down by ${day.correction.approvedBy}.`}
          </b>{' '}
          {day.correction.reason}
          {day.correction.note ? ` — “${day.correction.note}”` : ''}
          {day.correction.changes?.length ? (
            <ChangeList changes={day.correction.changes} className="mt-2" />
          ) : null}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Revenue', value: rm(day.revenueMYR) },
          { label: 'Cash', value: rm(day.tender?.cash ?? 0) },
          { label: 'E-wallet', value: rm(day.tender?.ewallet ?? 0) },
          { label: 'Card', value: rm(day.tender?.card ?? 0) },
        ].map((f) => (
          <div key={f.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="eyebrow">{f.label}</p>
            <p className="readout mt-1 text-[13px] text-ink">{f.value}</p>
          </div>
        ))}
      </div>

      {day.lines.some((l) => l.countryCode) && (
        <div>
          <p className="eyebrow mb-2">Countries that day</p>
          <OriginRibbon
            slices={originSlicesFrom(
              day.lines.reduce((m, l) => {
                if (!l.countryCode) return m
                const b = m.get(l.countryCode) ?? { units: 0, revenue: 0 }
                b.units += l.qty
                b.revenue += l.qty * lineUnitPrice(l, basis)
                m.set(l.countryCode, b)
                return m
              }, new Map<string, { units: number; revenue: number }>()),
            )}
            height={40}
          />
        </div>
      )}

      {day.writeOffs.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Testers, damages and samples</p>
          <ul className="space-y-1.5">
            {day.writeOffs.map((w, i) => (
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

      {day.lines.length > 0 && (
        <div>
          <p className="eyebrow mb-2">What sold</p>
          <ul className="space-y-1.5">
            {day.lines.map((l, i) => (
              <li
                key={l.id ?? i}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]"
              >
                <span className="readout font-semibold text-ink">{l.qty} ×</span>
                <span className="min-w-0 flex-1 truncate text-ink">{skuLabel(l.skuId)}</span>
                {l.priceTier && l.priceTier !== basis && <Badge tone="neutral">{TIER_LABEL[l.priceTier]}</Badge>}
                <span className="readout text-ink-2">{money(l.qty * lineUnitPrice(l, basis))}</span>
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
            {day.stockCount.map((m) => (
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
  )
}
