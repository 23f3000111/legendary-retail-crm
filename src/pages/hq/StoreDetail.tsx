import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { SegmentedControl } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { LinkIf } from '../../components/ui/LinkIf'
import { StockItemDetail } from '../../components/StockItemDetail'
import { StorePicker } from '../../components/StorePicker'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { SkuBars } from '../../components/charts/SkuBars'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { canOpen } from '../../components/layout/nav'
import { seenBy } from '../../lib/po-machine'
import {
  emptyFilter,
  selectKpis,
  selectLastFiled,
  selectOriginMix,
  selectOriginsBetween,
  selectPricesAt,
  selectSkuPerformance,
  selectStock,
  selectTimeSeries,
  totalsFor,
  type SoldAt,
  type StockRow,
} from '../../store/selectors'
import { CHANNEL_LABEL, locationById } from '../../data/locations'
import { addDays, formatDate, monthKey, spanDays, spanLabel, startOfMonth, startOfWeek, type DateSpan } from '../../lib/dates'
import { DateSpanInput } from '../../components/DateSpanInput'
import { downloadCsv } from '../../lib/exportCsv'
import { change, num, rm } from '../../lib/format'
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
  const capability = useCan()
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

  const location = locationById(id)

  const filter = useMemo(
    () => ({
      ...emptyFilter(addDays(data.today, -(Number(range) - 1)), data.today),
      locationIds: [id],
    }),
    [data.today, range, id],
  )

  const kpis = useMemo(() => selectKpis(data, filter), [data, filter])
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
  const skuRows = useMemo(() => selectSkuPerformance(data, filter).slice(0, 8), [data, filter])
  const stock = useMemo(() => (location ? selectStock(data, id) : []), [data, id, location])

  // Month to date, which is what the target is measured against.
  const mtd = useMemo(
    () =>
      totalsFor(data, {
        ...emptyFilter(startOfMonth(data.today), data.today),
        locationIds: [id],
      }),
    [data, id],
  )

  const closings = useMemo(
    () =>
      data.closings
        .filter((c) => c.locationId === id)
        .sort((a, b) => (a.period < b.period ? 1 : -1))
        .slice(0, 10),
    [data.closings, id],
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

  const target = data.targets.find(
    (t) => t.locationId === id && t.month === monthKey(data.today),
  )?.amountMYR

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
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      width: '90px',
      render: (r) => (
        <span className="readout text-[13px] font-semibold text-ink">{r.counted ? num(r.onHand) : '—'}</span>
      ),
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

      {/* ── The numbers ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={`Revenue · ${range} days`}
          value={kpis.current.revenue}
          delta={change(kpis.current.revenue, kpis.previous.revenue)}
          format={rm}
          tone="violet"
          icon="chart"
        />
        <StatTile
          label="Units sold"
          value={kpis.current.units}
          delta={change(kpis.current.units, kpis.previous.units)}
          format={(n) => num(Math.round(n))}
          tone="blue"
          icon="box"
        />
        <StatTile
          label="This month so far"
          value={mtd.revenue}
          format={rm}
          footnote={target ? `of ${rm(target)} target` : 'no target set'}
          tone="cyan"
          icon="trophy"
        />
        <StatTile
          label="Out of stock"
          value={outOfStock}
          format={(n) => num(Math.round(n))}
          footnote={lowStock > 0 ? `${lowStock} more running low` : 'nothing running low'}
          tone={outOfStock > 0 ? 'plain' : 'teal'}
          icon="alert"
        />
      </div>

      {/* ── Trend and where the customers came from ───────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <ChartFrame
          title="Revenue"
          meta={`Last ${range} days to ${formatDate(data.today)}`}
          height={260}
        >
          <TrendChart data={series} format={rm} label="Revenue" />
        </ChartFrame>

        <Panel className="h-fit">
          <PanelHeader
            eyebrow="Customers"
            title="Where they came from"
            meta={
              location.recordsCountries
                ? `${originWhen}. Recorded on every sale, never estimated.`
                : 'This channel does not record customer countries.'
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
                  <OriginRibbon slices={origins} height={40} />
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
      </div>

      {/* ── What sells ────────────────────────────────────────────────── */}
      <ChartFrame title="Best sellers here" meta={`Units, last ${range} days`} height={300}>
        <SkuBars rows={skuRows} metric="units" />
      </ChartFrame>

      {/* ── Stock, clickable per item ─────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Stock"
          title={`${stock.length} products on the shelf`}
          meta={
            lastFiled
              ? `Price is what each product went for on ${formatDate(lastFiled.period)}, as on the sales, or what it usually goes for here if it did not sell that day. Deducted is what that closing took off the shelf: sold, plus any tester, damage or sample. Tap a product to see what came in and what went out.`
              : 'Price is what each product usually goes for here. Tap a product to see what came in and what went out.'
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
                  stock.map((r) => [
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
            rows={stock}
            rowKey={(r) => r.skuId}
            dense
            onRowClick={setItem}
          />
        </PanelBody>
      </Panel>

      {/* ── Recent closings and orders ────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            eyebrow="History"
            title="Recent closings"
            meta={capability.approveCorrections ? 'Open a day to see it in full or change it.' : undefined}
          />
          <Rule />
          <PanelBody className="space-y-2">
            {closings.length === 0 ? (
              <EmptyState icon="clipboard" title="Nothing filed yet" body="No closing on record." />
            ) : (
              closings.map((c) => {
                const row = (
                  <>
                    <span className="readout text-[12.5px] text-ink-2">{formatDate(c.period)}</span>
                    <span className="min-w-0 truncate text-[11.5px] text-ink-3">
                      filed by {c.submittedBy}
                      {c.editedBy ? ` · changed by ${c.editedBy}` : ''}
                    </span>
                    <span className="readout ml-auto text-[13px] font-semibold text-ink">
                      {rm(c.revenueMYR)}
                    </span>
                    <span className="text-[11.5px] text-ink-3">
                      {c.lines.reduce((a, l) => a + l.qty, 0)} units
                    </span>
                    {c.correction && (
                      <Badge tone={c.correction.status === 'pending' ? 'warn' : 'neutral'}>
                        {c.correction.status === 'pending'
                          ? 'Correction waiting'
                          : c.correction.status === 'approved'
                            ? 'Corrected'
                            : 'Correction turned down'}
                      </Badge>
                    )}
                  </>
                )
                const look =
                  'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5'
                return capability.approveCorrections ? (
                  <Link
                    key={c.id}
                    to={`/close?store=${c.locationId}&day=${c.period}`}
                    className={`${look} transition-colors hover:border-primary/40`}
                  >
                    {row}
                  </Link>
                ) : (
                  <div key={c.id} className={look}>
                    {row}
                  </div>
                )
              })
            )}
          </PanelBody>
        </Panel>

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
      </div>

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
    </div>
  )
}
