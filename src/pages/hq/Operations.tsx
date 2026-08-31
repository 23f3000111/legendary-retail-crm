import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, LiveDot, SeverityBadge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { Icon } from '../../components/ui/icons'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import {
  emptyFilter,
  poValue,
  selectKpis,
  selectNotFiled,
  selectTimeSeries,
} from '../../store/selectors'
import { locationById, tradingLocations } from '../../data/locations'
import { availableTransitions } from '../../lib/po-machine'
import { addDays, formatDate } from '../../lib/dates'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * Kelly's screen.
 *
 * Everything she is personally holding up, in one place: orders waiting on her
 * approval, corrections waiting on her decision, and stores that missed the
 * 11pm deadline. Nothing here is a report — every item is a thing to do.
 */
export function Operations() {
  const data = useData()
  const user = useCurrentUser()

  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  const kpis = selectKpis(data, filter)
  const trend = selectTimeSeries(data, filter, 'revenue')

  const yesterday = addDays(data.today, -1)
  const notFiled = selectNotFiled(data, yesterday)
  const pendingCorrections = data.closings.filter((c) => c.correction?.status === 'pending')
  const waitingOnMe = user
    ? data.purchaseOrders.filter((p) =>
        availableTransitions(p, user.role).some((t) => t.to !== 'rejected'),
      )
    : []
  const alerts = data.alerts.filter((a) => !a.read)
  const lowStock = alerts.filter((a) => a.type === 'low_stock')

  const todo = waitingOnMe.length + pendingCorrections.length + notFiled.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <p className="eyebrow">Head Office · Operations</p>
            <LiveDot />
          </div>
          <h1 className="page-title mt-1.5 sm:text-[28px]">
            {todo === 0 ? 'Nothing is waiting on you' : `${todo} things need you`}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {tradingLocations.length} stores · {formatDate(data.today)}
          </p>
        </div>
        <Link to="/closings">
          <Button variant={notFiled.length ? 'primary' : 'secondary'} icon="clipboard">
            {notFiled.length ? `${notFiled.length} missed yesterday` : 'Closings monitor'}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Orders to approve"
          value={waitingOnMe.length}
          format={(n) => num(Math.round(n))}
          footnote={waitingOnMe.length ? `${rm(waitingOnMe.reduce((a, p) => a + poValue(p), 0))} of stock` : 'queue clear'}
          tone="violet"
          icon="doc"
        />
        <StatTile
          label="Corrections pending"
          value={pendingCorrections.length}
          format={(n) => num(Math.round(n))}
          footnote="only you and Davy can decide"
          tone="blue"
          icon="clipboard"
        />
        <StatTile
          label="Missed the 11pm deadline"
          value={notFiled.length}
          format={(n) => num(Math.round(n))}
          footnote={formatDate(yesterday)}
          tone="cyan"
          icon="clock"
        />
        <StatTile
          label="Products below reorder"
          value={lowStock.length}
          format={(n) => num(Math.round(n))}
          footnote="across the estate"
          tone="teal"
          icon="box"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel className="flex flex-col">
          <PanelHeader
            eyebrow="Approvals"
            title="Orders waiting on you"
            action={
              <Link to="/orders">
                <Button size="sm" variant="ghost" iconRight="chevronRight">
                  All orders
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody className="flex-1 space-y-2">
            {waitingOnMe.length === 0 ? (
              <EmptyState icon="check" title="Queue is clear" body="No order is waiting on your approval." />
            ) : (
              waitingOnMe.slice(0, 6).map((po) => (
                <Link
                  key={po.id}
                  to={`/orders/${po.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-primary/35"
                >
                  <span className="readout text-[12.5px] font-medium text-ink">{po.id}</span>
                  <span className="text-[11.5px] text-ink-2">
                    {locationById(po.locationId)?.shortName}
                  </span>
                  {po.priority === 'urgent' && <Badge tone="critical">Urgent</Badge>}
                  <span className="readout ml-auto text-[12px] text-ink">{rm(poValue(po))}</span>
                  <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                </Link>
              ))
            )}
          </PanelBody>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader
            eyebrow="Exceptions"
            title="Everything else raised today"
            action={
              <Link to="/alerts">
                <Button size="sm" variant="ghost" iconRight="chevronRight">
                  All alerts
                </Button>
              </Link>
            }
          />
          <Rule />
          <PanelBody className="flex-1 space-y-2">
            {alerts.length === 0 ? (
              <EmptyState icon="check" title="Nothing outstanding" body="Every store has filed and stock is healthy." />
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

      <ChartFrame
        title="Group revenue"
        meta={`${rm(kpis.current.revenue)} over 30 days`}
        height={220}
      >
        <TrendChart data={trend} format={rmCompact} label="Daily revenue" />
      </ChartFrame>
    </div>
  )
}
