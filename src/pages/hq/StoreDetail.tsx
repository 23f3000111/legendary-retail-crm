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
import { StockItemDetail } from '../../components/StockItemDetail'
import { StorePicker } from '../../components/StorePicker'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { SkuBars } from '../../components/charts/SkuBars'
import { useData } from '../../store/useData'
import { useCan } from '../../store/useAuth'
import {
  emptyFilter,
  selectKpis,
  selectOriginMix,
  selectSkuPerformance,
  selectStock,
  selectTimeSeries,
  totalsFor,
  type StockRow,
} from '../../store/selectors'
import { CHANNEL_LABEL, locationById } from '../../data/locations'
import { addDays, formatDate, monthKey, startOfMonth } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { change, num, rm } from '../../lib/format'

type RangeKey = '7' | '30' | '90'

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

  const [range, setRange] = useState<RangeKey>('30')
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
  const origins = useMemo(() => selectOriginMix(data, filter, 6), [data, filter])
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

  const orders = useMemo(
    () =>
      data.purchaseOrders
        .filter((p) => p.locationId === id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 6),
    [data.purchaseOrders, id],
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
                ? 'Recorded on every sale, never estimated.'
                : 'This channel does not record customer countries.'
            }
          />
          <Rule />
          <PanelBody>
            {location.recordsCountries ? (
              <OriginRibbon slices={origins} height={40} />
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
          meta="Tap a product to see what came in and what went out."
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="download"
              onClick={() =>
                downloadCsv(
                  `legendary-stock-${location.code}.csv`,
                  ['Product', 'Code', 'On hand', 'Reorder at', 'Days left', 'Status'],
                  stock.map((r) => [
                    r.label,
                    r.code,
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
          <PanelHeader eyebrow="History" title="Recent closings" />
          <Rule />
          <PanelBody className="space-y-2">
            {closings.length === 0 ? (
              <EmptyState icon="clipboard" title="Nothing filed yet" body="No closing on record." />
            ) : (
              closings.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                >
                  <span className="readout text-[12.5px] text-ink-2">{formatDate(c.period)}</span>
                  <span className="min-w-0 truncate text-[11.5px] text-ink-3">filed by {c.submittedBy}</span>
                  <span className="readout ml-auto text-[13px] font-semibold text-ink">
                    {rm(c.revenueMYR)}
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {c.lines.reduce((a, l) => a + l.qty, 0)} units
                  </span>
                  {c.correction && (
                    <Badge tone={c.correction.status === 'pending' ? 'warn' : 'neutral'}>
                      {c.correction.status === 'pending' ? 'Correction waiting' : 'Corrected'}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Supply"
            title="Recent orders"
            action={
              capability.viewAll ? (
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
                <Link
                  key={p.id}
                  to={`/orders/${p.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-primary/40"
                >
                  <span className="readout text-[12.5px] font-medium text-ink">{p.id}</span>
                  <span className="text-[11.5px] text-ink-3">{p.lines.length} items</span>
                  <span className="ml-auto">
                    <StatusChip status={p.status} />
                  </span>
                </Link>
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
