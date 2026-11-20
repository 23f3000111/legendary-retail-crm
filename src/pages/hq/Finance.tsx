import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { FiguresTable } from '../../components/ui/FiguresTable'
import { Select } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, type DonutSlice } from '../../components/charts/Donut'
import { SalesReport } from '../../components/SalesReport'
import { PartnerMonthForm, firstPartnerMonth, partnerMonthChoices } from './PartnerSales'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useViews } from '../../store/useViews'
import { emptyFilter, poValue, selectChannelMonth, selectTimeSeries, totalsFor } from '../../store/selectors'
import { CHANNEL_PLURAL, locationById } from '../../data/locations'
import { awaitingFinance } from '../../lib/po-machine'
import { addDays, monthKey, monthLabel } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The Finance screen: Revenue.
 *
 * Revenue only — the client was explicit that cost and profit stay out of this
 * system (Q58, Q65). The one margin figure is against each consignment
 * partner, the exception they asked for.
 *
 * As the developer set it out on 20 November: no tiles at the top (revenue,
 * units sold, orders to clear, staff purchases) and no Written off; the sales
 * report, its business date *between* two dates and its other rules folded
 * until wanted; the dealers beside the consignment partners, keyed in here
 * now that Finance has no Dealer sales page; and By channel for a month, so
 * the dealers and consignment are in it.
 */
export function Finance() {
  const data = useData()
  const user = useCurrentUser()
  const keep = useViews((s) => s.keep)

  // The partners' month: last month first, the one being keyed in most days.
  const months = useMemo(() => partnerMonthChoices(data.today), [data.today])
  const [month, setMonthState] = useState(() => {
    const kept = useViews.getState().revenue?.month
    return kept && months.includes(kept) ? kept : firstPartnerMonth(data.today)
  })
  const setMonth = (m: string) => {
    setMonthState(m)
    keep('revenue', { ...useViews.getState().revenue, month: m })
  }

  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  const trend = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  const thirtyDays = useMemo(() => totalsFor(data, filter).revenue, [data, filter])
  const channels = useMemo(() => selectChannelMonth(data, month), [data, month])
  const channelTotal = channels.reduce((a, c) => a + c.revenue, 0)
  const share = (n: number) => (channelTotal ? (n / channelTotal) * 100 : 0)
  const unkeyed = channels.filter((c) => c.keyed && c.keyed.done < c.keyed.of)

  // Every approved order Finance has not yet cleared — the warehouse may
  // already be packing it; that no longer waits on Finance.
  const waitingOnMe = user?.role === 'finance' ? data.purchaseOrders.filter(awaitingFinance) : []

  const channelSlices: DonutSlice[] = channels
    .filter((c) => c.revenue > 0)
    .map((c) => ({ key: c.channel, label: CHANNEL_PLURAL[c.channel], value: c.revenue }))

  // The month and the channels in the file, on every row (client, 20 October).
  const exportChannels = () =>
    downloadCsv(
      `legendary-revenue-by-channel-${month}.csv`,
      ['Month', 'Channel', 'Revenue MYR', 'Share %', 'Partners keyed in'],
      [
        ...channels.map((c) => [
          month,
          CHANNEL_PLURAL[c.channel],
          c.revenue,
          Math.round(share(c.revenue) * 10) / 10,
          c.keyed ? `${c.keyed.done} of ${c.keyed.of}` : '',
        ]),
        [month, 'Total', Math.round(channelTotal * 100) / 100, channelTotal ? 100 : 0, ''],
      ],
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office · Finance</p>
          <h1 className="page-title mt-1">Revenue</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Legendary's own revenue, excluding SST. Cost and profit are not held in this system —
            SQL Accounting remains the book of record.
          </p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportChannels}>
          By channel · {monthLabel(month)}
        </Button>
      </div>

      {waitingOnMe.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Needs you"
            title={`${waitingOnMe.length} approved ${waitingOnMe.length === 1 ? 'order' : 'orders'} to clear`}
            meta="The warehouse has these already. Clearing records that accounts has them too."
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
                  <span className="text-ink-3"> · by {po.createdBy}</span>
                </span>
                {po.priority === 'urgent' && <Badge tone="critical">Urgent</Badge>}
                <StatusChip status={po.status} />
                <span className="readout ml-auto text-[12px] text-ink">{rm(poValue(po))}</span>
                <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              </Link>
            ))}
          </PanelBody>
        </Panel>
      )}

      {/* The sales report: between two dates, the other rules folded (20 November). */}
      <SalesReport />

      {/* ── Dealers beside consignment, a month at a time (20 November) ───── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Dealers &amp; consignment</p>
            <h2 className="mt-1 font-display text-[18px] font-semibold leading-tight tracking-tight text-ink">
              {monthLabel(month)}, a figure per partner
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-ink-2">
              They report once a month. Key in each partner's figure here; type 0 for one that sold nothing.
              Margin rates are placeholders until you confirm them.
            </p>
          </div>
          <div className="w-[200px]">
            <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === monthKey(data.today) ? ' (this month)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {/* Remounted per month, so what is typed always belongs to the month shown. */}
        <PartnerMonthForm key={month} month={month} quiet />
      </section>

      {/* The graphs, at the foot of the page (client, 1 November). */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <ChartFrame title="Revenue · last 30 days" meta={`${rm(thirtyDays)} over 30 days, day by day`} height={240}>
          <TrendChart data={trend} format={rmCompact} label="Daily revenue" />
        </ChartFrame>

        <ChartFrame
          title={`By channel · ${monthLabel(month)}`}
          meta={
            <>
              Main stores as filed{month === monthKey(data.today) ? ', today live' : ''}; dealers and consignment as keyed
              in above. Choose the month there.
              {unkeyed.length > 0 && (
                <span className="text-warn">
                  {' '}
                  {unkeyed.map((c) => `${c.keyed!.of - c.keyed!.done} ${CHANNEL_PLURAL[c.channel].toLowerCase()}`).join(' and ')}{' '}
                  not keyed in yet.
                </span>
              )}
            </>
          }
          height={240}
          table={
            <FiguresTable
              rows={channels}
              rowKey={(c) => c.channel}
              columns={[
                { header: 'Channel', render: (c) => CHANNEL_PLURAL[c.channel] },
                { header: 'Revenue', align: 'right', render: (c) => rm(c.revenue), total: rm(channelTotal) },
                { header: 'Share', align: 'right', render: (c) => `${share(c.revenue).toFixed(1)}%`, total: channelTotal ? '100.0%' : '—' },
                {
                  header: 'Keyed in',
                  align: 'right',
                  render: (c) =>
                    c.keyed ? (
                      <span className={c.keyed.done < c.keyed.of ? 'text-warn' : 'text-ink-2'}>
                        {num(c.keyed.done)} of {num(c.keyed.of)}
                      </span>
                    ) : (
                      <span className="text-ink-3">daily</span>
                    ),
                },
              ]}
            />
          }
        >
          <div className="flex h-full items-center justify-center">
            <Donut slices={channelSlices} centreLabel={monthLabel(month)} centreValue={rmCompact(channelTotal)} format={rm} size={176} />
          </div>
        </ChartFrame>
      </div>
    </div>
  )
}
