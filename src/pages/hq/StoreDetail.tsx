import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { FiguresTable } from '../../components/ui/FiguresTable'
import { SegmentedControl } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { LinkIf } from '../../components/ui/LinkIf'
import { PAGE } from '../../components/ui/LoadMore'
import { StorePicker } from '../../components/StorePicker'
import { StoreDay } from '../../components/StoreDay'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { OriginRibbon, OriginWindowsTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuWindowsTable } from '../../components/charts/SkuBars'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { canOpen } from '../../components/layout/nav'
import { seenBy } from '../../lib/po-machine'
import {
  emptyFilter,
  salesWindows,
  selectLastFiled,
  selectOriginSales,
  selectOriginsBetween,
  selectPartnerMonths,
  selectSkuSales,
  selectTimeSeries,
  type SalesWindow,
} from '../../store/selectors'
import { CHANNEL_LABEL, locationById } from '../../data/locations'
import {
  addDays,
  formatDate,
  formatDateShort,
  monthKey,
  monthLabel,
  spanDays,
  spanLabel,
  startOfWeek,
  type DateSpan,
} from '../../lib/dates'
import { DateSpanInput } from '../../components/DateSpanInput'
import { SalesBoxes } from '../../components/SalesBoxes'
import { SalesCalendar } from '../../components/SalesCalendar'
import { MonthExport } from '../../components/MonthExport'
import { CountryDetailModal } from '../../components/CountryDetail'
import { rm } from '../../lib/format'

type RangeKey = '7' | '30' | '90'

/**
 * The last column of "Where they came from": the page's range, this week, or
 * chosen dates (client, 15 and 20 October). Yesterday and the month to date
 * have columns of their own since the four windows came in (1 November).
 */
type OriginPeriod = 'range' | 'week' | 'dates'

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

/**
 * One store, everything about it.
 *
 * This is where every store card and every store row now leads. The client's
 * point was a fair one: a name on a dashboard that cannot be clicked is a
 * dead end, and the next question after "Pavilion took RM 93,620" is always
 * "why?" — so the answer lives one tap away rather than three screens sideways.
 *
 * Every figure comes from the same selectors the group screens use, so this
 * page can never disagree with the dashboard that sent you here.
 *
 * **One day at a time** (Revision 10, the client's eighth, and the meeting of
 * 16 November). The calendar sits straight under the four boxes and chooses
 * the day; under it, that day alone: every product with its price, what the
 * day took off the shelf and the count at its close, cash and card, and the
 * customers. Days left, Status and the sales report have gone; the sales
 * report lives on Analytics. **Finance gets only the calendar and the day** —
 * "for finance they only want detail, there is no summary needed".
 */
export function StoreDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const data = useData()
  const user = useCurrentUser()
  // Everybody who sees the estate opens this page, but not everybody opens
  // orders — IT does not — and a link that bounces is worse than no link.
  const open = (path: string) => (user && canOpen(user.role, path) ? path : undefined)

  const [range, setRange] = useState<RangeKey>('30')
  const [originPeriod, setOriginPeriod] = useState<OriginPeriod>('range')
  const [originDates, setOriginDates] = useState<DateSpan>(() => {
    const yesterday = addDays(data.today, -1)
    return { op: 'equal', from: yesterday, to: yesterday }
  })
  /** The day chosen on the calendar, for this store; it starts on the last day filed. */
  const [picked, setPicked] = useState<{ id: string; day: string } | null>(null)
  /** Where they came from: the figures first, the ribbon a tap away. */
  const [originChart, setOriginChart] = useState(false)
  /** A country opened from "Where they came from", and the days of the figure tapped. */
  const [country, setCountry] = useState<{ code: string; window: SalesWindow } | null>(null)

  const location = locationById(id)
  // "For finance they only want detail, there is no summary needed" (16 November).
  const finance = user?.role === 'finance'
  const partner = location ? location.channel !== 'main' : false
  const lastFiled = selectLastFiled(data, id)
  // A pop-up's "Open full detail" for one day opens the page on that day (20 November).
  const asked = params.get('day')
  const askedDay = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= data.today ? asked : null
  const day = picked?.id === id ? picked.day : (askedDay ?? lastFiled?.period ?? data.today)
  const partnerMonths = useMemo(() => (partner ? selectPartnerMonths(data, id) : []), [data, id, partner])

  const filter = useMemo(
    () => ({
      ...emptyFilter(addDays(data.today, -(Number(range) - 1)), data.today),
      locationIds: [id],
    }),
    [data.today, range, id],
  )
  const store = useMemo(() => ({ locationIds: [id] }), [id])

  const series = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])

  // The tables by the four windows read as the boxes do: the days that have
  // ended as filed, and today live (asked on 1 November, after Revision 9).
  const windows = salesWindows(data.today)
  const days = (d: { from: string; to: string }) =>
    d.from === d.to ? formatDateShort(d.from) : `${formatDateShort(d.from)} to ${formatDateShort(d.to)}`
  const rangeHeading = `Last ${range} days · ${days(filter)}`

  // Where they came from: the last column is the page's range, this week, or
  // chosen dates, and today is live in any of them that takes it in.
  const originDays: { from: string; to: string } | null =
    originPeriod === 'range'
      ? { from: filter.from, to: filter.to }
      : originPeriod === 'week'
        ? { from: startOfWeek(data.today), to: data.today }
        : spanDays(originDates)
  const originHeading =
    originPeriod === 'range'
      ? rangeHeading
      : originPeriod === 'week'
        ? `This week · since ${formatDateShort(startOfWeek(data.today))}`
        : originDays
          ? `Dates · ${days(originDays)}`
          : 'Dates · choose them'
  const originRows = useMemo(
    () =>
      selectOriginSales(
        data,
        store,
        originDays ? { ...emptyFilter(originDays.from, originDays.to), ...store } : null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, store, originDays?.from, originDays?.to],
  )
  // The ribbon draws the last column's days, counted as the table counts them.
  const originSlices = useMemo(
    () => (originChart && originDays ? selectOriginsBetween(data, id, originDays.from, originDays.to, 6) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, id, originChart, originDays?.from, originDays?.to],
  )
  // A country opens for the days of the figure tapped, read the same way.
  const countryDays = country ? (country.window === 'chosen' ? originDays : windows[country.window]) : null
  const countryFilter = useMemo(
    () => (countryDays ? { ...emptyFilter(countryDays.from, countryDays.to), ...store } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countryDays?.from, countryDays?.to, store],
  )
  const originWhen =
    originPeriod === 'range'
      ? `Last ${range} days`
      : originPeriod === 'week'
        ? `This week: ${formatDate(startOfWeek(data.today))} to today, with today live`
        : originDays
          ? spanLabel(originDays)
          : 'Choose the dates'
  const countryWhen: Record<SalesWindow, string> = {
    today: 'Today, live',
    yesterday: `Yesterday, ${formatDate(windows.yesterday.from)}`,
    monthToDate: `Month to date, since ${formatDate(windows.monthToDate.from)}`,
    lastMonth: `Last month, ${monthLabel(monthKey(windows.lastMonth.from))}`,
    chosen: originWhen,
  }

  // Best sellers here, by the four windows and the page's range.
  const skuRows = useMemo(() => selectSkuSales(data, store, filter), [data, store, filter])
  // The bars: the range's best sellers, by the bottle.
  const skuBars = useMemo(
    () =>
      skuRows
        .map((r) => ({ skuId: r.skuId, label: r.label, ...r.chosen }))
        .filter((r) => r.units > 0)
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
        .slice(0, 8),
    [skuRows],
  )
  // A store's drafts are its own until they are sent (20 October).
  const orders = useMemo(
    () =>
      data.purchaseOrders
        .filter((p) => p.locationId === id && Boolean(user && seenBy(p, user.role)))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 6),
    [data.purchaseOrders, id, user],
  )

  if (!location) {
    return (
      <Panel>
        <EmptyState
          icon="search"
          title="No such store"
          body="That link may be out of date. Every store is on the Stores screen."
          action={
            <Link to="/locations">
              <Button variant="primary">Back to Stores</Button>
            </Link>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Who and where ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="mb-1.5 flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">
              {location.name}
            </h1>
            <Badge tone="neutral">{CHANNEL_LABEL[location.channel]}</Badge>
            {location.status === 'coming' && <Badge tone="warn">Not open yet</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {location.region} · {location.code} ·{' '}
            {location.cadence === 'monthly' ? 'reports monthly' : 'files every day'}
            {location.openedOn ? ` · open since ${formatDate(location.openedOn)}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!finance && <SegmentedControl<RangeKey> size="sm" value={range} onChange={setRange} options={RANGES} />}
          <StorePicker
            value={id}
            onChange={(next) => navigate(`/stores/${next}`)}
            className="h-8 w-[210px] text-[12.5px]"
          />
        </div>
      </div>

      {/* ── The four boxes, for this store (client, 1 November) ────────── */}
      {/* Finance reads the day itself, not the summaries (16 November). */}
      {!finance && <SalesBoxes base={{ locationIds: [id] }} />}

      {partner ? (
        /* Dealers and consignment report a month at a time, on Dealer sales:
           there are no days to choose, so their months stand in for them. */
        <Panel>
          <PanelHeader
            eyebrow="Months"
            title="Sales, month by month"
            meta="Dealers and consignment partners report one figure a month, keyed in at head office."
          />
          <Rule />
          <PanelBody>
            <FiguresTable
              rows={partnerMonths}
              rowKey={(m) => m.month}
              page={PAGE}
              pageKey={id}
              columns={[
                { header: 'Month', render: (m) => monthLabel(m.month) },
                { header: 'Keyed in by', render: (m) => m.keyed?.enteredBy ?? 'from its closings' },
                {
                  header: 'Sales',
                  align: 'right',
                  render: (m) => rm(m.revenue),
                  total: rm(partnerMonths.reduce((a, m) => a + m.revenue, 0)),
                },
              ]}
              empty="No month has been keyed in for this partner yet."
            />
          </PanelBody>
        </Panel>
      ) : (
        <>
          {/* ── The calendar chooses the day (Revision 10) ──────────────── */}
          <SalesCalendar
            key={id}
            locationId={id}
            selected={day}
            onSelect={(d) => setPicked({ id, day: d })}
            monthActions={(month) => <MonthExport locationId={id} month={month} />}
          />

          {/* ── That day alone: stock, payment, customers ───────────────── */}
          <StoreDay locationId={id} day={day} />
        </>
      )}

      {!finance && (
        <>
      {/* ── What sells: the figures first, by the four windows (1 November) ── */}
      <ChartFrame
        title="Best sellers here"
        meta={`Every product sold here, ${PAGE} at a time, with what it came to and its units under it. Today is live; the days before are as filed. The chart shows the last ${range} days.`}
        height={300}
        note={
          location.channel === 'main'
            ? undefined
            : 'A month keyed in at head office has no products behind it, so it is not in this table.'
        }
        table={<SkuWindowsTable rows={skuRows} chosen={rangeHeading} pageKey={id} />}
      >
        <SkuBars rows={skuBars} metric="units" />
      </ChartFrame>

      {/* ── Where they came from ──────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            eyebrow="Customers"
            title="Where they came from"
            meta={
              location.recordsCountries
                ? 'Counted by customer: one sale is one customer, however much they bought. Today is live; the days before are as filed. Tap a figure to see what those customers bought, or a country for the last column’s days.'
                : 'This channel does not record customer countries.'
            }
            action={
              location.recordsCountries ? (
                <button
                  onClick={() => setOriginChart((v) => !v)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2 text-[11px] font-medium text-ink-3 transition-colors duration-200 hover:border-primary/40 hover:text-primary"
                >
                  <Icon name={originChart ? 'grid' : 'chart'} className="h-3 w-3" />
                  {originChart ? 'Figures' : 'Chart'}
                </button>
              ) : undefined
            }
          />
          <Rule />
          <PanelBody className="space-y-4">
            {location.recordsCountries ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-ink-3">{originChart ? 'Days' : 'Last column'}</span>
                  <SegmentedControl<OriginPeriod>
                    size="sm"
                    value={originPeriod}
                    onChange={setOriginPeriod}
                    options={[
                      { value: 'week', label: 'Week' },
                      { value: 'range', label: `${range} days` },
                      { value: 'dates', label: 'Dates' },
                    ]}
                  />
                </div>
                {originPeriod === 'dates' && (
                  <DateSpanInput value={originDates} onChange={setOriginDates} max={data.today} />
                )}
                {originChart ? (
                  <div className="space-y-2">
                    <p className="text-[11.5px] text-ink-3">{originWhen}</p>
                    <OriginRibbon slices={originSlices} height={40} />
                  </div>
                ) : (
                  <OriginWindowsTable
                    rows={originRows}
                    chosen={originHeading}
                    onSelect={(code, window) => setCountry({ code, window })}
                    pageKey={id}
                  />
                )}
              </>
            ) : (
              <p className="py-6 text-center text-[12.5px] text-ink-3">
                Only main stores capture nationality (Q29).
              </p>
            )}
          </PanelBody>
        </Panel>

      {/* ── Orders ────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            eyebrow="Supply"
            title="Recent orders"
            action={
              open('/orders') ? (
                <Link to="/orders">
                  <Button size="sm" variant="ghost">
                    All orders
                  </Button>
                </Link>
              ) : undefined
            }
          />
          <Rule />
          <PanelBody className="space-y-2">
            {orders.length === 0 ? (
              <EmptyState icon="doc" title="No orders" body="This store has not asked for stock." />
            ) : (
              orders.map((p) => (
                <LinkIf
                  key={p.id}
                  to={open(`/orders/${p.id}`)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                  linkClassName="transition-colors hover:border-primary/40"
                >
                  <span className="readout text-[12.5px] font-medium text-ink">{p.id}</span>
                  <span className="text-[11.5px] text-ink-3">{p.lines.length} items</span>
                  <span className="ml-auto">
                    <StatusChip status={p.status} />
                  </span>
                </LinkIf>
              ))
            )}
          </PanelBody>
        </Panel>

      {/* ── The graph, at the foot of the page (client, 1 November) ────── */}
      <ChartFrame title="Revenue" meta={`Last ${range} days to ${formatDate(data.today)}`} height={260}>
        <TrendChart data={series} format={rm} label="Revenue" />
      </ChartFrame>
        </>
      )}

      {country && countryFilter && (
        <CountryDetailModal
          countryCode={country.code}
          filter={countryFilter}
          when={countryWhen[country.window]}
          live
          onClose={() => setCountry(null)}
        />
      )}
    </div>
  )
}
