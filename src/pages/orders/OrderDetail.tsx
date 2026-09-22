import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, StatusChip } from '../../components/ui/Badge'
import { Field, NumberInput, TextArea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/DataTable'
import { Icon } from '../../components/ui/icons'
import { PoTimeline } from '../../components/po/PoTimeline'
import { PoLines } from '../../components/po/PoLines'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { poUnits, poValue } from '../../store/selectors'
import { availableTransitions, canClearAccounts, STATUS_LABEL, STATUS_OWNER } from '../../lib/po-machine'
import { locationById, CHANNEL_LABEL } from '../../data/locations'
import { skuById } from '../../data/products'
import { formatTimestamp } from '../../lib/dates'
import { num, rm } from '../../lib/format'
import type { PoStatus } from '../../data/types'

/**
 * One order, everything about it.
 *
 * Which buttons appear is decided entirely by the state machine and the signed-in
 * role, so this screen cannot offer a move the workflow does not allow — and a
 * read-only sign-in sees no buttons at all.
 */
export function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const capability = useCan()
  const po = useData((s) => s.purchaseOrders.find((p) => p.id === id))
  const transitionPo = useData((s) => s.transitionPo)
  const clearAccounts = useData((s) => s.clearAccounts)
  const push = useToasts((s) => s.push)

  const [pending, setPending] = useState<{ to: PoStatus; label: string } | null>(null)
  const [note, setNote] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  if (!po || !user) {
    return (
      <Panel>
        <EmptyState
          icon="doc"
          title="That order is not here"
          body="It may have been cleared, or the link is out of date. Head back to the list to pick another."
          action={<Button onClick={() => navigate(-1)}>Go back</Button>}
        />
      </Panel>
    )
  }

  const location = locationById(po.locationId)
  const moves = capability.canEdit ? availableTransitions(po, user.role) : []
  // Finance's move sits beside the chain: it is offered whenever the order has
  // been approved and not yet cleared, whatever the warehouse has done since.
  const canClear = capability.canEdit && canClearAccounts(po, user.role)

  const openMove = (to: PoStatus, label: string) => {
    setPending({ to, label })
    setNote('')
    setError(null)
    setQty(Object.fromEntries(po.lines.map((l) => [l.skuId, l.qtyApproved ?? l.qtyRequested])))
  }

  const confirm = () => {
    if (!pending) return
    if (pending.to === 'accounts_cleared') {
      const result = clearAccounts({ poId: po.id, actor: user.name, role: user.role, note: note.trim() || undefined })
      if (!result.ok) return setError(result.error ?? 'That move is not allowed.')
      push(`${po.id} cleared`, 'good')
      setPending(null)
      return
    }
    const result = transitionPo({
      poId: po.id,
      to: pending.to,
      actor: user.name,
      role: user.role,
      note: note.trim() || undefined,
      approvedQty: pending.to === 'approved' ? qty : undefined,
    })
    if (!result.ok) {
      setError(result.error ?? 'That move is not allowed.')
      return
    }
    const said: Partial<Record<PoStatus, string>> = {
      submitted: `${po.id} sent to HQ`,
      approved: `${po.id} approved`,
      rejected: `${po.id} rejected`,
      accounts_cleared: `${po.id} cleared for picking`,
      packed: `${po.id} marked packed`,
      in_transit: `${po.id} dispatched`,
      received: `${po.id} confirmed received`,
    }
    push(said[pending.to] ?? `${po.id} updated`, pending.to === 'rejected' ? 'critical' : 'good')
    setPending(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => navigate(-1)}>
          Back
        </Button>
        <h1 className="readout font-display text-[22px] font-bold">{po.id}</h1>
        <StatusChip status={po.status} />
        {po.priority === 'urgent' && (
          <Badge tone="critical" icon="alert">
            Urgent
          </Badge>
        )}
        {po.status !== 'received' && po.status !== 'rejected' && (
          <span className="text-[12px] text-ink-3">
            Waiting on <span className="text-ink-2">{STATUS_OWNER[po.status]}</span>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {moves.map((m) => (
            <Button
              key={m.to}
              variant={m.to === 'rejected' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => openMove(m.to, m.label)}
            >
              {m.label}
            </Button>
          ))}
          {canClear && (
            <Button size="sm" variant="primary" icon="wallet" onClick={() => openMove('accounts_cleared', 'Clear for accounts')}>
              Clear for accounts
            </Button>
          )}
          {po.financeClearedAt && (
            <Badge tone="good" icon="check">
              Cleared by Finance
            </Badge>
          )}
          {!capability.canEdit && (
            <Badge tone="neutral" icon="alert">
              View only
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Order lines"
              title={`${num(poUnits(po))} units across ${po.lines.length} products`}
              meta={`Raised by ${po.createdBy} · ${formatTimestamp(po.createdAt)}`}
            />
            <Rule />
            <PanelBody>
              <PoLines po={po} />
            </PanelBody>
          </Panel>

          {po.notes && (
            <Panel>
              <PanelHeader eyebrow="Note from the store" title="Why they asked" />
              <Rule />
              <PanelBody>
                <p className="text-[13px] leading-relaxed text-ink-2">{po.notes}</p>
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHeader eyebrow="Destination" title={location?.name ?? po.locationId} />
            <Rule />
            <PanelBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Channel', value: location ? CHANNEL_LABEL[location.channel] : '—' },
                { label: 'Region', value: location?.region ?? '—' },
                { label: 'Store code', value: location?.code ?? '—' },
                { label: 'Value', value: rm(poValue(po)) },
              ].map((f) => (
                <div key={f.label}>
                  <p className="eyebrow">{f.label}</p>
                  <p className="readout mt-1 text-[13.5px] text-ink">{f.value}</p>
                </div>
              ))}
            </PanelBody>
          </Panel>
        </div>

        <Panel className="h-fit">
          <PanelHeader eyebrow="Lifecycle" title="Where this order has been" />
          <Rule />
          <PanelBody>
            <PoTimeline po={po} />
          </PanelBody>
        </Panel>
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.label ?? ''}
        subtitle={
          pending
            ? pending.to === 'accounts_cleared'
              ? `${po.id} · ${location?.shortName ?? po.locationId} · recorded as cleared by Finance`
              : `${po.id} · ${location?.shortName ?? po.locationId} · moves to ${STATUS_LABEL[pending.to]}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.to === 'rejected' ? 'danger' : 'primary'}
              size="sm"
              onClick={confirm}
            >
              {pending?.label}
            </Button>
          </>
        }
      >
        {pending?.to === 'approved' && (
          <div className="mb-4 space-y-2.5">
            <p className="text-[12.5px] text-ink-2">
              Trim anything you cannot send in full. There is no back-order — the store re-requests
              what it still needs.
            </p>
            {po.lines.map((l) => (
              <div key={l.skuId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{skuById(l.skuId)?.label}</p>
                  <p className="text-[11px] text-ink-3">requested {num(l.qtyRequested)}</p>
                </div>
                <NumberInput
                  className="w-24"
                  min={0}
                  value={qty[l.skuId] ?? l.qtyRequested}
                  onChange={(e) =>
                    setQty((q) => ({ ...q, [l.skuId]: Math.max(0, Number(e.target.value)) }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <Field
          label={pending?.to === 'rejected' ? 'Reason' : 'Note (optional)'}
          hint={
            pending?.to === 'rejected'
              ? 'The store sees this, so say what to change before they resubmit.'
              : 'Anything the next person should know.'
          }
          error={error}
        >
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              pending?.to === 'rejected'
                ? 'Quantities above the quarter allocation — resubmit with the bestsellers only.'
                : ''
            }
          />
        </Field>

        {pending?.to === 'accounts_cleared' && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-ink-2">
            <Icon name="wallet" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            The printed order form comes out of SQL Accounting. The warehouse already has this
            order; clearing here records that accounts has it too.
          </p>
        )}
      </Modal>
    </div>
  )
}
