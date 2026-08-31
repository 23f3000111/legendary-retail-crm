import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, SeverityBadge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { SegmentedControl } from '../../components/ui/Field'
import { Icon, type IconName } from '../../components/ui/icons'
import { useData } from '../../store/useData'
import { useCan } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { locationById } from '../../data/locations'
import { formatTimestamp } from '../../lib/dates'
import type { AlertType } from '../../data/types'

const TYPE_META: Record<AlertType, { label: string; icon: IconName; blurb: string }> = {
  missed_closing: {
    label: 'Missed closing',
    icon: 'clipboard',
    blurb: 'A store did not file by 11pm. Davy, Kelly and Chloe are told.',
  },
  low_stock: {
    label: 'Low stock',
    icon: 'box',
    blurb: 'A product has reached its reorder level.',
  },
  po_waiting: {
    label: 'Order waiting',
    icon: 'doc',
    blurb: 'An order is sitting with Kelly for approval.',
  },
  correction_pending: {
    label: 'Correction asked',
    icon: 'clock',
    blurb: 'A store wants to change a figure it already filed.',
  },
  target_risk: {
    label: 'Behind target',
    icon: 'chart',
    blurb: 'Month to date is off the pace.',
  },
}

type View = 'open' | 'all'

/** Everything here is something a person has to do. */
export function Alerts() {
  const data = useData()
  const capability = useCan()
  const markRead = useData((s) => s.markAlertRead)
  const markAll = useData((s) => s.markAllAlertsRead)
  const push = useToasts((s) => s.push)
  const [view, setView] = useState<View>('open')
  const [type, setType] = useState<AlertType | 'all'>('all')

  const rows = data.alerts
    .filter((a) => (view === 'open' ? !a.read : true))
    .filter((a) => type === 'all' || a.type === type)

  const openCount = data.alerts.filter((a) => !a.read).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">
            Alerts
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {openCount} open. Raised automatically from filings, stock levels and order age.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl<View>
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
          />
          {capability.canEdit && (
            <Button
              variant="secondary"
              icon="check"
              disabled={openCount === 0}
              onClick={() => {
                markAll()
                push('All alerts marked as read', 'good')
              }}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setType('all')}
          className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
            type === 'all'
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-line bg-surface text-ink-2 hover:text-ink'
          }`}
        >
          Everything ({data.alerts.filter((a) => (view === 'open' ? !a.read : true)).length})
        </button>
        {(Object.keys(TYPE_META) as AlertType[]).map((t) => {
          const n = data.alerts.filter(
            (a) => a.type === t && (view === 'open' ? !a.read : true),
          ).length
          if (n === 0 && type !== t) return null
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                type === t
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-line bg-surface text-ink-2 hover:text-ink'
              }`}
            >
              <Icon name={TYPE_META[t].icon} className="h-3 w-3" />
              {TYPE_META[t].label} ({n})
            </button>
          )
        })}
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Feed"
          title={`${rows.length} alerts`}
          meta={type === 'all' ? undefined : TYPE_META[type].blurb}
        />
        <Rule />
        <PanelBody className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing outstanding"
              body="Every store has filed, stock is above its reorder levels, and no order is stuck."
            />
          ) : (
            rows.map((a) => (
              <div
                key={a.id}
                className={`flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  a.read ? 'border-line/60 bg-surface-2/60 opacity-60' : 'border-line bg-surface-2'
                }`}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-2">
                  <Icon name={TYPE_META[a.type].icon} className="h-3.5 w-3.5" />
                </span>

                <div className="min-w-[200px] flex-1">
                  <p className="text-[13px] leading-snug text-ink">{a.message}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {locationById(a.locationId)?.name} · {formatTimestamp(a.at)}
                  </p>
                </div>

                <SeverityBadge severity={a.severity} />

                {a.poId && (
                  <Link to={`/orders/${a.poId}`}>
                    <Badge tone="active" icon="doc">
                      {a.poId}
                    </Badge>
                  </Link>
                )}

                {!a.read && capability.canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            ))
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}
