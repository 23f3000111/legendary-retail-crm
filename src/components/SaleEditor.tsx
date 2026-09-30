import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button, IconButton } from './ui/Button'
import { NumberInput, Select } from './ui/Field'
import { Flag } from './ui/Flag'
import { Icon } from './ui/icons'
import { CountryPicker } from './CountryPicker'
import { countryByCode, MALAYSIA_SEGMENT_LABEL, type MalaysiaSegment } from '../data/countries'
import {
  lineUnitPrice,
  priceAtTier,
  products,
  sellableSkus,
  skuById,
  tiersFor,
  TIER_LABEL,
  type PriceBasis,
  type PriceTier,
} from '../data/products'
import { money, toSen } from '../lib/changes'
import type { Result } from '../api/backend'
import type { SaleLine } from '../data/types'

export interface SaleDraft {
  lines: SaleLine[]
  countryCode?: string
  segment?: MalaysiaSegment
}

interface Row {
  key: string
  /** The line as it was, so what is not changed here survives: its id, who rang it up, when. */
  line: SaleLine
  skuId: string
  tier: PriceTier
  qty: number
  /** The price typed for "Other", kept as text so the box can be cleared and retyped. */
  other: string
}

let blankSeq = 0
const blankRow = (basis: PriceBasis): Row => ({
  key: `new-${(blankSeq += 1)}`,
  line: { skuId: '', qty: 1 },
  skuId: '',
  tier: basis,
  qty: 1,
  other: '',
})

const toRow = (l: SaleLine, basis: PriceBasis, i: number): Row => ({
  key: l.id ?? `row-${i}`,
  line: l,
  skuId: l.skuId,
  tier: l.priceTier ?? basis,
  qty: l.qty,
  other: l.priceTier === 'other' && l.unitPriceMYR ? String(l.unitPriceMYR) : '',
})

/**
 * The line a row stands for now. A line nobody touched comes back exactly as
 * it was, and the price it was rung up at is kept unless the item or the price
 * was changed — so an edit never quietly re-prices the rest of a sale.
 */
const fromRow = (r: Row, basis: PriceBasis): SaleLine => {
  const was = r.line
  if (r.skuId === was.skuId && r.tier === (was.priceTier ?? basis) && r.tier !== 'other') {
    return r.qty === was.qty ? was : { ...was, qty: r.qty }
  }
  const unitPriceMYR = r.tier === 'other' ? toSen(Number(r.other) || 0) : priceAtTier(skuById(r.skuId), r.tier)
  return { ...was, skuId: r.skuId, qty: r.qty, priceTier: r.tier, unitPriceMYR }
}

/**
 * One sale, opened the way it was rung up.
 *
 * Everything is already filled in — the items, their prices, how many, where
 * the customer is from — so fixing a slip is changing the one thing that is
 * wrong: the other bottle, the retail price instead of the promotion, one
 * instead of two, Singapore instead of China. The client asked for exactly
 * this: nothing typed twice.
 *
 * The same editor is used at the counter, where saving changes the sale at
 * once, and inside a closing being corrected, where it changes the draft that
 * goes to Kelly. It does not know which: `onSave` decides.
 */
export function SaleEditor({
  open,
  onClose,
  title,
  subtitle,
  initial,
  basis,
  needsCountry,
  onSave,
  onDelete,
  saveLabel = 'Save changes',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  initial: SaleDraft
  basis: PriceBasis
  needsCountry: boolean
  onSave: (draft: SaleDraft) => Result
  /** Offered when the sale already exists. */
  onDelete?: () => void
  saveLabel?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [countryCode, setCountryCode] = useState<string | undefined>()
  const [segment, setSegment] = useState<MalaysiaSegment | undefined>()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Start from what is on record every time it opens — and only then, so a
  // refresh from the server mid-edit cannot throw away what was typed.
  useEffect(() => {
    if (!open) return
    setRows(initial.lines.length ? initial.lines.map((l, i) => toRow(l, basis, i)) : [blankRow(basis)])
    setCountryCode(initial.countryCode)
    setSegment(initial.segment)
    setError(null)
    setConfirmDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const priceOfRow = (r: Row): number => (r.skuId ? lineUnitPrice(fromRow(r, basis), basis) : 0)
  const total = rows.reduce((a, r) => a + r.qty * priceOfRow(r), 0)
  const country = countryCode ? countryByCode(countryCode) : undefined

  const save = () => {
    setError(null)
    if (rows.length === 0) return setError('Add at least one item — or delete the sale.')
    if (rows.some((r) => !r.skuId)) return setError('Choose the item on every line, or take the empty line off.')
    const noPrice = rows.find((r) => r.tier === 'other' && !(Number(r.other) > 0))
    if (noPrice) return setError(`Type what ${skuById(noPrice.skuId)?.label ?? 'it'} went for.`)
    if (needsCountry && !countryCode) return setError('Choose where the customer is from.')
    const result = onSave({
      lines: rows.map((r) => fromRow(r, basis)),
      countryCode,
      segment: countryCode === 'MY' ? segment : undefined,
    })
    if (!result.ok) return setError(result.error ?? 'That could not be saved.')
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        width="max-w-xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  onDelete()
                  onClose()
                }}
              >
                {confirmDelete ? 'Tap again to delete' : 'Delete sale'}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save}>
                {saveLabel} · {money(total)}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {rows.map((r) => {
            const sku = skuById(r.skuId)
            return (
              <div key={r.key} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      aria-label="Item"
                      value={r.skuId}
                      // A different item starts at the store's usual price.
                      onChange={(e) => update(r.key, { skuId: e.target.value, tier: basis, other: '' })}
                    >
                      <option value="">Choose an item…</option>
                      {products.map((p) => {
                        const variants = sellableSkus.filter((s) => s.productId === p.id)
                        if (!variants.length) return null
                        return (
                          <optgroup key={p.id} label={p.name}>
                            {variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </Select>
                  </div>
                  <IconButton
                    name="x"
                    label="Take this item off the sale"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  />
                </div>

                {sku && (
                  <>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {tiersFor(sku, basis).map((t) => (
                        <button
                          key={t}
                          onClick={() => update(r.key, { tier: t })}
                          aria-pressed={r.tier === t}
                          className={`min-h-[36px] rounded-lg border px-2.5 text-[12px] transition-colors ${
                            r.tier === t
                              ? 'border-primary bg-primary/14 font-semibold text-primary'
                              : 'border-line bg-surface text-ink-2 hover:border-primary/45'
                          }`}
                        >
                          {TIER_LABEL[t]}
                          {t === 'other' ? '' : ` · ${money(priceAtTier(sku, t))}`}
                        </button>
                      ))}
                    </div>
                    {r.tier === 'other' && (
                      <div className="mt-2 w-44">
                        <NumberInput
                          aria-label={`Price for one ${sku.label}`}
                          prefix="RM"
                          min={0}
                          value={r.other}
                          onChange={(e) => update(r.key, { other: e.target.value })}
                          placeholder="Price for one"
                        />
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center gap-2">
                      <IconButton
                        name="minus"
                        label="One fewer"
                        onClick={() => update(r.key, { qty: Math.max(1, r.qty - 1) })}
                        className="h-10 w-10 border border-line bg-surface"
                      />
                      <span className="readout w-8 text-center font-display text-[18px] font-semibold text-ink">
                        {r.qty}
                      </span>
                      <IconButton
                        name="plus"
                        label="One more"
                        onClick={() => update(r.key, { qty: r.qty + 1 })}
                        className="h-10 w-10 border border-primary/40 bg-primary/10 text-primary"
                      />
                      <span className="readout ml-auto text-[13px] text-ink-2">
                        {money(r.qty * priceOfRow(r))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          <Button variant="secondary" size="sm" icon="plus" onClick={() => setRows((rs) => [...rs, blankRow(basis)])}>
            Add another item
          </Button>

          {needsCountry && (
            <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Customer from</p>
                <p className="mt-1 flex items-center gap-2 text-[13.5px] text-ink">
                  {country ? (
                    <>
                      <Flag code={country.code} size={18} />
                      {country.name}
                      {countryCode === 'MY' && segment ? ` · ${MALAYSIA_SEGMENT_LABEL[segment]}` : ''}
                    </>
                  ) : (
                    <span className="text-ink-3">Not recorded</span>
                  )}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
                Change
              </Button>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-critical/25 bg-critical/6 px-3 py-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      </Modal>

      <CountryPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(code, seg) => {
          setCountryCode(code)
          setSegment(seg)
          setPicking(false)
        }}
      />
    </>
  )
}
