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
import { FromTo } from '../../components/FromTo'
import { PartnerPeriodPanel } from '../../components/PartnerPeriod'
import { StoreSalesModal, datesChoice } from '../../components/StoreSales'
import { PartnerMonthForm, firstPartnerMonth, partnerMonthChoices } from './PartnerSales'
import { useData, PARTNER_KEYERS } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useViews } from '../../store/useViews'
import { emptyFilter, poValue, selectChannelPeriod, selectTimeSeries, totalsFor } from '../../store/selectors'
import { CHANNEL_PLURAL, locationById } from '../../data/locations'
import { awaitingFinance } from '../../lib/po-machine'
import { addDays, formatDate, monthKey, monthLabel, shiftMonth } from '../../lib/dates'
import { monthDates } from '../../lib/periods'
import { restoreDates } from '../../lib/views'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'
import type { DateStr } from '../../data/types'

type DatesOf = 'consignment' | 'dealer' | 'channels'

/**
 * The Finance screen: Revenue.
 *
 * Revenue only — the client was explicit that cost and profit stay out of this
 * system (Q58, Q65). The one margin figure is against each consignment
 * partner, the exception they asked for.
 *
 * As the developer set it out on 20 November: no tiles at the top and no
 * Written off; the sales report, its business date *between* two dates and
 * its other rules folded until wanted; the dealers beside the consignment
 * partners, each list with its own From and To, the dealers highest first;
 * By channel with its own dates. Finance keys a month in here (**Key in a
 * month**), having no Dealer sales page.
 */
export function Finance() {
  const data = useData()
  const user = useCurrentUser()
  const keep = useViews((s) => s.keep)
  const canKey = Boolean(user && PARTNER_KEYERS.includes(user.role))

  // Each list's own dates, last month to begin with: the one all partners have reported.
  const lastMonth = useMemo(() => monthDates(shiftMonth(monthKey(data.today), -1), data.today), [data.today])
  const [dates, setDatesState] = useState<Record<DatesOf, { from: DateStr; to: DateStr }>>(() => {
    const kept = useViews.getState().revenue?.dates ?? {}
    return {
      consignment: restoreDates(kept.consignment, data.today) ?? lastMonth,
      dealer: restoreDates(kept.dealer, data.today) ?? lastMonth,
      channels: restoreDates(kept.channels, data.today) ?? lastMonth,
    }
  })
  const setDates = (of: DatesOf, from: DateStr, to: DateStr) => {
    const next = { ...dates, [of]: { from, to } }
    setDatesState(next)
    keep('revenue', { ...useViews.getState().revenue, dates: next })
  }

  // Keying a month in: the month, last month first, the one being keyed in most days.
  const months = useMemo(() => partnerMonthChoices(data.today), [data.today])
  const [keying, setKeying] = useState(false)
  const [month, setMonthState] = useState(() => {
    const kept = useViews.getState().revenue?.month
    return kept && months.includes(kept) ? kept : firstPartnerMonth(data.today)
  })
  const setMonth = (m: string) => {
    setMonthState(m)
    keep('revenue', { ...useViews.getState().revenue, month: m })
  }

  /** A partner opened from its list, for that list's dates. */
  const [opened, setOpened] = useState<{ id: string; from: DateStr; to: DateStr } | null>(null)

  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  const trend = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  const thirtyDays = useMemo(() => totalsFor(data, filter).revenue, [data, filter])

  const span = (d: { from: DateStr; to: DateStr }) => (d.from === d.to ? formatDate(d.from) : `${formatDate(d.from)} to ${formatDate(d.to)}`)

  // Every approved order Finance has not yet cleared — the warehouse may
  // already be packing it; that no longer waits on Finance.
  const waitingOnMe = user?.role === 'finance' ? data.purchaseOrders.filter(awaitingFinance) : []

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Head Office · Finance</p>
        <h1 className="page-title mt-1">Revenue</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
          Legendary's own revenue, excluding SST. Cost and profit are not held in this system —
          SQL Accounting remains the book of record.
        </p>
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

      {/* ── Dealers beside consignment, each for its own dates (20 November) ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Dealers &amp; consignment</p>
            <h2 className="mt-1 font-display text-[18px] font-semibold leading-tight tracking-tight text-ink">
              {keying ? `Key in ${monthLabel(month)}, a figure per partner` : 'Their sales, for the dates chosen'}
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-ink-2">
              {keying
                ? 'One figure per partner for the month; type 0 for one that sold nothing. Margin rates are placeholders until you confirm them.'
                : 'Each list has its own From and To. A partner reports a month at a time, and its month counts when its 1st is in the dates. Tap a partner for its months.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {keying && (
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
            )}
            {canKey && (
              <Button
                variant={keying ? 'secondary' : 'ghost'}
                icon={keying ? 'chevronLeft' : 'pencil'}
                onClick={() => setKeying((k) => !k)}
              >
                {keying ? 'Back to the dates' : 'Key in a month'}
              </Button>
            )}
          </div>
        </div>
        {keying ? (
          /* Remounted per month, so what is typed always belongs to the month shown. */
          <PartnerMonthForm key={month} month={month} quiet />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {(['consignment', 'dealer'] as const).map((channel) => (
              <PartnerPeriodPanel
                key={channel}
                channel={channel}
                from={dates[channel].from}
                to={dates[channel].to}
                onDates={(from, to) => setDates(channel, from, to)}
                onOpen={(id) => setOpened({ id, ...dates[channel] })}
              />
            ))}
          </div>
        )}
      </section>

      {/* The graphs, at the foot of the page (client, 1 November). */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <ChartFrame title="Revenue · last 30 days" meta={`${rm(thirtyDays)} over 30 days, day by day`} height={240}>
          <TrendChart data={trend} format={rmCompact} label="Daily revenue" />
        </ChartFrame>

        <ByChannel
          from={dates.channels.from}
          to={dates.channels.to}
          when={span(dates.channels)}
          onDates={(from, to) => setDates('channels', from, to)}
        />
      </div>

      {opened && (
        <StoreSalesModal locationId={opened.id} periods={[datesChoice(opened.from, opened.to)]} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}

/**
 * By channel for dates of its own (20 November: dealers and consignment
 * "should be seen"): the main stores' days as filed, today live, and each
 * partner channel's months whose 1st is in the dates, with how many partners
 * have a figure. The figures first; the ring a tap away; the CSV in its corner.
 */
function ByChannel({
  from,
  to,
  when,
  onDates,
}: {
  from: DateStr
  to: DateStr
  when: string
  onDates: (from: DateStr, to: DateStr) => void
}) {
  const data = useData()
  const [chart, setChart] = useState(false)
  const channels = useMemo(() => selectChannelPeriod(data, from, to), [data, from, to])
  const total = channels.reduce((a, c) => a + c.revenue, 0)
  const share = (n: number) => (total ? (n / total) * 100 : 0)
  const slices: DonutSlice[] = channels
    .filter((c) => c.revenue > 0)
    .map((c) => ({ key: c.channel, label: CHANNEL_PLURAL[c.channel], value: c.revenue }))
  const unkeyed = channels.filter((c) => c.keyed && c.keyed.done < c.keyed.of)

  const exportCsv = () =>
    downloadCsv(
      `legendary-revenue-by-channel-${from}-to-${to}.csv`,
      ['From', 'To', 'Channel', 'Revenue MYR', 'Share %', 'Partners with a figure'],
      [
        ...channels.map((c) => [
          from,
          to,
          CHANNEL_PLURAL[c.channel],
          c.revenue,
          Math.round(share(c.revenue) * 10) / 10,
          c.keyed ? `${c.keyed.done} of ${c.keyed.of}` : '',
        ]),
        [from, to, 'Total', Math.round(total * 100) / 100, total ? 100 : 0, ''],
      ],
    )

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        eyebrow="By channel"
        title={when}
        meta={
          <>
            Main stores as filed, today live; dealers and consignment as keyed in, a month counting when its 1st is in the
            dates.
            {unkeyed.length > 0 && (
              <span className="text-warn">
                {' '}
                {unkeyed.map((c) => `${num(c.keyed!.of - c.keyed!.done)} ${CHANNEL_PLURAL[c.channel].toLowerCase()}`).join(' and ')}{' '}
                without a figure.
              </span>
            )}
          </>
        }
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon="download" onClick={exportCsv}>
              CSV
            </Button>
            <Button size="sm" variant="ghost" icon={chart ? 'grid' : 'chart'} onClick={() => setChart((c) => !c)}>
              {chart ? 'Figures' : 'Chart'}
            </Button>
          </div>
        }
      />
      <Rule />
      <PanelBody className="space-y-3">
        <FromTo from={from} to={to} today={data.today} onChange={onDates} label="By channel" />
        {chart ? (
          <div className="flex items-center justify-center py-2">
            <Donut slices={slices} centreLabel="the dates" centreValue={rmCompact(total)} format={rm} size={176} />
          </div>
        ) : (
          <FiguresTable
            rows={channels}
            rowKey={(c) => c.channel}
            columns={[
              { header: 'Channel', render: (c) => CHANNEL_PLURAL[c.channel] },
              { header: 'Revenue', align: 'right', render: (c) => rm(c.revenue), total: rm(total) },
              { header: 'Share', align: 'right', render: (c) => `${share(c.revenue).toFixed(1)}%`, total: total ? '100.0%' : '—' },
              {
                header: 'With a figure',
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
        )}
      </PanelBody>
    </Panel>
  )
}
