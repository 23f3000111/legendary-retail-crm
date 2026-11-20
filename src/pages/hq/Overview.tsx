import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, LiveDot, SeverityBadge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { ProgressBar } from '../../components/ui/Progress'
import { Icon } from '../../components/ui/icons'
import { LinkIf } from '../../components/ui/LinkIf'
import { PAGE, usePaged } from '../../components/ui/LoadMore'
import { SalesBoxes } from '../../components/SalesBoxes'
import { SalesCalendar } from '../../components/SalesCalendar'
import { CountryDetailModal } from '../../components/CountryDetail'
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
  latestPartnerMonth,
  partnersIn,
  partnersKeyed,
  poValue,
  selectClosingFor,
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
 * Dealers and consignment show as soon as any of them is keyed in, with how
 * many are in so far, and consignment has its own chart beside the dealers
 * and the main stores, above the best sellers (16 November).
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
  // Davy, Kelly and Chloe share this page but not their screens, so a link to
  // another screen is shown only to whoever may open it. The route guard sends
  // anybody else home, and a link that bounces is worse than no link.
  const open = (path: string) => (user && canOpen(user.role, path) ? path : undefined)
  const capability = useCan()
  const executive = user?.role === 'director'
  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  /** A country opened from "Which countries bought". */
  const [country, setCountry] = useState<string | null>(null)

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

  // ── The three splits: dealers, main stores, consignment ─────────────────

  const mainMtd = useMemo(() => {
    const byStore = new Map(monthToDate.byStore.map((s) => [s.locationId, s]))
    return tradingLocations
      .filter((l) => l.channel === 'main')
      .map((l) => ({ key: l.id, label: l.shortName, value: byStore.get(l.id)?.revenue ?? 0 }))
      .sort((a, b) => b.value - a.value)
  }, [monthToDate])
  const mainMtdTotal = mainMtd.reduce((a, r) => a + r.value, 0)
  /** Every store named on this page opens its own (asked on 1 November). */
  const storePage = (id: string) => `/stores/${id}`

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
          {open('/analytics') && (
            <Link to="/analytics">
              <Button variant="secondary" icon="chart">
                Analytics
              </Button>
            </Link>
          )}
          <Button variant="primary" icon="printer" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* ── The four boxes (client, 1 November) ──────────────────────────── */}
      <SalesBoxes />

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
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <PartnerSplit data={data} channel="dealer" storePage={storePage} canKey={Boolean(open('/partners'))} />

          <ChartFrame
            title="Main stores · month to date"
            meta={`${formatDate(startOfMonth(data.today))} to today, with today's sales as they stand. Tap a store to open it.`}
            height={230}
            grow
            table={<DonutTable slices={mainMtd} format={rm} unitHeader="Revenue" href={storePage} />}
          >
            <div className="flex h-full items-center justify-center">
              <Donut
                slices={toSlices(mainMtd, (n) => `${n} other stores`)}
                centreLabel="month to date"
                centreValue={rmCompact(mainMtdTotal)}
                format={rm}
                size={186}
                href={storePage}
              />
            </div>
          </ChartFrame>

          {/* Consignment beside the dealers and main stores, above the best sellers (16 November). */}
          <PartnerSplit data={data} channel="consignment" storePage={storePage} canKey={Boolean(open('/partners'))} />
        </div>
      )}

      {!executive && (
        <ChartFrame
          title="Best sellers"
          meta="The top 12 by revenue over the last 30 days. The chart colours them by collection."
          height={230}
          table={<SkuTable rows={skuRows.slice(0, 12)} totalLabel={skuRows.length > 12 ? 'Top 12 total' : 'Total'} />}
        >
          <SkuBars rows={skuRows.slice(0, 8)} />
        </ChartFrame>
      )}

      {/* ── Country mix ───────────────────────────────────────────────── */}
      {!executive && (
        <ChartFrame
          title="Which countries bought"
          meta={`${num(mix.reduce((a, s) => a + s.customers, 0))} customers with a country recorded, last 30 days. Tap a country to open it.`}
          height={110}
          note="Counted by customer: one sale is one customer, however much they bought. Recorded against every sale in the main stores; dealers and consignment partners do not capture nationality."
          table={<OriginTable slices={mix} onSelect={setCountry} />}
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
            meta="Main stores today, live. Consignment and dealers by their latest month, as far as it has been keyed in — they report monthly."
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
              // Every main store at once (16 November: "All my stores").
              all
              rows={tradingLocations
                .filter((l) => l.channel === 'main')
                .map((l) => {
                  const s = today.byStore.find((x) => x.locationId === l.id)
                  // Yesterday's closing, on top of the box (client, 1 November).
                  // A store that has never filed has not started, so it is not
                  // missing a day — Sogo 118 the week it opened (Revision 10).
                  const filed = selectClosingFor(data, l.id, yesterday)
                  return {
                    locationId: l.id,
                    name: l.shortName,
                    place: l.region,
                    revenue: s?.revenue ?? 0,
                    above: filed
                      ? { label: `Yesterday · ${rm(filed.revenueMYR)}`, warn: false }
                      : notFiled.includes(l.id)
                        ? { label: 'Yesterday · not filed', warn: true }
                        : { label: 'Yesterday · nothing filed yet', warn: false },
                    tiebreak: filed?.revenueMYR ?? 0,
                    detail: s
                      ? `Today · ${num(s.units)} ${s.units === 1 ? 'unit' : 'units'} · ${num(s.customers)} ${s.customers === 1 ? 'customer' : 'customers'}`
                      : 'Today · nothing yet',
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

      {/* ── The calendar (client, 1 November) ───────────────────────────── */}
      {/* The sales report came off this page (asked on 1 November, after
          Revision 9). It is on Stores and Analytics, which the founder opens too. */}
      <SalesCalendar />

      {/* ── Supply ────────────────────────────────────────────────────── */}
      {!executive && (
        <Panel>
          <PanelHeader
            eyebrow="Supply"
            title={`${openOrders.length} ${openOrders.length === 1 ? 'order' : 'orders'} in flight`}
            meta="Stock on its way back to the stores, and the desk each order is sitting on."
            action={
              open('/orders') ? (
                <Link to="/orders">
                  <Button size="sm" variant="ghost" iconRight="chevronRight">
                    All orders
                  </Button>
                </Link>
              ) : undefined
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
                    <LinkIf
                      to={open(`/orders/${po.id}`)}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                      linkClassName="transition-colors hover:border-primary/35"
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
                      {open(`/orders/${po.id}`) && (
                        <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                      )}
                    </LinkIf>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      )}

      {country && (
        <CountryDetailModal
          countryCode={country}
          filter={filter}
          when="Last 30 days"
          onClose={() => setCountry(null)}
        />
      )}

      {notFiled.length > 0 && capability.canEdit && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-ink">
            {notFiled.length} {notFiled.length === 1 ? 'store has' : 'stores have'} not filed for{' '}
            {formatDate(yesterday)}.{' '}
            {open('/closings') && (
              <Link to="/closings" className="text-primary underline-offset-2 hover:underline">
                Open the closings monitor
              </Link>
            )}
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

/**
 * A channel's latest month on the overview, shown as soon as any partner of
 * the kind is keyed in (16 November): the partners keyed in so far, best
 * first, with how many that is; a waiting card until there are any.
 */
function PartnerSplit({
  data,
  channel,
  storePage,
  canKey,
}: {
  data: CrmData
  channel: PartnerChannel
  storePage: (id: string) => string
  canKey: boolean
}) {
  const month = latestPartnerMonth(data, channel)
  const rows = month ? selectPartnerMonth(data, channel, month).filter((r) => r.has) : []
  const total = partnersIn(channel).length
  const word = CHANNEL_WORD[channel]
  const title = channel === 'dealer' ? 'Dealers' : 'Consignment'
  const slices = rows.map((r) => ({ key: r.locationId, label: r.shortName, value: r.revenue }))
  const sum = rows.reduce((a, r) => a + r.revenue, 0)
  return (
    <ChartFrame
      title={month ? `${title} · ${monthLabel(month)}` : title}
      meta={
        month ? (
          <>
            {rows.length === total
              ? `Every ${word.one} keyed in for ${monthLabel(month)}.`
              : `${rows.length} of ${total} ${word.many} keyed in for ${monthLabel(month)}.`}
            {canKey && rows.length < total && (
              <>
                {' '}
                <Link to="/partners" className="text-primary hover:underline">
                  Key in the rest
                </Link>
              </>
            )}
          </>
        ) : (
          `Shown as soon as a ${word.one} is keyed in.`
        )
      }
      height={230}
      grow
      table={
        month ? (
          <DonutTable slices={slices} format={rm} unitHeader="Revenue" href={storePage} page={PAGE} />
        ) : undefined
      }
    >
      {month ? (
        <div className="flex h-full items-center justify-center">
          <Donut
            slices={toSlices(slices, (n) => `${n} other ${word.many}`)}
            centreLabel={monthLabel(month)}
            centreValue={rmCompact(sum)}
            format={rm}
            size={186}
            href={storePage}
          />
        </div>
      ) : (
        <WaitingForMonth data={data} channel={channel} month={shiftMonth(monthKey(data.today), -1)} canKey={canKey} />
      )}
    </ChartFrame>
  )
}

/** Until a month has a figure, say how far the keying-in has got, and where to start it. */
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
        A month shows as soon as a {CHANNEL_WORD[channel].one} has a figure — 0 counts, for one that sold nothing.
      </p>
      {canKey && (
        <Link to="/partners" className="mt-1 text-[12.5px] font-medium text-primary hover:underline">
          Key in {monthLabel(month)}
        </Link>
      )}
    </div>
  )
}

/** Dealers or consignment, best first, for their latest month: those keyed in so far. */
function PartnerRanking({ data, channel, canKey }: { data: CrmData; channel: PartnerChannel; canKey: boolean }) {
  const month = latestPartnerMonth(data, channel)
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
  const keyedIn = selectPartnerMonth(data, channel, month).filter((r) => r.has)
  const total = partnersIn(channel).length
  return (
    <Ranking
      title={`${label} · ${monthLabel(month)}${keyedIn.length < total ? ` · ${keyedIn.length} of ${total} keyed in` : ''}`}
      rows={keyedIn.map((r) => ({
        locationId: r.locationId,
        name: r.shortName,
        place: channel === 'dealer' ? 'Dealer' : 'Consignment',
        revenue: r.revenue,
        detail: r.keyed ? `keyed in by ${r.keyed.enteredBy}` : 'from its closings',
      }))}
    />
  )
}

/** A league: rank, name, figure, ten at a time unless `all`. Each card opens the outlet. */
function Ranking({
  title,
  rows,
  all = false,
}: {
  title: string
  all?: boolean
  rows: {
    locationId: string
    name: string
    place: string
    revenue: number
    detail: string
    /** A line on top of the box: yesterday's closing, for the main stores. */
    above?: { label: string; warn: boolean }
    /** What decides the order when two figures are the same. */
    tiebreak?: number
  }[]
}) {
  const ranked = [...rows].sort((a, b) => b.revenue - a.revenue || (b.tiebreak ?? 0) - (a.tiebreak ?? 0))
  const { visible, more } = usePaged(ranked, { page: all ? undefined : PAGE })
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((r, i) => (
          <li key={r.locationId}>
            {/* A card from sm up; on a phone, one row with the figure on the
                right, so three leagues of ten are not a scroll of 30 cards. */}
            <Link
              to={`/stores/${r.locationId}`}
              className="group flex flex-wrap items-start gap-x-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 transition-all duration-200 hover:border-primary/45 hover:shadow-glass sm:block"
            >
              {r.above && (
                <p
                  className={`readout mb-1.5 basis-full text-[11px] font-semibold ${r.above.warn ? 'text-warn' : 'text-ink-2'}`}
                >
                  {r.above.label}
                </p>
              )}
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
      {more}
    </div>
  )
}
