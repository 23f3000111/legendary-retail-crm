import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/DataTable'
import { Field, TextArea } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { useToasts } from '../../components/ui/Toast'
import { OrderLines, type OrderRow } from '../../components/po/OrderLines'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { selectStock, selectSuggestedPoLines } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { skuById } from '../../data/products'
import { newOrderId } from '../../lib/ids'
import type { PurchaseOrder } from '../../data/types'

/**
 * An order made whenever the store needs one, not only when it closes the day
 * (client, 20 October).
 *
 * It starts the way the closing's order does — anything low already on it —
 * and the store adds, takes off and drags the lines into the order it wants.
 * Then it either sends it to Kelly, or saves it as a draft that only the store
 * sees, to finish and send later from My orders.
 */
export function NewOrder() {
  const navigate = useNavigate()
  const data = useData()
  const user = useCurrentUser()
  const capability = useCan()
  const createPurchaseOrder = useData((s) => s.createPurchaseOrder)
  const push = useToasts((s) => s.push)

  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  const stock = useMemo(() => (locationId ? selectStock(data, locationId) : []), [data, locationId])
  const [rows, setRows] = useState<OrderRow[]>(() =>
    locationId
      ? selectSuggestedPoLines(data, locationId).map((l) => ({ skuId: l.skuId, qty: String(l.qtyRequested) }))
      : [],
  )
  const [notes, setNotes] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || user.role !== 'promoter' || !location || !capability.canEdit) {
    return (
      <Panel>
        <EmptyState
          icon="doc"
          title="Orders are made at a store"
          body="A new order is made by the promoter at the store that needs the stock."
          action={<Button onClick={() => navigate('/orders')}>Back to the orders</Button>}
        />
      </Panel>
    )
  }

  const make = (status: 'draft' | 'submitted') => {
    setError(null)
    if (rows.length === 0) return setError('An order needs at least one item. Add one from the list.')
    const blank = rows.find((r) => !(Number(r.qty) >= 1) || !Number.isInteger(Number(r.qty)))
    if (blank) {
      return setError(`${skuById(blank.skuId)?.label ?? blank.skuId} needs a quantity — or take it off with the cross.`)
    }
    const at = new Date().toISOString()
    const po: PurchaseOrder = {
      id: newOrderId(data.today),
      locationId,
      createdBy: user.name,
      createdAt: at,
      priority: urgent ? 'urgent' : 'standard',
      notes: notes.trim(),
      status,
      lines: rows.map((r) => ({ skuId: r.skuId, qtyRequested: Number(r.qty), qtyApproved: null, qtyShipped: null })),
      events: [
        { status: 'draft', actor: user.name, role: user.role, at },
        ...(status === 'submitted'
          ? [{ status: 'submitted' as const, actor: user.name, role: user.role, at, note: notes.trim() || undefined }]
          : []),
      ],
    }
    createPurchaseOrder(po)
    push(status === 'draft' ? `${po.id} saved as a draft` : `${po.id} sent to Kelly`, 'good')
    navigate(`/orders/${po.id}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => navigate('/orders')}>
          My orders
        </Button>
      </div>
      <div>
        <p className="eyebrow">{location.name}</p>
        <h1 className="page-title mt-1">New order</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
          Ask HQ for stock now, without waiting to close the day. Send it to Kelly, or save it as a draft that only
          your store sees, and send it later from My orders.
        </p>
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Ask HQ for stock"
          title={rows.length === 0 ? 'Nothing on the order yet' : `${rows.length} on the order`}
          meta="Anything low is filled in for you. Add anything else, including vials and testers."
        />
        <Rule />
        <PanelBody className="space-y-4">
          <OrderLines rows={rows} onChange={setRows} stock={stock} />

          <button
            onClick={() => setUrgent((u) => !u)}
            aria-pressed={urgent}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] transition-colors ${
              urgent ? 'border-critical/40 bg-critical/8 text-critical' : 'border-line text-ink-2 hover:text-ink'
            }`}
          >
            <Icon name={urgent ? 'alert' : 'clock'} className="h-4 w-4 shrink-0" />
            {urgent ? 'Marked urgent — tap to make it standard' : 'Standard — tap to mark it urgent'}
          </button>

          <Field label="Note for Kelly (optional)" hint="Anything she should know before deciding. Press Enter for a new line.">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tour group booked in on Saturday." />
          </Field>

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-critical/25 bg-critical/6 px-3 py-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon="doc" onClick={() => make('draft')}>
              Save as draft
            </Button>
            <Button variant="primary" icon="check" onClick={() => make('submitted')}>
              Send to Kelly
            </Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  )
}
