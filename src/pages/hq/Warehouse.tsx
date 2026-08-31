import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { poUnits, poValue, selectPosByStatus } from '../../store/selectors'
import { availableTransitions, effectiveQty } from '../../lib/po-machine'
import { locationById } from '../../data/locations'
import { skuById } from '../../data/products'
import { relativeDay } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm } from '../../lib/format'
import type { PurchaseOrder } from '../../data/types'

/**
 * The despatch bench.
 *
 * Orders arrive here once Finance has cleared them. The pick list is the point
 * of the screen — it collapses every waiting order into one list of what to
 * take off the shelf, which is how a warehouse actually works.
 */
export function Warehouse() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const data = useData()
  const transitionPo = useData((s) => s.transitionPo)
  const push = useToasts((s) => s.push)

  const toPick = selectPosByStatus(data, ['accounts_cleared'])
  const toDispatch = selectPosByStatus(data, ['packed'])
  const onRoad = selectPosByStatus(data, ['in_transit'])

  // One combined pick list across everything waiting to be packed.
  const pickList = useMemo(() => {
    const tally = new Map<string, number>()
    for (const po of toPick) {
      for (const l of po.lines) tally.set(l.skuId, (tally.get(l.skuId) ?? 0) + effectiveQty(l))
    }
    return [...tally.entries()]
      .map(([skuId, qty]) => ({ skuId, label: skuById(skuId)?.label ?? skuId, qty }))
      .sort((a, b) => b.qty - a.qty)
  }, [toPick])

  const act = (p: PurchaseOrder, to: string, label: string) => {
    if (!user) return
    const result = transitionPo({ poId: p.id, to: to as never, actor: user.name, role: user.role })
    if (!result.ok) {
      push(result.error ?? 'That move is not allowed.', 'critical')
      return
    }
    push(`${p.id} — ${label.toLowerCase()}`, 'good')
  }

  const columns = (showAction: boolean): Column<PurchaseOrder>[] => [
    {
      key: 'id',
      header: 'Order',
      render: (p) => (
        <>
          <p className="readout text-[12.5px] text-ink">{p.id}</p>
          <p className="text-[11px] text-ink-3">
            raised {relativeDay(p.createdAt.slice(0, 10), data.today)}
          </p>
        </>
      ),
    },
    {
      key: 'store',
      header: 'Going to',
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
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (p) => (
        <>
          <p className="readout text-[12.5px] text-ink">{num(poUnits(p))}</p>
          <p className="text-[11px] text-ink-3">{p.lines.length} products</p>
        </>
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
      width: '200px',
      render: (p) => {
        const moves = user ? availableTransitions(p, user.role) : []
        const primary = moves.find((m) => m.to !== 'rejected')
        return (
          <div className="flex items-center justify-end gap-2">
            <StatusChip status={p.status} />
            {showAction && primary && (
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

  const exportPickList = () =>
    downloadCsv(
      'legendary-pick-list.csv',
      ['Product', 'Units to pick'],
      pickList.map((r) => [r.label, r.qty]),
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Shah Alam · Warehouse</p>
          <h1 className="page-title mt-1">
            Despatch
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Pick what Finance has cleared, pack it, and send it out.
          </p>
        </div>
        <Button variant="secondary" icon="printer" onClick={() => window.print()}>
          Print pick list
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Waiting to pick"
          value={toPick.length}
          format={(n) => num(Math.round(n))}
          footnote={`${num(pickList.reduce((a, r) => a + r.qty, 0))} units`}
          tone="violet"
          icon="box"
        />
        <StatTile
          label="Packed, ready to send"
          value={toDispatch.length}
          format={(n) => num(Math.round(n))}
          tone="blue"
          icon="truck"
        />
        <StatTile
          label="On the road"
          value={onRoad.length}
          format={(n) => num(Math.round(n))}
          footnote={`${rm(onRoad.reduce((a, p) => a + poValue(p), 0))} of stock`}
          tone="cyan"
          icon="truck"
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Pick list"
          title={`${pickList.length} products to take off the shelf`}
          meta="Everything waiting to be packed, added up across all orders."
          action={
            pickList.length > 0 ? (
              <Button size="sm" variant="secondary" icon="download" onClick={exportPickList}>
                Export
              </Button>
            ) : undefined
          }
        />
        <Rule />
        <PanelBody>
          {pickList.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing to pick"
              body="When Finance clears an order it will appear here."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pickList.map((r) => (
                <li
                  key={r.skuId}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
                >
                  <span className="readout font-display text-[20px] font-semibold text-primary">
                    {r.qty}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink">{r.label}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Queue" title={`${toPick.length} orders to pack`} />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns(true)}
            rows={toPick}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/orders/${p.id}`)}
            empty={<EmptyState icon="check" title="Queue is clear" body="Nothing is waiting on the warehouse." />}
          />
        </PanelBody>
      </Panel>

      {toDispatch.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Packed" title={`${toDispatch.length} ready to send`} />
          <Rule />
          <PanelBody>
            <DataTable
              columns={columns(true)}
              rows={toDispatch}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/orders/${p.id}`)}
            />
          </PanelBody>
        </Panel>
      )}

      {onRoad.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="For reference" title="On the road" />
          <Rule />
          <PanelBody>
            <DataTable
              columns={columns(false)}
              rows={onRoad}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/orders/${p.id}`)}
              dense
            />
          </PanelBody>
        </Panel>
      )}
    </div>
  )
}
