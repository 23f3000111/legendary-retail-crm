import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, LiveDot, SeverityBadge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { ProgressBar } from '../../components/ui/Progress'
import { Icon } from '../../components/ui/icons'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuTable } from '../../components/charts/SkuBars'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import {
  emptyFilter,
  poValue,
  selectChannelSplit,
  selectClosingFor,
  selectKpis,
  selectLocationRows,
  selectLocationSparkline,
  selectNotFiled,
  selectOriginMix,
  selectSkuPerformance,
  selectTimeSeries,
} from '../../store/selectors'
import {
  CHANNEL_PLURAL,
  locationById,
  MORNING_WATCHLIST,
  tradingLocations,
} from '../../data/locations'
import { isOpen, STATUS_LABEL, STATUS_OWNER } from '../../lib/po-machine'
import { addDays, formatDate, relativeDay } from '../../lib/dates'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The leadership screen — the Managing Director's and the founder's home.
 *
 * It opens with the three stores Davy said he checks first thing every morning
 * (Q71), because a dashboard that makes you hunt for your own habit is a
 * dashboard you stop opening.
 *
 * **The founder gets a shorter version.** Vins asked for his own screen to lose
 * the charts and the detailed analysis: the takings he checks, how the stores
 * are tracking, and anything genuinely his to worry about. Nothing is taken
 * away from him — every chart is still on Analytics, and his navigation still
 * reaches all of it — the *home page* is simply an answer rather than a
 * workbench. He sees everything and edits nothing (the hierarchy chart), so a
 * screen full of operational detail was work he never had to do.
 */

/**
 * What a founder is actually going to act on.
 *
 * Stock running low at a marketplace and an order waiting on Finance are
 * somebody's job, and that somebody is not him. A store that never filed its
 * day, a correction waiting to be approved and a month falling behind are
 * different — those are the ones worth interrupting him for.
 */
const FOUNDER_ALERTS = ['missed_closing', 'correction_pending', 'target_risk']
export function Overview() {
  const data = useData()
  const user = useCurrentUser()
  const capability = useCan()
  const executive = user?.role === 'director'
  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])

  const kpis = useMemo(() => selectKpis(data, filter), [data, filter])
  const trend = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  const mix = useMemo(() => selectOriginMix(data, filter), [data, filter])
  const rows = useMemo(() => selectLocationRows(data, filter), [data, filter])
  const skuRows = useMemo(() => selectSkuPerformance(data, filter), [data, filter])
  const channels = useMemo(() => selectChannelSplit(data, filter), [data, filter])

  const yesterday = addDays(data.today, -1)
  const notFiled = selectNotFiled(data, yesterday)
  const alerts = data.alerts
    .filter((a) => !a.read)
    .filter((a) => !executive || FOUNDER_ALERTS.includes(a.type))
  const urgent = alerts.filter((a) => a.severity !== 'warn')
  const openOrders = data.purchaseOrders.filter(isOpen)
  const openValue = openOrders.reduce((a, p) => a + poValue(p), 0)

  // Davy's morning three (Q71) — yesterday's takings at the stores he watches.
  const watchlist = MORNING_WATCHLIST.map((id) => {
    const loc = locationById(id)
    const closing = selectClosingFor(data, id, yesterday)
    return { loc, revenue: closing?.revenueMYR ?? null, filed: Boolean(closing) }
  }).filter((w) => w.loc)

  const channelSlices: DonutSlice[] = channels.map((c) => ({
    key: c.channel,
    label: CHANNEL_PLURAL[c.channel],
    value: c.revenue,
  }))

  const mainRows = rows.filter((r) => r.channel === 'main')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <p className="eyebrow">Legendary Group</p>
            <LiveDot />
          </div>
          <h1 className="page-title mt-1.5 sm:text-[28px]">
            Good morning{user ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {executive
              ? `${tradingLocations.length} stores · yesterday and this month`
              : `${tradingLocations.length} stores · rolling 30 days to ${formatDate(data.today)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/analytics">
            <Button variant="secondary" icon="chart">
              Analytics
            </Button>
          </Link>
          <Button variant="primary" icon="printer" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* ── The morning three ─────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Yesterday"
          title="The three you check first"
          meta={`Takings for ${formatDate(yesterday)}.`}
        />
        <Rule />
        <PanelBody>
          <ul className="grid gap-3 sm:grid-cols-3">
            {watchlist.map((w) => (
              <li key={w.loc!.id}>
                <Link
                  to={`/stores/${w.loc!.id}`}
                  className="group block rounded-xl border border-line bg-surface-2 px-4 py-3.5 transition-all duration-200 hover:border-primary/45 hover:shadow-glass"
                >
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    {w.loc!.shortName}
                    <Icon
                      name="chevronRight"
                      className="h-3 w-3 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </p>
                  {w.filed ? (
                    <p className="readout mt-1.5 font-display text-[22px] font-semibold text-ink sm:text-[24px]">
                      {rm(w.revenue!)}
                    </p>
                  ) : (
                    <p className="mt-1.5 flex items-center gap-2 font-display text-[18px] font-semibold text-critical">
                      <Icon name="alert" className="h-4 w-4" />
                      Not filed
                    </p>
                  )}
                  <Sparkline
                    data={selectLocationSparkline(data, w.loc!.id)}
                    width={140}
                    height={26}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      {/* ── Headline ──────────────────────────────────────────────────── */}
      {!executive && (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Revenue · 30 days"
          value={kpis.current.revenue}
          format={rm}
          delta={kpis.delta.revenue}
          tone="violet"
          icon="chart"
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
          label="Orders in flight"
          value={openOrders.length}
          format={(n) => num(Math.round(n))}
          footnote={`${rm(openValue)} of stock`}
          tone="cyan"
          icon="truck"
        />
        <StatTile
          label="Needs attention"
          value={alerts.length}
          format={(n) => num(Math.round(n))}
          footnote={urgent.length ? `${urgent.length} urgent` : 'nothing urgent'}
          tone="teal"
          icon="bell"
        />
      </div>
      )}

      {/* ── Trend + priority ──────────────────────────────────────────── */}
      {!executive && (
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <ChartFrame
          title="Group revenue"
          meta={`${rm(kpis.current.revenue)} over 30 days · previous period ${rm(kpis.previous.revenue)}`}
          height={250}
        >
          <TrendChart data={trend} format={rmCompact} label="Daily revenue" />
        </ChartFrame>

        <Panel className="flex flex-col">
          <PanelHeader
            eyebrow="Priority"
            title="What needs you first"
            action={
              <Badge tone={urgent.length ? 'critical' : 'good'} icon={urgent.length ? 'alert' : 'check'}>
                {urgent.length ? `${urgent.length} urgent` : 'All clear'}
              </Badge>
            }
          />
          <Rule />
          <PanelBody className="flex-1 space-y-2">
            {alerts.length === 0 ? (
              <EmptyState
                icon="check"
                title="Nothing outstanding"
                body="Every store has filed, stock is above its reorder points, and no order is stuck."
              />
            ) : (
              [...alerts]
                .sort((a, b) => {
                  const rank = { critical: 0, serious: 1, warn: 2 }
                  return rank[a.severity] - rank[b.severity]
                })
                .slice(0, 6)
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug text-ink">{a.message}</p>
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {locationById(a.locationId)?.shortName}
                      </p>
                    </div>
                    <SeverityBadge severity={a.severity} />
                  </div>
                ))
            )}
          </PanelBody>
        </Panel>
      </div>
      )}

      {/* ── The founder's short list ──────────────────────────────────── */}
      {executive && alerts.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Worth knowing"
            title={alerts.length === 1 ? 'One thing to flag' : `${alerts.length} things to flag`}
            meta="Missed closings, corrections waiting for approval, and months falling behind. Stock and order chasing sits with Kelly."
          />
          <Rule />
          <PanelBody className="space-y-2">
            {alerts.slice(0, 5).map((a) => (
              <Link
                key={a.id}
                to={`/stores/${a.locationId}`}
                className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-primary/35"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-ink">{a.message}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {locationById(a.locationId)?.shortName}
                  </p>
                </div>
                <SeverityBadge severity={a.severity} />
              </Link>
            ))}
          </PanelBody>
        </Panel>
      )}

      {/* ── Composition ───────────────────────────────────────────────── */}
      {!executive && (
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title="Revenue by channel"
          meta="Main stores, dealers and consignment"
          height={230}
          table={<DonutTable slices={channelSlices} format={rm} unitHeader="Revenue" />}
        >
          <div className="flex h-full items-center justify-center">
            <Donut
              slices={channelSlices}
              centreLabel="30-day revenue"
              centreValue={rmCompact(kpis.current.revenue)}
              format={rm}
              size={186}
            />
          </div>
        </ChartFrame>

        <ChartFrame
          title="Best sellers"
          meta="By revenue, coloured by collection"
          height={230}
          table={<SkuTable rows={skuRows.slice(0, 12)} />}
        >
          <SkuBars rows={skuRows.slice(0, 8)} />
        </ChartFrame>
      </div>
      )}

      {/* ── Country mix ───────────────────────────────────────────────── */}
      {!executive && (
      <ChartFrame
        title="Which countries bought"
        meta={`${num(kpis.current.attributedUnits)} units with a country recorded`}
        height={110}
        note="Recorded against every sale in the main stores. Dealers and consignment partners do not capture nationality, so they are not represented here."
        table={<OriginTable slices={mix} />}
      >
        <div className="flex h-full items-center">
          <div className="w-full">
            <OriginRibbon slices={mix} height={44} />
          </div>
        </div>
      </ChartFrame>
      )}

      {/* ── Main stores ───────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Main stores"
          title={`${mainRows.length} stores against target`}
          meta="The bar is month-to-date against the pace needed to hit the month."
          action={
            <Link to="/locations">
              <Button size="sm" variant="ghost" iconRight="chevronRight">
                All {tradingLocations.length} stores
              </Button>
            </Link>
          }
        />
        <Rule />
        <PanelBody>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mainRows.map((r, i) => (
              <li key={r.locationId}>
                <Link
                  to={`/stores/${r.locationId}`}
                  className="group block rounded-xl border border-line bg-surface-2 px-3.5 py-3 transition-all duration-200 hover:border-primary/45 hover:shadow-glass"
                >
                  <div className="flex items-start gap-2">
                    <span className="readout mt-0.5 w-4 shrink-0 text-[11px] text-ink-3">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-[13px] font-medium leading-tight text-ink">
                        <span className="truncate">{r.shortName}</span>
                        <Icon
                          name="chevronRight"
                          className="h-3 w-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        />
                      </p>
                      <p className="text-[11px] text-ink-3">{r.region}</p>
                    </div>
                    <Sparkline
                      data={selectLocationSparkline(data, r.locationId)}
                      width={64}
                      height={22}
                    />
                  </div>

                  <div className="mt-2.5 flex items-end justify-between gap-2">
                    <p className="readout text-[15px] font-semibold text-ink">{rm(r.revenue)}</p>
                    {!executive && (
                      <p
                        className={`readout text-[11.5px] font-semibold ${
                          (r.delta ?? 0) >= 0 ? 'text-good' : 'text-critical'
                        }`}
                      >
                        {r.delta === null
                          ? '—'
                          : `${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta).toFixed(1)}%`}
                      </p>
                    )}
                  </div>

                  {r.targetPace !== null && (
                    <>
                      <ProgressBar className="mt-2" value={r.targetPace} />
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10.5px] text-ink-3">
                          {rmCompact(r.monthToDate)} of {rmCompact(r.monthlyTarget ?? 0)}
                        </span>
                        <span className="readout text-[10.5px] text-ink-3">
                          {Math.round(r.targetPace * 100)}% pace
                        </span>
                      </div>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      {/* ── Supply ────────────────────────────────────────────────────── */}
      {!executive && (
      <Panel>
        <PanelHeader
          eyebrow="Supply"
          title={`${openOrders.length} orders in flight`}
          meta="Stock on its way back to the stores, and the desk each order is sitting on."
          action={
            <Link to="/orders">
              <Button size="sm" variant="ghost" iconRight="chevronRight">
                All orders
              </Button>
            </Link>
          }
        />
        <Rule />
        <PanelBody>
          {openOrders.length === 0 ? (
            <EmptyState icon="truck" title="Nothing in flight" body="Every top-up has landed." />
          ) : (
            <ul className="space-y-2">
              {openOrders.slice(0, 6).map((po) => (
                <li key={po.id}>
                  <Link
                    to={`/orders/${po.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-primary/35"
                  >
                    <span className="readout text-[12.5px] font-medium text-ink">{po.id}</span>
                    <span className="text-[11.5px] text-ink-2">
                      {locationById(po.locationId)?.shortName}
                    </span>
                    <span className="text-[11px] text-ink-3">
                      raised {relativeDay(po.createdAt.slice(0, 10), data.today)}
                    </span>
                    {po.priority === 'urgent' && <Badge tone="critical">Urgent</Badge>}
                    <span className="readout ml-auto text-[12px] text-ink">{rm(poValue(po))}</span>
                    <Badge tone="active" icon="clock">
                      {STATUS_OWNER[po.status] === '—'
                        ? STATUS_LABEL[po.status]
                        : `with ${STATUS_OWNER[po.status]}`}
                    </Badge>
                    <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
      )}

      {notFiled.length > 0 && capability.canEdit && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-ink">
            {notFiled.length} {notFiled.length === 1 ? 'store has' : 'stores have'} not filed for{' '}
            {formatDate(yesterday)}.{' '}
            <Link to="/closings" className="text-primary underline-offset-2 hover:underline">
              Open the closings monitor
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
