import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, TextArea } from '../ui/Field'
import { Icon } from '../ui/icons'
import { skuById } from '../../data/products'
import { OrderLines, type OrderRow } from './OrderLines'
import type { Result } from '../../api/backend'
import type { PurchaseOrder } from '../../data/types'


/**
 * An order, opened the way it was sent.
 *
 * While Kelly has not decided, the store that asked — or Kelly herself — can
 * change what is on it, how many, the note, and whether it is urgent, without
 * starting again. After Kelly has turned it down, the store changes it here and
 * sends it back to her. Once approved it is the warehouse's to work from, and
 * no longer changes.
 */
export function OrderEditor({
  open,
  onClose,
  po,
  resend,
  draft = false,
  forApprover = false,
  onSave,
}: {
  open: boolean
  onClose: () => void
  po: PurchaseOrder
  /** Turned down by Kelly: saving sends it to her again. */
  resend: boolean
  /** Not sent yet: saving keeps it a draft. */
  draft?: boolean
  /** Kelly or Davy changing it themselves, before they decide. */
  forApprover?: boolean
  onSave: (args: {
    lines: { skuId: string; qty: number }[]
    notes: string
    priority: PurchaseOrder['priority']
  }) => Result
}) {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [urgent, setUrgent] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // What is on record, each time it opens.
  useEffect(() => {
    if (!open) return
    setRows(po.lines.map((l) => ({ skuId: l.skuId, qty: String(l.qtyRequested) })))
    setUrgent(po.priority === 'urgent')
    setNotes(po.notes ?? '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = () => {
    setError(null)
    if (rows.length === 0) return setError('An order needs at least one item.')
    const blank = rows.find((r) => !(Number(r.qty) >= 1) || !Number.isInteger(Number(r.qty)))
    if (blank) {
      return setError(`${skuById(blank.skuId)?.label ?? blank.skuId} needs a quantity — or take it off with the cross.`)
    }
    const result = onSave({
      lines: rows.map((r) => ({ skuId: r.skuId, qty: Number(r.qty) })),
      notes: notes.trim(),
      priority: urgent ? 'urgent' : 'standard',
    })
    if (!result.ok) return setError(result.error ?? 'That could not be saved.')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resend ? `Change ${po.id} and send it again` : draft ? `Change the draft ${po.id}` : `Change ${po.id}`}
      subtitle={
        resend
          ? 'Kelly turned this down. Change what she asked for, and it goes back to her.'
          : draft
            ? 'It stays a draft, seen only by your store, until you send it.'
            : forApprover
            ? 'Everything is as the store sent it. Change what you need, then approve it — the store sees what you changed.'
            : 'Everything is as it was sent. Change only what is wrong — Kelly sees the new version.'
      }
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon="check" onClick={save}>
            {resend ? 'Send to Kelly again' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <OrderLines rows={rows} onChange={setRows} />

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

        <Field
          label={forApprover ? 'Note (optional)' : 'Note for Kelly (optional)'}
          hint="Press Enter for a new line."
        >
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tour group booked in on Saturday." />
        </Field>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-critical/25 bg-critical/6 px-3 py-2 text-[12.5px] text-critical">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
