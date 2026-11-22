import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, Select } from './ui/Field'
import { useData } from '../store/useData'
import { skuById, skus, type Sku } from '../data/products'
import { pickerGroups } from '../lib/range'

/**
 * Remove a product (22 November: "Add, remove and adjust price option added
 * top right"), from the Stock page's Remove, or the cross on a product's row.
 * Davy, Kelly and Chloe only. Taking a line off the range is what the
 * Products page does: it leaves Record a sale, the nightly count and the
 * order list at every store, and every sale, count and order already made
 * keeps it. What was taken off is listed under it, to be put back.
 */
export function TakeOffProduct({
  open,
  onClose,
  initial,
  onDone,
}: {
  open: boolean
  onClose: () => void
  /** The line whose cross was tapped, if any. */
  initial?: Sku | null
  onDone: (message: string, tone: 'info' | 'good' | 'critical') => void
}) {
  const removeProduct = useData((s) => s.removeProduct)
  const restoreProduct = useData((s) => s.restoreProduct)
  const [skuId, setSkuId] = useState('')

  useEffect(() => {
    if (open) setSkuId(initial?.id ?? '')
  }, [open, initial])

  const onRange = skus.filter((s) => !s.removed)
  const takenOff = skus.filter((s) => s.removed)
  const chosen = skuId ? skuById(skuId) : undefined

  const takeOff = () => {
    if (!chosen) return
    const result = removeProduct(chosen.id)
    onDone(result.ok ? `${chosen.label} taken off the range` : (result.error ?? 'That did not work.'), result.ok ? 'info' : 'critical')
    if (result.ok) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={chosen ? `Take ${chosen.label} off the range?` : 'Take a product off the range'}
      subtitle="It leaves Record a sale, the nightly count and the order list, at every store. Past sales, counts and orders keep it, and it can be put back."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" size="sm" icon="x" onClick={takeOff} disabled={!chosen}>
            Take it off
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Product">
          <Select value={skuId} onChange={(e) => setSkuId(e.target.value)} aria-label="The product to take off">
            <option value="">Choose…</option>
            {pickerGroups(onRange).map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <p className="text-[12.5px] text-ink-2">
          Any stock of it still at a store stays where it is; it is simply no longer counted or sold.
        </p>

        {takenOff.length > 0 && (
          <section>
            <p className="eyebrow mb-2">Taken off · {takenOff.length}</p>
            <ul className="space-y-1.5">
              {takenOff.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-ink">{s.label}</p>
                    <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="refresh"
                    onClick={() => {
                      const result = restoreProduct(s.id)
                      onDone(
                        result.ok ? `${s.label} is back on the range` : (result.error ?? 'That did not work.'),
                        result.ok ? 'good' : 'critical',
                      )
                    }}
                  >
                    Put back
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
