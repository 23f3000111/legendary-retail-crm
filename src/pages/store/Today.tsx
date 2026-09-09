import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { ProgressRing } from '../../components/ui/Progress'
import { Icon } from '../../components/ui/icons'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import {
  emptyFilter,
  originSlicesFrom,
  selectClosingFor,
  selectKpis,
  selectLocationRows,
  selectOpenPos,
  selectOriginMix,
  selectStock,
  selectTimeSeries,
} from '../../store/selectors'
import { locationById } from '../../data/locations'
import { priceOf, skuById } from '../../data/products'
import { addDays, formatDate, relativeDay } from '../../lib/dates'
import { num, rm, rmCompact } from '../../lib/format'

/** The promoter's home: what today looks like, and the one thing left to do. */
export function Today() {
  const user = useCurrentUser()
  const data = useData()
  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  // Which of the two prices this store is counted on (Revision 2).
  const basis = location?.priceBasis ?? 'promotion'

  const closedToday = selectClosingFor(data, locationId, data.today)
  const lines = data.liveLines[locationId] ?? []
  const stock = selectStock(data, locationId)
  const low = stock.filter((s) => s.status !== 'ok')
  const openOrders = selectOpenPos(data, locationId)

  const window30 = useMemo(
    () => ({ ...emptyFilter(addDays(data.today, -29), data.today), locationIds: [locationId] }),
    [data.today, locationId],
  )
  const kpis = selectKpis(data, window30)
  const trend = selectTimeSeries(data, window30, 'revenue')
  const mix = selectOriginMix(data, window30)
  const row = selectLocationRows(data, window30)[0]

  const liveRevenue = lines.reduce((a, l) => a + l.qty * priceOf(skuById(l.skuId), basis), 0)
  const liveUnits = lines.reduce((a, l) => a + l.qty, 0)

  const todayMix = useMemo(() => {
    const source = closedToday ? closedToday.lines : lines
    const tally = new Map<string, { units: number; revenue: number }>()
    for (const l of source) {
      if (!l.countryCode) continue
      const b = tally.get(l.countryCode) ?? { units: 0, revenue: 0 }
      b.units += l.qty
      b.revenue += l.qty * priceOf(skuById(l.skuId), basis)
      tally.set(l.countryCode, b)
    }
    return originSlicesFrom(tally)
  }, [closedToday, lines])

  if (!location || !user) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{location.name}</p>
          <h1 className="page-title mt-1">
            {closedToday ? 'Today is closed' : 'Today is still open'}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {formatDate(data.today)} ·{' '}
            {closedToday ? `Filed by ${closedToday.submittedBy}` : 'File before 11pm'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sell">
            <Button variant={closedToday ? 'secondary' : 'primary'} icon="plus">
              Record a sale
            </Button>
          </Link>
          <Link to="/close">
            <Button variant={closedToday ? 'secondary' : 'primary'} icon="clipboard">
              {closedToday ? 'Re-file the closing' : 'Close the day'}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={closedToday ? 'Filed today' : 'Logged so far'}
          value={closedToday ? closedToday.revenueMYR : liveRevenue}
          format={rm}
          footnote={closedToday ? 'as filed' : 'still open'}
          tone="violet"
          icon="wallet"
        />
        <StatTile
          label="Units"
          value={closedToday ? closedToday.lines.reduce((a, l) => a + l.qty, 0) : liveUnits}
          format={(n) => num(Math.round(n))}
          tone="blue"
          icon="box"
        />
        <StatTile
          label="Below reorder"
          value={low.length}
          format={(n) => num(Math.round(n))}
          footnote={low.length ? 'top-up suggested at closing' : 'all healthy'}
          tone="cyan"
          icon="alert"
        />
        <StatTile
          label="Orders in flight"
          value={openOrders.length}
          format={(n) => num(Math.round(n))}
          footnote={openOrders.length ? 'with HQ or the warehouse' : 'nothing outstanding'}
          tone="teal"
          icon="truck"
        />
      </div>

      {location.recordsCountries && (
        <Panel>
          <PanelHeader
            eyebrow={closedToday ? 'As filed · today' : 'Live · today'}
            title="Which countries bought today"
            meta={
              closedToday
                ? 'Recorded against each sale during the day.'
                : lines.length
                  ? 'Recorded as each sale happens.'
                  : 'Nothing logged yet — record sales as they happen.'
            }
            action={
              <Link to="/sell">
                <Button size="sm" variant="secondary" icon="plus">
                  Record a sale
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody>
            <OriginRibbon slices={todayMix} />
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <ChartFrame
          title="Takings, last 30 days"
          meta={`${rm(kpis.current.revenue)} in the window`}
          height={220}
        >
          <TrendChart data={trend} format={rmCompact} label="Daily takings" />
        </ChartFrame>

        <Panel className="h-fit">
          <PanelHeader eyebrow="This month" title="Target pace" />
          <Rule />
          <PanelBody className="flex items-center gap-4">
            <ProgressRing value={row?.targetPace ?? 0} size={76} />
            <div className="min-w-0">
              <p className="readout font-display text-[20px] font-semibold text-ink">
                {rm(row?.monthToDate ?? 0)}
              </p>
              <p className="text-[12px] text-ink-2">
                of {rm(row?.monthlyTarget ?? 0)} this month
              </p>
              <p className="mt-1.5 text-[11.5px] text-ink-3">
                {(row?.targetPace ?? 0) >= 1
                  ? 'Ahead of the pace needed.'
                  : 'Behind the pace needed.'}
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {location.recordsCountries ? (
          <ChartFrame
            title="Usual countries"
            meta="Last 30 days at this store"
            height={180}
            table={<OriginTable slices={mix} />}
          >
            <div className="flex h-full items-center">
              <div className="w-full">
                <OriginRibbon slices={mix} height={54} />
              </div>
            </div>
          </ChartFrame>
        ) : (
          <Panel>
            <PanelHeader eyebrow="Stock" title={`${low.length} to watch`} />
            <Rule />
            <PanelBody className="space-y-2">
              {low.slice(0, 5).map((s) => (
                <div
                  key={s.skuId}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{s.label}</span>
                  <span className="readout text-[12px] text-ink-2">{num(s.onHand)} left</span>
                  <Badge tone={s.status === 'low' ? 'warn' : 'critical'} icon="alert">
                    {s.status === 'out' ? 'Out' : s.status === 'critical' ? 'Very low' : 'Low'}
                  </Badge>
                </div>
              ))}
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            eyebrow="Purchase orders"
            title="In flight"
            action={
              <Link to="/orders">
                <Button size="sm" variant="ghost" iconRight="chevronRight">
                  All orders
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody className="space-y-2">
            {openOrders.length === 0 ? (
              <EmptyState
                icon="doc"
                title="Nothing on its way"
                body="When something drops below its reorder level, the closing will offer to raise an order."
              />
            ) : (
              openOrders.slice(0, 4).map((po) => (
                <Link
                  key={po.id}
                  to={`/orders/${po.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-primary/35"
                >
                  <div className="min-w-0 flex-1">
                    <p className="readout text-[12.5px] text-ink">{po.id}</p>
                    <p className="text-[11px] text-ink-3">
                      {po.lines.length} products · raised{' '}
                      {relativeDay(po.createdAt.slice(0, 10), data.today)}
                    </p>
                  </div>
                  {po.priority === 'urgent' && <Badge tone="critical">Urgent</Badge>}
                  <StatusChip status={po.status} />
                  <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                </Link>
              ))
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}
