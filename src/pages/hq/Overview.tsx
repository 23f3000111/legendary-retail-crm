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
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuTable } from '../../components/charts/SkuBars'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { canOpen } from '../../components/layout/nav'
import {
  emptyFilter,
  latestCompleteMonth,
  partnersIn,
  partnersKeyed,
  poValue,
  selectClosingFor,
  selectKpis,
  selectLocationRows,
  selectLocationSparkline,
  selectMonthToDate,
  selectNotFiled,
  selectOriginMix,
  selectPartnerMonth,
  selectSkuPerformance,
  selectToday,
  type PartnerChannel,
} from '../../store/selectors'
import { locationById, MORNING_WATCHLIST, tradingLocations } from '../../data/locations'
import { isOpen, STATUS_LABEL, STATUS_OWNER } from '../../lib/po-machine'
import { addDays, formatDate, monthKey, monthLabel, relativeDay, shiftMonth, startOfMonth } from '../../lib/dates'
import { num, rm, rmCompact } from '../../lib/format'
import type { CrmData } from '../../data/types'

/**
 * The leadership screen — Davy's, Kelly's and Chloe's, and the founder's.
 *
 * The client's fifth revision (October) trimmed it to what they read every
 * day: today's takings as they come in, units for the month, how the dealers
 * and the main stores split the money, the best sellers, where customers come
 * from, and who is selling — main stores today, dealers and consignment by
 * their latest full month, since those report monthly.
 *
 * **The founder keeps his shorter version.** Vins asked for his own screen to
 * lose the charts: the three stores checked first, anything genuinely his to
 * worry about, and how the stores track against target. He sees everything
 * and edits nothing, so a screen full of operational detail was work he never
 * had to do. Every chart is still on Analytics.
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

/** The chart palette has six hues; past six, the rest fold into one "Other" slice. */
const toSlices = (rows: { key: string; label: string; value: number }[], other: (n: number) => string): DonutSlice[] => {
  const positive = rows.filter((r) => r.value > 0)
  const head = positive.slice(0, 6)
  const tail = positive.slice(6)
  return [
    ...head,
    ...(tail.length ? [{ key: 'OTHER', label: other(tail.length), value: tail.reduce((a, r) => a + r.value, 0) }] : []),
  ]
}

export function Overview() {
  const data = useData()
  const user = useCurrentUser()
  // A tile opens the screen behind its number — but only one this role may
  // open, since a link that bounces is worse than no link.
  const open = (path: string) => (user && canOpen(user.role, path) ? path : undefined)
  const capability = useCan()
  const executive = user?.role === 'director'
  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])

  const kpis = useMemo(() => selectKpis(data, filter), [data, filter])
  const mix = useMemo(() => selectOriginMix(data, filter), [data, filter])
  const rows = useMemo(() => selectLocationRows(data, filter), [data, filter])
  const skuRows = useMemo(() => selectSkuPerformance(data, filter), [data, filter])
  const today = useMemo(() => selectToday(data), [data])
  const monthToDate = useMemo(() => selectMonthToDate(data), [data])

  const yesterday = addDays(data.today, -1)
  const notFiled = selectNotFiled(data, yesterday)
  const alerts = data.alerts
    .filter((a) => !a.read)
    .filter((a) => !executive || FOUNDER_ALERTS.includes(a.type))
  const openOrders = data.purchaseOrders.filter(isOpen)

  // Davy's morning three (Q71) — now on the founder's screen only.
  const watchlist = MORNING_WATCHLIST.map((id) => {
    const loc = locationById(id)
    const closing = selectClosingFor(data, id, yesterday)
    return { loc, revenue: closing?.revenueMYR ?? null, filed: Boolean(closing) }
  }).filter((w) => w.loc)

  const mainRows = rows.filter((r) => r.channel === 'main')

  // ── The two splits ──────────────────────────────────────────────────────
  const dealerMonth = useMemo(() => latestCompleteMonth(data, 'dealer'), [data])
  const dealerRows = useMemo(
    () => (dealerMonth ? selectPartnerMonth(data, 'dealer', dealerMonth) : []),
    [data, dealerMonth],
  )
  const dealerSlices = toSlices(
    dealerRows.map((r) => ({ key: r.locationId, label: r.shortName, value: r.revenue })),
    (n) => `${n} other dealers`,
  )
  const dealerTotal = dealerRows.reduce((a, r) => a + r.revenue, 0)
  const lastMonth = shiftMonth(monthKey(data.today), -1)

  const mainMtd = useMemo(() => {
    const byStore = new Map(monthToDate.byStore.map((s) => [s.locationId, s]))
    return tradingLocations
      .filter((l) => l.channel === 'main')
      .map((l) => ({ key: l.id, label: l.shortName, value: byStore.get(l.id)?.revenue ?? 0 }))
      .sort((a, b) => b.value - a.value)
  }, [monthToDate])
  const mainMtdTotal = mainMtd.reduce((a, r) => a + r.value, 0)

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
              : `${tradingLocations.length} stores · ${formatDate(data.today)}`}
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

      {/* ── The founder's morning three ───────────────────────────────── */}
      {executive && (
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
                    <Sparkline data={selectLocationSparkline(data, w.loc!.id)} width={140} height={26} />
                  </Link>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {/* ── Headline: today, and the month ────────────────────────────── */}
      {!executive && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatTile
            label="Revenue · today"
            to={open('/analytics')}
            value={today.revenue}
            format={rm}
            footnote={
              today.customers
                ? `so far · ${num(today.customers)} ${today.customers === 1 ? 'customer' : 'customers'}, live`
                : 'nothing rung up yet today'
            }
            tone="violet"
            icon="chart"
          />
          <StatTile
            label="Units sold · month to date"
            to={open('/analytics')}
            value={monthToDate.units}
            format={(n) => num(Math.round(n))}
            footnote={`since ${formatDate(startOfMonth(data.today))}`}
            tone="blue"
            icon="box"
          />
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
                  <p className="mt-0.5 text-[11px] text-ink-3">{locationById(a.locationId)?.shortName}</p>
                </div>
                <SeverityBadge severity={a.severity} />
              </Link>
            ))}
          </PanelBody>
        </Panel>
      )}

      {/* ── How the money splits: dealers, and the main stores ────────── */}
      {!executive && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame
            title={dealerMonth ? `Dealers · ${monthLabel(dealerMonth)}` : 'Dealers'}
            meta={
              dealerMonth
                ? dealerMonth === lastMonth
                  ? 'Last month, with every dealer keyed in.'
                  : `The latest month with every dealer keyed in — ${monthLabel(lastMonth)} is not complete yet.`
                : 'Shown once a month has every dealer keyed in.'
            }
            height={230}
            grow
            table={
              dealerMonth ? (
                <DonutTable
                  slices={dealerRows.map((r) => ({ key: r.locationId, label: r.shortName, value: r.revenue }))}
                  format={rm}
                  unitHeader="Revenue"
                />
              ) : undefined
            }
          >
            {dealerMonth ? (
              <div className="flex h-full items-center justify-center">
                <Donut
                  slices={dealerSlices}
                  centreLabel={monthLabel(dealerMonth)}
                  centreValue={rmCompact(dealerTotal)}
                  format={rm}
                  size={186}
                />
              </div>
            ) : (
              <WaitingForMonth data={data} channel="dealer" month={lastMonth} canKey={Boolean(open('/partners'))} />
            )}
          </ChartFrame>

          <ChartFrame
            title="Main stores · month to date"
            meta={`${formatDate(startOfMonth(data.today))} to today, with today's sales as they stand.`}
            height={230}
            grow
            table={<DonutTable slices={mainMtd} format={rm} unitHeader="Revenue" />}
          >
            <div className="flex h-full items-center justify-center">
              <Donut
                slices={toSlices(mainMtd, (n) => `${n} other stores`)}
                centreLabel="month to date"
                centreValue={rmCompact(mainMtdTotal)}
                format={rm}
                size={186}
              />
            </div>
          </ChartFrame>
        </div>
      )}

      {!executive && (
        <ChartFrame
          title="Best sellers"
          meta="By revenue over the last 30 days, coloured by collection"
          height={230}
          table={<SkuTable rows={skuRows.slice(0, 12)} />}
        >
          <SkuBars rows={skuRows.slice(0, 8)} />
        </ChartFrame>
      )}

      {/* ── Country mix ───────────────────────────────────────────────── */}
      {!executive && (
        <ChartFrame
          title="Which countries bought"
          meta={`${num(kpis.current.attributedUnits)} units with a country recorded, last 30 days`}
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

      {/* ── Who is selling ────────────────────────────────────────────── */}
      {!executive ? (
        <Panel>
          <PanelHeader
            eyebrow="Sales"
            title="Who is selling"
            meta="Main stores today, live. Consignment and dealers by their latest full month — they report monthly."
            action={
              <Link to="/locations">
                <Button size="sm" variant="ghost" iconRight="chevronRight">
                  All {tradingLocations.length} stores
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody className="space-y-6">
            <Ranking
              title="Main stores · today so far"
              rows={tradingLocations
                .filter((l) => l.channel === 'main')
                .map((l) => {
                  const s = today.byStore.find((x) => x.locationId === l.id)
                  return {
                    locationId: l.id,
                    name: l.shortName,
                    place: l.region,
                    revenue: s?.revenue ?? 0,
                    detail: s
                      ? `${num(s.units)} ${s.units === 1 ? 'unit' : 'units'} · ${num(s.customers)} ${s.customers === 1 ? 'customer' : 'customers'}`
                      : 'nothing yet today',
                  }
                })}
            />
            <PartnerRanking data={data} channel="consignment" canKey={Boolean(open('/partners'))} />
            <PartnerRanking data={data} channel="dealer" canKey={Boolean(open('/partners'))} />
          </PanelBody>
        </Panel>
      ) : (
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
                      <span className="readout mt-0.5 w-4 shrink-0 text-[11px] text-ink-3">{i + 1}</span>
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
                      <Sparkline data={selectLocationSparkline(data, r.locationId)} width={64} height={22} />
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-2">
                      <p className="readout text-[15px] font-semibold text-ink">{rm(r.revenue)}</p>
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
      )}

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
                      <span className="text-[11.5px] text-ink-2">{locationById(po.locationId)?.shortName}</span>
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

// ── Pieces ──────────────────────────────────────────────────────────────────

const CHANNEL_WORD: Record<PartnerChannel, { one: string; many: string }> = {
  dealer: { one: 'dealer', many: 'dealers' },
  consignment: { one: 'consignment partner', many: 'consignment partners' },
}

/** Until a month is complete, say how far the keying-in has got, and where to finish it. */
function WaitingForMonth({
  data,
  channel,
  month,
  canKey,
}: {
  data: CrmData
  channel: PartnerChannel
  month: string
  canKey: boolean
}) {
  const total = partnersIn(channel).length
  const done = partnersKeyed(data, channel, month)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 text-center">
      <p className="text-[13px] font-medium text-ink">
        {done} of {total} {CHANNEL_WORD[channel].many} keyed in for {monthLabel(month)}
      </p>
      <p className="max-w-[340px] text-[12px] text-ink-3">
        A month shows once every {CHANNEL_WORD[channel].one} has a figure — 0 counts, for one that sold nothing.
      </p>
      {canKey && (
        <Link to="/partners" className="mt-1 text-[12.5px] font-medium text-primary hover:underline">
          Key in {monthLabel(month)}
        </Link>
      )}
    </div>
  )
}

/** Dealers or consignment, best first, for their latest complete month. */
function PartnerRanking({ data, channel, canKey }: { data: CrmData; channel: PartnerChannel; canKey: boolean }) {
  const month = latestCompleteMonth(data, channel)
  const label = channel === 'dealer' ? 'Dealers' : 'Consignment'
  if (!month) {
    return (
      <div>
        <p className="eyebrow mb-2">{label}</p>
        <div className="h-[120px]">
          <WaitingForMonth
            data={data}
            channel={channel}
            month={shiftMonth(monthKey(data.today), -1)}
            canKey={canKey}
          />
        </div>
      </div>
    )
  }
  return (
    <Ranking
      title={`${label} · ${monthLabel(month)}`}
      rows={selectPartnerMonth(data, channel, month).map((r) => ({
        locationId: r.locationId,
        name: r.shortName,
        place: channel === 'dealer' ? 'Dealer' : 'Consignment',
        revenue: r.revenue,
        detail: r.keyed ? `keyed in by ${r.keyed.enteredBy}` : 'from its closings',
      }))}
    />
  )
}

/** A top-nine league: rank, name, figure. Each card opens the outlet. */
function Ranking({
  title,
  rows,
}: {
  title: string
  rows: { locationId: string; name: string; place: string; revenue: number; detail: string }[]
}) {
  const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 9)
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {top.map((r, i) => (
          <li key={r.locationId}>
            {/* A card from sm up; on a phone, one row with the figure on the
                right, so three leagues of nine are not a scroll of 27 cards. */}
            <Link
              to={`/stores/${r.locationId}`}
              className="group flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 transition-all duration-200 hover:border-primary/45 hover:shadow-glass sm:block"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="readout mt-0.5 w-4 shrink-0 text-[11px] text-ink-3">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[13px] font-medium leading-tight text-ink">
                    <span className="truncate">{r.name}</span>
                    <Icon
                      name="chevronRight"
                      className="h-3 w-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </p>
                  <p className="text-[11px] text-ink-3">{r.place}</p>
                </div>
              </div>
              <div className="max-w-[55%] shrink-0 text-right sm:mt-2 sm:max-w-none sm:text-left">
                <p className="readout text-[15px] font-semibold leading-tight text-ink">{rm(r.revenue)}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-3">{r.detail}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
