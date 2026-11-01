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
import { StockItemDetail } from '../../components/StockItemDetail'
import { StorePicker } from '../../components/StorePicker'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuTable } from '../../components/charts/SkuBars'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { canOpen } from '../../components/layout/nav'
import { seenBy } from '../../lib/po-machine'
import {
  emptyFilter,
  selectLastFiled,
  selectOriginMix,
  selectOriginsBetween,
  selectPricesAt,
  selectSkuPerformance,
  selectStock,
  selectTimeSeries,
  type SoldAt,
  type StockRow,
} from '../../store/selectors'
import { CHANNEL_LABEL, locationById } from '../../data/locations'
import { addDays, formatDate, spanDays, spanLabel, startOfMonth, startOfWeek, type DateSpan } from '../../lib/dates'
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
 * "Where they came from" over the page's range, or yesterday, this week, this
 * month, or chosen dates (client, 15 October; "Today" became "Yesterday" and
 * the dates were added on 20 October).
 */
type OriginPeriod = 'range' | 'yesterday' | 'week' | 'month' | 'dates'

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
  /** The stock table shows its best sellers first, ten at a time (client, 1 November). */
  const [stockShown, setStockShown] = useState(10)
  /** Where they came from: the figures first, the ribbon a tap away. */
  const [originChart, setOriginChart] = useState(false)
  const [country, setCountry] = useState<string | null>(null)

  const location = locationById(id)

  const filter = useMemo(
    () => ({
      ...emptyFilter(addDays(data.today, -(Number(range) - 1)), data.today),
      locationIds: [id],
    }),
    [data.today, range, id],
  )

  const series = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  // The page's range reads what was filed, like every chart on the page.
  // This week and the month to date read today's sales live as well, and so
  // do chosen dates that take in today.
  const yesterday = addDays(data.today, -1)
  const originDays: { from: string; to: string } | null =
    originPeriod === 'yesterday'
      ? { from: yesterday, to: yesterday }
      : originPeriod === 'week'
        ? { from: startOfWeek(data.today), to: data.today }
        : originPeriod === 'month'
          ? { from: startOfMonth(data.today), to: data.today }
          : originPeriod === 'dates'
            ? spanDays(originDates)
            : null
  const origins = useMemo(
    () =>
      originPeriod === 'range'
        ? selectOriginMix(data, filter, 6)
        : originDays
          ? selectOriginsBetween(data, id, originDays.from, originDays.to, 6)
          : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filter, id, originPeriod, originDays?.from, originDays?.to],
  )
  const filedYesterday = data.closings.some(
    (c) => c.locationId === id && c.periodType === 'day' && c.period === yesterday,
  )
  const originWhen =
    originPeriod === 'range'
      ? `Last ${range} days`
      : originPeriod === 'yesterday'
        ? `Yesterday, ${formatDate(yesterday)}${filedYesterday ? '' : ' — not filed yet'}`
        : originPeriod === 'week' || originPeriod === 'month'
          ? `${originPeriod === 'week' ? 'This week' : 'Month to date'}: ${formatDate(originDays!.from)} to today, with today live`
          : originDays
            ? spanLabel(originDays)
            : 'Choose the dates'
  const skuRows = useMemo(() => selectSkuPerformance(data, filter), [data, filter])
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
            rows={stock.slice(0, stockShown)}
            rowKey={(r) => r.skuId}
            dense
            onRowClick={setItem}
            totalLabel={stockShown < stock.length ? `Total · all ${num(stock.length)}` : 'Total'}
          />
          {stock.length > stockShown && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="secondary" icon="chevronDown" onClick={() => setStockShown((n) => n + 10)}>
                Load more · {num(Math.min(10, stock.length - stockShown))} of {num(stock.length - stockShown)} left
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStockShown(stock.length)}>
                Show all {num(stock.length)}
              </Button>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* ── Its days, as a calendar that opens on a day (1 November) ──── */}
      <SalesCalendar locationId={id} />

      {/* ── The sales report, for this store alone (20 October) ───────── */}
      {/* The rules stay as they are when another store is picked, to compare like with like. */}
      <SalesReport locationId={id} />

      {/* ── What sells: the figures first (client, 1 November) ─────────── */}
      <ChartFrame
        title="Best sellers here"
        meta={`Every product sold, last ${range} days: units and what they came to, with the total at the foot.`}
        height={300}
        table={<SkuTable rows={skuRows} />}
      >
        <SkuBars rows={skuRows.slice(0, 8)} metric="units" />
      </ChartFrame>

      {/* ── Where they came from ──────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            eyebrow="Customers"
            title="Where they came from"
            meta={
              location.recordsCountries
                ? `${originWhen}. Counted by customer: one sale is one customer, however much they bought. Tap a country to open it.`
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
                <SegmentedControl<OriginPeriod>
                  size="sm"
                  value={originPeriod}
                  onChange={setOriginPeriod}
                  options={[
                    { value: 'yesterday', label: 'Yesterday' },
                    { value: 'week', label: 'Week' },
                    { value: 'month', label: 'Month' },
                    { value: 'range', label: `${range} days` },
                    { value: 'dates', label: 'Dates' },
                  ]}
                />
                {originPeriod === 'dates' && (
                  <DateSpanInput value={originDates} onChange={setOriginDates} max={data.today} />
                )}
                {origins.length ? (
                  originChart ? (
                    <OriginRibbon slices={origins} height={40} />
                  ) : (
                    <OriginTable slices={origins} onSelect={setCountry} />
                  )
                ) : (
                  <p className="py-4 text-center text-[12.5px] text-ink-3">No customers recorded yet.</p>
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

      {country && (
        <CountryDetailModal
          countryCode={country}
          filter={
            originDays
              ? { ...emptyFilter(originDays.from, originDays.to), locationIds: [id] }
              : filter
          }
          when={originWhen}
          onClose={() => setCountry(null)}
        />
      )}
    </div>
  )
}
