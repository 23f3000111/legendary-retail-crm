import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { Icon } from '../../components/ui/icons'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import {
  emptyFilter,
  filteredClosings,
  poValue,
  selectChannelSplit,
  selectKpis,
  selectTimeSeries,
  selectWriteOffs,
} from '../../store/selectors'
import { CHANNEL_PLURAL, locationsInChannel, locationById } from '../../data/locations'
import { availableTransitions } from '../../lib/po-machine'
import { addDays, monthKey, monthLabel } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The Finance screen.
 *
 * Revenue only — the client was explicit that cost and profit stay out of this
 * system (Q58, Q65). The one margin figure lives here, against each consignment
 * partner, which is the exception they asked for.
 */
export function Finance() {
  const data = useData()
  const user = useCurrentUser()

  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  const kpis = selectKpis(data, filter)
  const trend = selectTimeSeries(data, filter, 'revenue')
  const channels = selectChannelSplit(data, filter)
  const writeOffs = selectWriteOffs(data, filter)

  const waitingOnMe = user
    ? data.purchaseOrders.filter((p) =>
        availableTransitions(p, user.role).some((t) => t.to !== 'rejected'),
      )
    : []

  const channelSlices: DonutSlice[] = channels.map((c) => ({
    key: c.channel,
    label: CHANNEL_PLURAL[c.channel],
    value: c.revenue,
  }))

  // Consignment partners report monthly, so their table works off the last
  // closed month rather than a rolling 30 days.
  const consignmentRows = useMemo(() => {
    const partners = locationsInChannel('consignment')
    const periods = [
      ...new Set(
        data.closings.filter((c) => c.periodType === 'month').map((c) => c.period),
      ),
    ].sort()
    const latest = periods[periods.length - 1]
    return {
      period: latest,
      rows: partners.map((p) => {
        const closing = data.closings.find((c) => c.locationId === p.id && c.period === latest)
        const revenue = closing?.revenueMYR ?? 0
        const units = closing?.lines.reduce((a, l) => a + l.qty, 0) ?? 0
        return {
          id: p.id,
          name: p.name,
          marginPct: p.marginPct ?? null,
          revenue,
          units,
          filed: Boolean(closing),
        }
      }),
    }
  }, [data.closings])

  const consignmentTotal = consignmentRows.rows.reduce((a, r) => a + r.revenue, 0)

  const staffTotal = useMemo(() => {
    const rows = filteredClosings(data, filter)
    return {
      revenue: rows.reduce((a, c) => a + c.staffSales.revenueMYR, 0),
      units: rows.reduce((a, c) => a + c.staffSales.qty, 0),
    }
  }, [data, filter])

  const exportRevenue = () =>
    downloadCsv(
      'legendary-revenue-by-channel.csv',
      ['Channel', 'Revenue MYR', 'Units'],
      channels.map((c) => [CHANNEL_PLURAL[c.channel], c.revenue, c.units]),
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office · Finance</p>
          <h1 className="page-title mt-1">
            Revenue
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Legendary's own revenue, excluding SST. Cost and profit are not held in this system —
            SQL Accounting remains the book of record.
          </p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportRevenue}>
          Export
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue · 30 days"
          value={kpis.current.revenue}
          format={rm}
          delta={kpis.delta.revenue}
          tone="violet"
          icon="wallet"
        />
        <StatTile
          label="Units sold"
          value={kpis.current.units}
          format={(n) => num(Math.round(n))}
          delta={kpis.delta.units}
          tone="blue"
          icon="box"
        />
        <StatTile
          label="Orders to clear"
          value={waitingOnMe.length}
          format={(n) => num(Math.round(n))}
          footnote={
            waitingOnMe.length
              ? `${rm(waitingOnMe.reduce((a, p) => a + poValue(p), 0))} of stock`
              : 'queue clear'
          }
          tone="cyan"
          icon="doc"
        />
        <StatTile
          label="Staff purchases"
          value={staffTotal.revenue}
          format={rm}
          footnote={`${num(staffTotal.units)} units, kept separate`}
          tone="teal"
          icon="users"
        />
      </div>

      {waitingOnMe.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Needs you"
            title={`${waitingOnMe.length} approved orders to clear`}
            meta="Clearing releases the order to the warehouse for picking."
            action={
              <Link to="/orders">
                <Button size="sm" variant="ghost" iconRight="chevronRight">
                  Open the queue
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody className="space-y-2">
            {waitingOnMe.slice(0, 5).map((po) => (
              <Link
                key={po.id}
                to={`/orders/${po.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-primary/35"
              >
                <span className="readout text-[12.5px] font-medium text-ink">{po.id}</span>
                <span className="text-[11.5px] text-ink-2">
                  {locationById(po.locationId)?.shortName}
                </span>
                {po.priority === 'urgent' && <Badge tone="critical">Urgent</Badge>}
                <span className="readout ml-auto text-[12px] text-ink">{rm(poValue(po))}</span>
                <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              </Link>
            ))}
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <ChartFrame
          title="Revenue"
          meta={`${rm(kpis.current.revenue)} over 30 days`}
          height={240}
        >
          <TrendChart data={trend} format={rmCompact} label="Daily revenue" />
        </ChartFrame>

        <ChartFrame
          title="By channel"
          meta="Main stores, dealers and consignment"
          height={240}
          table={<DonutTable slices={channelSlices} format={rm} unitHeader="Revenue" />}
        >
          <div className="flex h-full items-center justify-center">
            <Donut
              slices={channelSlices}
              centreLabel="30-day revenue"
              centreValue={rmCompact(kpis.current.revenue)}
              format={rm}
              size={176}
            />
          </div>
        </ChartFrame>
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Consignment"
          title={
            consignmentRows.period
              ? `${monthLabel(monthKey(consignmentRows.period))} · ${rm(consignmentTotal)}`
              : 'Consignment partners'
          }
          meta="These partners report once a month. Margin rates are placeholders until you confirm them."
        />
        <Rule />
        <PanelBody>
          <div className="scroll-x">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {['Partner', 'Units', 'Revenue to us', 'Their margin', 'Status'].map((h, i) => (
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
                {consignmentRows.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 last:border-0">
                    <td className="py-2.5 text-[13px] text-ink">{r.name}</td>
                    <td className="readout py-2.5 text-right text-[13px] text-ink-2">
                      {num(r.units)}
                    </td>
                    <td className="readout py-2.5 text-right text-[13px] text-ink">
                      {rm(r.revenue)}
                    </td>
                    <td className="readout py-2.5 text-right text-[13px] text-ink-2">
                      {r.marginPct === null ? '—' : `${r.marginPct}%`}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.filed ? (
                        <Badge tone="good" icon="check">
                          Reported
                        </Badge>
                      ) : (
                        <Badge tone="warn" icon="clock">
                          Awaited
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          eyebrow="Written off"
          title={`${writeOffs.total} units in 30 days`}
          meta="Testers used up, damages and free samples. Kelly and Davy approve these."
        />
        <Rule />
        <PanelBody>
          {writeOffs.total === 0 ? (
            <EmptyState icon="check" title="Nothing written off" body="No testers, damages or samples recorded in this period." />
          ) : (
            <ul className="flex flex-wrap gap-3">
              {[...writeOffs.byReason.entries()].map(([reason, qty]) => (
                <li
                  key={reason}
                  className="rounded-xl border border-line bg-surface-2 px-4 py-3"
                >
                  <p className="eyebrow capitalize">{reason}</p>
                  <p className="readout mt-1 font-display text-[19px] font-semibold text-ink">
                    {num(qty)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}
