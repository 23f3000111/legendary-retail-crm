import { useMemo, useState, type ReactNode } from 'react'
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
import { StoreSalesModal, datesChoice, monthChoice, windowChoices, type StorePeriodChoice } from '../../components/StoreSales'
import { OutletOrderControl } from '../../components/OutletOrderControl'
import { FromTo } from '../../components/FromTo'
import { useOutletSort, type OutletSort } from '../../store/useOutletOrder'
import { useViews } from '../../store/useViews'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuTable } from '../../components/charts/SkuBars'
import { Sparkline } from '../../components/charts/Sparkline'
import { SERIES } from '../../components/charts/palette'
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
  selectPartnerPeriod,
  selectSkuPerformance,
  selectStoreTotals,
  selectToday,
  type PartnerChannel,
} from '../../store/selectors'
import { CHANNELS, locationById, MORNING_WATCHLIST, tradingLocations, type Channel } from '../../data/locations'
import { isOpen, STATUS_LABEL, STATUS_OWNER } from '../../lib/po-machine'
import { addDays, formatDate, monthKey, monthLabel, relativeDay, shiftMonth, spanLabel, startOfMonth } from '../../lib/dates'
import { restoreDates } from '../../lib/views'
import { MONTH_RULE } from '../../lib/words'
import { num, rm, rmCompact } from '../../lib/format'
import type { CrmData, DateStr } from '../../data/types'

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
 *
 * **A store opens in a pop-up first** (20 November: "it's ideal to have
 * pop-up everywhere with detailed details"): its figures for the window the
 * card or chart shows, and what is behind them, then Open full detail.
 *
 * **23 November.** Under the sales come who is selling, each kind of outlet
 * in its own colour, then the calendar; which countries bought goes below the
 * calendar and the best sellers below that.
 *
 * **22 November.** Consignment sits on the left and the dealers on the right,
 * as on Revenue and everywhere else, and both open on their figures. A From
 * and To under the greeting takes consignment, the main stores, the dealers,
 * the best sellers and the countries to those dates; the four boxes, who is
 * selling today and the calendar stay as they are. Partners count a month
 * when its 1st is in the dates.
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

/**
 * The ring draws as many slices as the palette has colours, so each matches
 * its row in the figures (22 November: "make sure they all have different
 * colour boxes"); past twelve, the rest fold into one "Other" slice.
 */
const toSlices = (rows: { key: string; label: string; value: number }[], other: (n: number) => string): DonutSlice[] => {
  const positive = rows.filter((r) => r.value > 0)
  const head = positive.slice(0, SERIES.length)
  const tail = positive.slice(SERIES.length)
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
  /**
   * The dates chosen under the greeting (22 November: "Add the date filter"),
   * kept for when you come back; none until chosen, and the page is as before.
   */
  const keep = useViews((s) => s.keep)
  const [dates, setDatesState] = useState<{ from: DateStr; to: DateStr } | null>(() =>
    restoreDates(useViews.getState().overview?.dates, data.today),
  )
  const setDates = (d: { from: DateStr; to: DateStr } | null) => {
    setDatesState(d)
    keep('overview', { dates: d })
  }
  const datesWords = dates ? spanLabel(dates) : ''
  const filter = useMemo(
    () => (dates ? emptyFilter(dates.from, dates.to) : emptyFilter(addDays(data.today, -29), data.today)),
    [data.today, dates],
  )
  /** A country opened from "Which countries bought". */
  const [country, setCountry] = useState<string | null>(null)
  /** A store opened from a card or a chart, on the days that showed it. */
  const [opened, setOpened] = useState<{
    id: string
    periods: StorePeriodChoice[]
    initial?: string
    countryCodes?: string[]
  } | null>(null)
  const openStore = (id: string, initial: string) => setOpened({ id, periods: windowChoices(data.today), initial })
  /** Who is selling: highest first, or the person's own order (20 November). */
  const order = useOutletSort('overview-selling', 'value')
  // A partner opens on the month shown, or on the dates chosen.
  const openPartner = (id: string, month?: string) =>
    setOpened({ id, periods: [month ? monthChoice(month, data.today) : datesChoice(filter.from, filter.to)] })
  // A main store from the split opens on the month so far, or on the dates chosen.
  const openMain = (id: string) => (dates ? setOpened({ id, periods: [datesChoice(dates.from, dates.to)] }) : openStore(id, 'monthToDate'))

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

  // ── The three splits: consignment, main stores, dealers ─────────────────

  const mainMtd = useMemo(() => {
    if (dates) {
      return selectStoreTotals(data, { ...emptyFilter(dates.from, dates.to), channels: ['main'] }).map((s) => ({
        key: s.locationId,
        label: locationById(s.locationId)?.shortName ?? s.locationId,
        value: s.revenue,
      }))
    }
    const byStore = new Map(monthToDate.byStore.map((s) => [s.locationId, s]))
    return tradingLocations
      .filter((l) => l.channel === 'main')
      .map((l) => ({ key: l.id, label: l.shortName, value: byStore.get(l.id)?.revenue ?? 0 }))
      .sort((a, b) => b.value - a.value)
  }, [data, dates, monthToDate])
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
          {/* From and To (22 November). The founder's version has none of the
              sections they drive, so it has none. */}
          {!executive && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <FromTo
                from={dates?.from ?? ''}
                to={dates?.to ?? ''}
                today={data.today}
                onChange={(from, to) => setDates({ from, to })}
                label="Overview"
              />
              {dates ? (
                <Button size="sm" variant="secondary" icon="x" onClick={() => setDates(null)} className="mb-0.5">
                  Clear dates
                </Button>
              ) : (
                <p className="mb-1 max-w-[300px] text-[11.5px] leading-snug text-ink-3">
                  Choose dates for consignment, the main stores, dealers, best sellers and countries.
                </p>
              )}
            </div>
          )}
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
                  <button
                    type="button"
                    onClick={() => openStore(w.loc!.id, 'yesterday')}
                    className="group block w-full rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-left transition-all duration-200 hover:border-primary/45 hover:shadow-glass"
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
                  </button>
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

      {/* ── How the money splits: consignment, the main stores, dealers ── */}
      {/* Consignment on the left and the dealers on the right, as on Revenue
          and across the CRM (22 November). */}
      {!executive && (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <PartnerSplit data={data} channel="consignment" dates={dates} onOpen={openPartner} canKey={Boolean(open('/partners'))} />

          <ChartFrame
            title={dates ? `Main stores · ${datesWords}` : 'Main stores · month to date'}
            meta={
              dates
                ? `${datesWords}${dates.to === data.today ? ", with today's sales as they stand" : ''}. Tap a store to open it.`
                : `${formatDate(startOfMonth(data.today))} to today, with today's sales as they stand. Tap a store to open it.`
            }
            height={230}
            grow
            table={<DonutTable slices={mainMtd} format={rm} unitHeader="Revenue" onSelect={openMain} />}
          >
            <div className="flex h-full items-center justify-center">
              <Donut
                slices={toSlices(mainMtd, (n) => `${n} other stores`)}
                centreLabel={dates ? 'the dates' : 'month to date'}
                centreValue={rmCompact(mainMtdTotal)}
                format={rm}
                size={186}
                onSelect={openMain}
              />
            </div>
          </ChartFrame>

          <PartnerSplit data={data} channel="dealer" dates={dates} onOpen={openPartner} canKey={Boolean(open('/partners'))} />
        </div>
      )}

      {/* ── Who is selling, straight under the sales (23 November) ─────── */}
      {!executive ? (
        <Panel>
          <PanelHeader
            eyebrow="Sales"
            title="Who is selling"
            meta="Main stores today, live. Consignment and dealers by their latest month, as far as it has been keyed in — they report monthly."
            action={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <OutletOrderControl sort={order} channels={CHANNELS} />
                <Link to="/locations">
                  <Button size="sm" variant="ghost" iconRight="chevronRight">
                    All {tradingLocations.length} stores
                  </Button>
                </Link>
              </div>
            }
          />
          <Rule />
          <PanelBody className="space-y-6">
            <Ranking
              channel="main"
              title="Main stores · today so far"
              // Every main store at once (16 November: "All my stores").
              all
              order={order}
              onOpen={(id) => openStore(id, 'today')}
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
            <PartnerRanking data={data} channel="consignment" canKey={Boolean(open('/partners'))} onOpen={openPartner} order={order} />
            <PartnerRanking data={data} channel="dealer" canKey={Boolean(open('/partners'))} onOpen={openPartner} order={order} />
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
                  <button
                    type="button"
                    onClick={() => openStore(r.locationId, 'monthToDate')}
                    className="group block w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-left transition-all duration-200 hover:border-primary/45 hover:shadow-glass"
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
                  </button>
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

      {/* ── Which countries bought, below the calendar (23 November) ───── */}
      {!executive && (
        <ChartFrame
          title="Which countries bought"
          meta={`${num(mix.reduce((a, s) => a + s.customers, 0))} customers with a country recorded, ${dates ? datesWords : 'last 30 days'}. Tap a country to open it.`}
          height={110}
          note="Counted by customer: one sale is one customer, however much they bought. Recorded against every sale in the main stores; consignment partners and dealers do not capture nationality."
          table={<OriginTable slices={mix} onSelect={setCountry} />}
        >
          <div className="flex h-full items-center">
            <div className="w-full">
              <OriginRibbon slices={mix} height={44} />
            </div>
          </div>
        </ChartFrame>
      )}

      {/* ── Best sellers, further down (23 November) ─────────────────── */}
      {!executive && (
        <ChartFrame
          title="Best sellers"
          meta={`The top 12 by revenue, ${dates ? datesWords : 'over the last 30 days'}. The chart colours them by collection.`}
          height={230}
          table={<SkuTable rows={skuRows.slice(0, 12)} totalLabel={skuRows.length > 12 ? 'Top 12 total' : 'Total'} />}
        >
          <SkuBars rows={skuRows.slice(0, 8)} />
        </ChartFrame>
      )}

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
          when={dates ? datesWords : 'Last 30 days'}
          onClose={() => setCountry(null)}
          onStore={(id) => {
            setCountry(null)
            setOpened({
              id,
              periods: [dates ? datesChoice(filter.from, filter.to) : { ...datesChoice(filter.from, filter.to), label: 'Last 30 days' }],
              countryCodes: [country],
            })
          }}
        />
      )}

      {opened && (
        <StoreSalesModal
          locationId={opened.id}
          periods={opened.periods}
          initial={opened.initial}
          base={opened.countryCodes ? { countryCodes: opened.countryCodes } : undefined}
          onClose={() => setOpened(null)}
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
 * first, with how many that is; a waiting card until there are any. With
 * dates chosen (22 November), its months whose 1st is in them instead.
 */
function PartnerSplit({
  data,
  channel,
  dates,
  onOpen,
  canKey,
}: {
  data: CrmData
  channel: PartnerChannel
  dates: { from: DateStr; to: DateStr } | null
  /** A partner tapped: its pop-up, for the month shown, or for the dates (no month). */
  onOpen: (id: string, month?: string) => void
  canKey: boolean
}) {
  if (dates) return <PartnerDates data={data} channel={channel} dates={dates} onOpen={(id) => onOpen(id)} />
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
          <DonutTable slices={slices} format={rm} unitHeader="Revenue" onSelect={(id) => onOpen(id, month)} page={PAGE} />
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
            onSelect={(id) => onOpen(id, month)}
          />
        </div>
      ) : (
        <WaitingForMonth data={data} channel={channel} month={shiftMonth(monthKey(data.today), -1)} canKey={canKey} />
      )}
    </ChartFrame>
  )
}

/**
 * A channel over the dates chosen on the Overview: each partner's months whose
 * 1st is in them, highest first, as on Revenue. Dates holding no 1st say so.
 */
function PartnerDates({
  data,
  channel,
  dates,
  onOpen,
}: {
  data: CrmData
  channel: PartnerChannel
  dates: { from: DateStr; to: DateStr }
  onOpen: (id: string) => void
}) {
  const p = selectPartnerPeriod(data, channel, dates.from, dates.to)
  const word = CHANNEL_WORD[channel]
  const title = channel === 'dealer' ? 'Dealers' : 'Consignment'
  const many = word.many[0].toUpperCase() + word.many.slice(1)
  const months = !p.months.length
    ? null
    : p.months.length === 1
      ? monthLabel(p.months[0])
      : `${monthLabel(p.months[0])} to ${monthLabel(p.months[p.months.length - 1])}`
  const slices = p.rows
    .filter((r) => r.months.length > 0)
    .map((r) => ({ key: r.locationId, label: locationById(r.locationId)?.shortName ?? r.locationId, value: r.revenue }))
  return (
    <ChartFrame
      title={`${title} · ${spanLabel(dates)}`}
      meta={
        months
          ? `${p.withFigure} of ${partnersIn(channel).length} ${word.many} with a figure for ${months}. ${MONTH_RULE}`
          : `${many} report once a month, and no month begins within these dates.`
      }
      height={230}
      grow
      table={slices.length ? <DonutTable slices={slices} format={rm} unitHeader="Revenue" onSelect={onOpen} page={PAGE} /> : undefined}
    >
      {slices.length ? (
        <div className="flex h-full items-center justify-center">
          <Donut
            slices={toSlices(slices, (n) => `${n} other ${word.many}`)}
            centreLabel="the dates"
            centreValue={rmCompact(p.total)}
            format={rm}
            size={186}
            onSelect={onOpen}
          />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 text-center">
          <p className="text-[13px] font-medium text-ink">
            {months ? `No ${word.one} has a figure for ${months} yet` : 'No month begins within these dates'}
          </p>
          <p className="max-w-[340px] text-[12px] text-ink-3">
            {months
              ? 'A month shows as soon as one is keyed in.'
              : 'Include the first day of a month, for example 1 Oct to 31 Oct, to see the partners’ months.'}
          </p>
        </div>
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
function PartnerRanking({
  data,
  channel,
  canKey,
  onOpen,
  order,
}: {
  data: CrmData
  channel: PartnerChannel
  canKey: boolean
  onOpen: (id: string, month: string) => void
  order: OutletSort
}) {
  const month = latestPartnerMonth(data, channel)
  const label = channel === 'dealer' ? 'Dealers' : 'Consignment'
  if (!month) {
    return (
      <div>
        <ChannelHeading channel={channel}>{label}</ChannelHeading>
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
      channel={channel}
      title={`${label} · ${monthLabel(month)}${keyedIn.length < total ? ` · ${keyedIn.length} of ${total} keyed in` : ''}`}
      onOpen={(id) => onOpen(id, month)}
      order={order}
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

/**
 * Each kind of outlet in its own colour on Who is selling (23 November: "the
 * headings and boxes should be different colour oriented"): pink for the main
 * stores, cyan for consignment, green for the dealers. The names say what
 * each is, so the colour is never the only sign.
 */
const CHANNEL_TONE: Record<Channel, { heading: string; box: string; rank: string }> = {
  main: {
    heading: 'bg-[#A21CAF]',
    box: 'border-[#F5D0FE] border-l-[#A21CAF] bg-[#FDF4FF] hover:border-[#D946EF] hover:border-l-[#A21CAF]',
    rank: 'text-[#A21CAF]',
  },
  consignment: {
    heading: 'bg-[#0E7490]',
    box: 'border-[#A5F3FC] border-l-[#0E7490] bg-[#ECFEFF] hover:border-[#06B6D4] hover:border-l-[#0E7490]',
    rank: 'text-[#0E7490]',
  },
  dealer: {
    heading: 'bg-[#047857]',
    box: 'border-[#A7F3D0] border-l-[#047857] bg-[#ECFDF5] hover:border-[#10B981] hover:border-l-[#047857]',
    rank: 'text-[#047857]',
  },
}

function ChannelHeading({ channel, children }: { channel: Channel; children: ReactNode }) {
  return (
    <p
      className={`mb-2.5 inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide2 text-white [print-color-adjust:exact] ${CHANNEL_TONE[channel].heading}`}
    >
      {children}
    </p>
  )
}

/** A league: rank, name, figure, ten at a time unless `all`. Each card opens the outlet's pop-up. */
function Ranking({
  channel,
  title,
  rows,
  all = false,
  onOpen,
  order,
}: {
  /** Whose colour it wears. */
  channel: Channel
  title: string
  all?: boolean
  onOpen: (id: string) => void
  /** Highest first, or the person's own order. */
  order: OutletSort
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
  const ranked = order.sort(
    [...rows].sort((a, b) => b.revenue - a.revenue || (b.tiebreak ?? 0) - (a.tiebreak ?? 0)),
    (r) => r.locationId,
  )
  const { visible, more } = usePaged(ranked, { page: all ? undefined : PAGE })
  return (
    <div>
      <ChannelHeading channel={channel}>{title}</ChannelHeading>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((r, i) => (
          <li key={r.locationId}>
            {/* A card from sm up; on a phone, one row with the figure on the
                right, so three leagues of ten are not a scroll of 30 cards. */}
            <button
              type="button"
              onClick={() => onOpen(r.locationId)}
              className={`group flex w-full flex-wrap items-start gap-x-3 rounded-xl border border-l-[3px] px-3.5 py-3 text-left transition-all duration-200 hover:shadow-glass [print-color-adjust:exact] sm:block ${CHANNEL_TONE[channel].box}`}
            >
              {r.above && (
                <p
                  className={`readout mb-1.5 basis-full text-[11px] font-semibold ${r.above.warn ? 'text-warn' : 'text-ink-2'}`}
                >
                  {r.above.label}
                </p>
              )}
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className={`readout mt-0.5 w-4 shrink-0 text-[11px] font-semibold ${CHANNEL_TONE[channel].rank}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[13px] font-medium leading-tight text-ink">
                    <span className="truncate">{r.name}</span>
                    <Icon
                      name="chevronRight"
                      className="h-3 w-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </p>
                  <p className="text-[11px] text-ink-2">{r.place}</p>
                </div>
              </div>
              <div className="max-w-[55%] shrink-0 text-right sm:mt-2 sm:max-w-none sm:text-left">
                <p className="readout text-[15px] font-semibold leading-tight text-ink">{rm(r.revenue)}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-2">{r.detail}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {more}
    </div>
  )
}
