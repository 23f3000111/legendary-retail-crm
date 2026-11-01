import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { SegmentedControl } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { LinkIf } from '../../components/ui/LinkIf'
import { PAGE, totalOf, usePaged } from '../../components/ui/LoadMore'
import { StockItemDetail } from '../../components/StockItemDetail'
import { StorePicker } from '../../components/StorePicker'
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
  selectPricesAt,
  selectSkuPerformance,
  selectSkuSales,
  selectStock,
  selectTimeSeries,
  type SalesWindow,
  type SoldAt,
  type StockRow,
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
import { CountryDetailModal } from '../../components/CountryDetail'
import { SalesReport } from '../../components/SalesReport'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm } from '../../lib/format'
import { TIER_LABEL } from '../../data/products'

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
 */
export function StoreDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
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
  const [item, setItem] = useState<StockRow | null>(null)
  /** Where they came from: the figures first, the ribbon a tap away. */
  const [originChart, setOriginChart] = useState(false)
  /** A country opened from "Where they came from", and the days of the figure tapped. */
  const [country, setCountry] = useState<{ code: string; window: SalesWindow } | null>(null)

  const location = locationById(id)

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
  // Best sellers first: what this store sold most of over the last 30 days,
  // then everything else in the range's own order.
  const stock = useMemo(() => {
    if (!location) return []
    const rows = selectStock(data, id)
    const sold = new Map(
      selectSkuPerformance(data, { ...emptyFilter(addDays(data.today, -29), data.today), locationIds: [id] }).map((r) => [
        r.skuId,
        r.units,
      ]),
    )
    return rows
      .map((r, i) => ({ r, i, units: sold.get(r.skuId) ?? 0 }))
      .sort((a, b) => b.units - a.units || a.i - b.i)
      .map((x) => x.r)
  }, [data, id, location])
  /** The stock table shows its best sellers first, ten at a time (client, 1 November). */
  const stockPage = usePaged(stock, { page: PAGE, resetOn: id })

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

  // The day the store last filed, and what that closing took off the shelf:
  // the "deducted" column Finance asked for (client's fifth revision). Sold,
  // and written off — a used-up tester leaves the shelf as surely as a sale.
  const lastFiled = selectLastFiled(data, id)
  const deducted = new Map<string, number>()
  for (const l of [...(lastFiled?.lines ?? []), ...(lastFiled?.writeOffs ?? [])]) {
    deducted.set(l.skuId, (deducted.get(l.skuId) ?? 0) + l.qty)
  }
  // The price each product went for, off the sales themselves, so a Wish
  // added on at the RM 10 offer reads RM 10 here as it does on the sale.
  const pricesAt = selectPricesAt(data, id)
  const several = (prices: SoldAt[]) => prices.length > 1

  const outOfStock = stock.filter((s) => s.status === 'out').length
  const lowStock = stock.filter((s) => s.status === 'low' || s.status === 'critical').length
  // The foot of the table counts every product, not only the ones showing.
  const deductedTotal = stock.reduce((a, r) => a + (deducted.get(r.skuId) ?? 0), 0)
  const onHandTotal = stock.reduce((a, r) => a + (r.counted ? r.onHand : 0), 0)

  const stockColumns: Column<StockRow>[] = [
    {
      key: 'label',
      header: 'Product',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{r.label}</p>
          <p className="readout text-[11px] text-ink-3">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '130px',
      render: (r) => {
        const prices = pricesAt(r.skuId)
        return (
          <span className="inline-flex flex-col items-end gap-1">
            {prices.map((p) => (
              <span key={`${p.tier}:${p.unitPrice}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {/* Labelled the way the sale is, where it is not the store's own price. */}
                {p.tier !== location.priceBasis && p.tier !== 'foc' && <Badge tone="neutral">{TIER_LABEL[p.tier]}</Badge>}
                <span className="readout text-[12.5px] text-ink-2">{p.tier === 'foc' ? 'FOC' : rm(p.unitPrice)}</span>
                {several(prices) && <span className="readout text-[11px] text-ink-3">×{num(p.qty)}</span>}
              </span>
            ))}
          </span>
        )
      },
    },
    {
      key: 'deducted',
      header: 'Deducted',
      align: 'right',
      width: '90px',
      render: (r) => {
        const n = deducted.get(r.skuId) ?? 0
        return (
          <span className={`readout text-[12.5px] ${n ? 'font-semibold text-ink' : 'text-ink-3'}`}>
            {lastFiled ? (n ? `−${num(n)}` : '0') : '—'}
          </span>
        )
      },
      total: lastFiled ? (deductedTotal ? `−${num(deductedTotal)}` : '0') : undefined,
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      width: '90px',
      render: (r) => (
        <span className="readout text-[13px] font-semibold text-ink">{r.counted ? num(r.onHand) : '—'}</span>
      ),
      total: num(onHandTotal),
    },
    {
      key: 'cover',
      header: 'Days left',
      align: 'right',
      width: '100px',
      render: (r) => (
        <span className="readout text-[12.5px] text-ink-2">
          {r.daysCover === null ? 'not moving' : `${r.daysCover.toFixed(1)} days`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      width: '110px',
      render: (r) => (
        <Badge tone={r.status === 'out' ? 'critical' : r.status === 'ok' ? 'good' : 'warn'}>
          {r.status === 'ok' ? 'Healthy' : r.status === 'out' ? 'Out' : 'Low'}
        </Badge>
      ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: '44px',
      render: () => <Icon name="chevronRight" className="ml-auto h-3.5 w-3.5 text-ink-3" />,
    },
  ]

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
          <SegmentedControl<RangeKey> size="sm" value={range} onChange={setRange} options={RANGES} />
          <StorePicker
            value={id}
            onChange={(next) => navigate(`/stores/${next}`)}
            className="h-8 w-[210px] text-[12.5px]"
          />
        </div>
      </div>

      {/* ── The four boxes, for this store (client, 1 November) ────────── */}
      <SalesBoxes base={{ locationIds: [id] }} />

      {/* ── Stock, clickable per item ─────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Stock"
          title={`${stock.length} products on the shelf${outOfStock ? ` · ${outOfStock} out of stock` : ''}${
            lowStock ? ` · ${lowStock} running low` : ''
          }`}
          meta={
            lastFiled
              ? `Best sellers here first. Price is what each product went for on ${formatDate(lastFiled.period)}, as on the sales, or what it usually goes for here if it did not sell that day. Deducted is what that closing took off the shelf: sold, plus any tester, damage or sample. Tap a product to see what came in and what went out.`
              : 'Best sellers here first. Price is what each product usually goes for here. Tap a product to see what came in and what went out.'
          }
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="download"
              onClick={() =>
                downloadCsv(
                  `legendary-stock-${location.code}.csv`,
                  [
                    'Product',
                    'Code',
                    'Price',
                    lastFiled ? `Deducted ${lastFiled.period}` : 'Deducted',
                    'On hand',
                    'Reorder at',
                    'Days left',
                    'Status',
                  ],
                  [
                    ...stock.map((r) => [
                      r.label,
                      r.code,
                      (() => {
                        // One figure where there was one price; each, with its count, where there were more.
                        const prices = pricesAt(r.skuId)
                        const one = (p: SoldAt) => (p.tier === 'foc' ? 'FOC' : p.unitPrice)
                        return several(prices) ? prices.map((p) => `${one(p)} x${p.qty}`).join(' / ') : one(prices[0])
                      })(),
                      deducted.get(r.skuId) ?? 0,
                      r.onHand,
                      r.reorderPoint,
                      r.daysCover === null ? '' : r.daysCover.toFixed(1),
                      r.status,
                    ]),
                    ['Total', '', '', deductedTotal, onHandTotal, '', '', ''],
                  ],
                )
              }
            >
              Export
            </Button>
          }
        />
        <Rule />
        <PanelBody>
          <DataTable
            columns={stockColumns}
            rows={stockPage.visible}
            rowKey={(r) => r.skuId}
            dense
            onRowClick={setItem}
            totalLabel={totalOf(stockPage.partial, stock.length)}
          />
          {stockPage.more}
        </PanelBody>
      </Panel>

      {/* ── Its days, as a calendar that opens on a day (1 November) ──── */}
      <SalesCalendar locationId={id} />

      {/* ── The sales report, for this store alone (20 October) ───────── */}
      {/* The rules stay as they are when another store is picked, to compare like with like. */}
      <SalesReport locationId={id} />

      {/* ── What sells: the figures first, by the four windows (1 November) ── */}
      <ChartFrame
        title="Best sellers here"
        meta={`Every product sold here, ${PAGE} at a time, with what it came to and its units under it. Today is live; the days before are as filed. The chart shows the last ${range} days.`}
        height={300}
        note={
          location.channel === 'main'
            ? undefined
            : 'A month keyed in on Dealer sales has no products behind it, so it is not in this table.'
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

      {/* ── One item: what came in, what went out ─────────────────────── */}
      <Modal
        open={item !== null}
        onClose={() => setItem(null)}
        title={item?.label ?? ''}
        subtitle={
          item
            ? `${item.code} · ${num(item.onHand)} on the shelf at ${location.shortName}`
            : undefined
        }
        width="max-w-lg"
      >
        {item && <StockItemDetail locationId={id} skuId={item.skuId} row={item} />}
      </Modal>

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
