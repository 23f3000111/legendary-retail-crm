import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { ProgressBar } from '../../components/ui/Progress'
import { SegmentedControl } from '../../components/ui/Field'
import { StatTile } from '../../components/ui/StatTile'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { poUnits, poValue } from '../../store/selectors'
import { STATUS_LABEL, STATUS_OWNER, availableTransitions, canClearAccounts, chainProgress, isOpen } from '../../lib/po-machine'
import { locationById } from '../../data/locations'
import { relativeDay } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm } from '../../lib/format'
import type { PurchaseOrder } from '../../data/types'

type View = 'mine' | 'open' | 'closed' | 'all'

/**
 * Every order, seen from whichever desk you are sitting at.
 *
 * "Waiting on me" is the default for anyone who can act, because the queue that
 * matters is the one holding you up. Kelly approves every order (Q46), so for
 * her this is the working screen of the day.
 */
export function Orders() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const capability = useCan()
  const data = useData()
  const transitionPo = useData((s) => s.transitionPo)
  const clearAccounts = useData((s) => s.clearAccounts)
  const push = useToasts((s) => s.push)

  const isPromoter = user?.role === 'promoter'
  const [view, setView] = useState<View>(isPromoter ? 'open' : 'mine')

  const scoped = useMemo(
    () =>
      data.purchaseOrders.filter((p) =>
        isPromoter ? p.locationId === user?.locationId : true,
      ),
    [data.purchaseOrders, isPromoter, user?.locationId],
  )

  const waitingOnMe = useMemo(
    () =>
      user
        ? scoped.filter(
            (p) =>
              availableTransitions(p, user.role).some((t) => t.to !== 'rejected') ||
              canClearAccounts(p, user.role),
          )
        : [],
    [scoped, user],
  )

  const rows = useMemo(() => {
    const list =
      view === 'mine'
        ? waitingOnMe
        : view === 'open'
          ? scoped.filter(isOpen)
          : view === 'closed'
            ? scoped.filter((p) => !isOpen(p))
            : scoped
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [view, scoped, waitingOnMe])

  const act = (p: PurchaseOrder, to: string, label: string) => {
    if (!user) return
    const result =
      to === 'accounts_cleared'
        ? clearAccounts({ poId: p.id, actor: user.name, role: user.role })
        : transitionPo({ poId: p.id, to: to as never, actor: user.name, role: user.role })
    if (!result.ok) {
      push(result.error ?? 'That move is not allowed.', 'critical')
      return
    }
    push(`${p.id} — ${label.toLowerCase()}`, 'good')
  }

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'id',
      header: 'Order',
      render: (p) => (
        <>
          <p className="readout text-[12.5px] text-ink">{p.id}</p>
          <p className="text-[11px] text-ink-3">
            raised {relativeDay(p.createdAt.slice(0, 10), data.today)} by {p.createdBy}
          </p>
        </>
      ),
    },
    {
      key: 'store',
      header: 'Store',
      render: (p) => {
        const l = locationById(p.locationId)
        return (
          <>
            <p className="text-[12.5px] text-ink">{l?.shortName}</p>
            <p className="text-[11px] text-ink-3">{l?.region}</p>
          </>
        )
      },
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (p) => (
        <>
          <p className="readout text-[12.5px] text-ink">{rm(poValue(p))}</p>
          <p className="text-[11px] text-ink-3">{num(poUnits(p))} units</p>
        </>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '160px',
      render: (p) => (
        <div>
          <ProgressBar
            value={chainProgress(p.status)}
            tone={p.status === 'rejected' ? 'critical' : p.status === 'received' ? 'good' : 'primary'}
          />
          <p className="mt-1 text-[11px] text-ink-3">
            {isOpen(p) ? `with ${STATUS_OWNER[p.status]}` : STATUS_LABEL[p.status]}
          </p>
        </div>
      ),
    },
    {
      key: 'flags',
      header: '',
      align: 'right',
      width: '76px',
      render: (p) => (p.priority === 'urgent' ? <Badge tone="critical">Urgent</Badge> : null),
    },
    {
      key: 'action',
      header: 'Status',
      align: 'right',
      width: capability.canEdit ? '210px' : '150px',
      render: (p) => {
        const moves = user ? availableTransitions(p, user.role) : []
        const primary =
          moves.find((m) => m.to !== 'rejected') ??
          (user && canClearAccounts(p, user.role) ? { to: 'accounts_cleared', label: 'Clear' } : undefined)
        return (
          <div className="flex items-center justify-end gap-2">
            <StatusChip status={p.status} />
            {capability.canEdit && primary && (
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  act(p, primary.to, primary.label)
                }}
              >
                {primary.label}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-purchase-orders.csv',
      ['Order', 'Store', 'Raised', 'Status', 'Products', 'Units', 'Value MYR', 'Priority'],
      rows.map((p) => [
        p.id,
        locationById(p.locationId)?.name ?? p.locationId,
        p.createdAt.slice(0, 10),
        STATUS_LABEL[p.status],
        p.lines.length,
        poUnits(p),
        poValue(p),
        p.priority,
      ]),
    )

  const openOrders = scoped.filter(isOpen)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{isPromoter ? locationById(user?.locationId ?? '')?.name : 'Head Office'}</p>
          <h1 className="page-title mt-1">
            {isPromoter ? 'My orders' : 'Purchase orders'}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Stores request, Kelly approves, Finance clears, the warehouse sends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<View>
            size="sm"
            value={view}
            onChange={setView}
            options={[
              ...(isPromoter || !capability.canEdit
                ? []
                : [{ value: 'mine' as View, label: `Waiting on me (${waitingOnMe.length})` }]),
              { value: 'open', label: 'In flight' },
              { value: 'closed', label: 'Closed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Button variant="secondary" icon="download" onClick={exportRows}>
            Export
          </Button>
        </div>
      </div>

      {!isPromoter && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Waiting on you"
            value={waitingOnMe.length}
            format={(n) => num(Math.round(n))}
            footnote={waitingOnMe.length === 0 ? 'nothing to do' : undefined}
            tone="violet"
            icon="doc"
          />
          <StatTile
            label="In flight"
            value={openOrders.length}
            format={(n) => num(Math.round(n))}
            footnote={`${rm(openOrders.reduce((a, p) => a + poValue(p), 0))} of stock`}
            tone="blue"
            icon="truck"
          />
          <StatTile
            label="Marked urgent"
            value={openOrders.filter((p) => p.priority === 'urgent').length}
            format={(n) => num(Math.round(n))}
            tone="cyan"
            icon="alert"
          />
        </div>
      )}

      <Panel>
        <PanelHeader eyebrow="Orders" title={`${rows.length} orders`} />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/orders/${p.id}`)}
            empty={
              <EmptyState
                icon="check"
                title={view === 'mine' ? 'Nothing waiting on you' : 'Nothing here'}
                body={
                  view === 'mine'
                    ? 'Orders will appear here as they reach your step.'
                    : 'No orders match this view.'
                }
              />
            }
          />
        </PanelBody>
      </Panel>
    </div>
  )
}
