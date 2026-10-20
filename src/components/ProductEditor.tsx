import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { ChipToggle, Field, NumberInput, Select, TextInput } from './ui/Field'
import { Icon } from './ui/icons'
import { useData } from '../store/useData'
import { collections, products, VARIANT_LABEL, type CollectionId, type Sku, type Variant } from '../data/products'
import { moneyInput } from '../lib/format'

const NEW = '__new'

const KINDS: { value: Variant; label: string }[] = [
  { value: 'retail', label: VARIANT_LABEL.retail },
  { value: 'set', label: VARIANT_LABEL.set },
  { value: 'travel', label: VARIANT_LABEL.travel },
  { value: 'vial', label: 'Vial — given free' },
  { value: 'tester', label: 'Tester — ordered, never sold' },
]

/**
 * Adding a product to the range, or changing one's prices and reorder level
 * (client, 20 October). Davy, Kelly and Chloe only.
 *
 * A new line is a size or kit of a fragrance already on the range, or the
 * first line of a new fragrance. Once it is on the range, what it is stays as
 * it was — every sale, count and order names it — and only its prices, its
 * reorder level and its case size change.
 */
export function ProductEditor({
  open,
  onClose,
  sku,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** The line being changed; none for a new one. */
  sku?: Sku
  onSaved: (message: string) => void
}) {
  const saveProduct = useData((s) => s.saveProduct)
  const [productId, setProductId] = useState('')
  const [name, setName] = useState('')
  const [collectionId, setCollectionId] = useState<CollectionId>('signature')
  const [variant, setVariant] = useState<Variant>('retail')
  const [size, setSize] = useState('')
  const [retail, setRetail] = useState('')
  const [promotion, setPromotion] = useState('')
  const [promotion2, setPromotion2] = useState('')
  const [p2Touched, setP2Touched] = useState(false)
  const [canGoFree, setCanGoFree] = useState(false)
  const [reorder, setReorder] = useState('24')
  const [caseSize, setCaseSize] = useState('12')
  const [error, setError] = useState<string | null>(null)

  // What is on record each time it opens, or a blank form for a new one.
  useEffect(() => {
    if (!open) return
    setProductId(sku?.productId ?? '')
    setName('')
    setCollectionId('signature')
    setVariant(sku?.variant ?? 'retail')
    setSize(sku?.size ?? '')
    setRetail(sku ? moneyInput(sku.retailPriceMYR) : '')
    setPromotion(sku ? moneyInput(sku.promotionPriceMYR) : '')
    setPromotion2(sku?.promotion2MYR ? moneyInput(sku.promotion2MYR) : '')
    setP2Touched(Boolean(sku))
    setCanGoFree(Boolean(sku?.canGoFree))
    setReorder(String(sku?.reorderPoint ?? 24))
    setCaseSize(String(sku?.caseSize ?? 12))
    setError(null)
  }, [open, sku])

  const priced = variant !== 'vial' && variant !== 'tester'

  const save = () => {
    setError(null)
    const number = (v: string) => (v.trim() === '' ? NaN : Number(v))
    const result = saveProduct({
      ...(sku
        ? { skuId: sku.id }
        : productId === NEW
          ? { newProduct: { name, collectionId }, variant, size }
          : { productId, variant, size }),
      retailPriceMYR: priced ? number(retail) : 0,
      promotionPriceMYR: priced ? number(promotion) : 0,
      promotion2MYR: priced && promotion2.trim() ? Number(promotion2) : null,
      canGoFree: priced && canGoFree,
      reorderPoint: number(reorder),
      caseSize: number(caseSize),
    })
    if (!result.ok) return setError(result.error ?? 'That could not be saved.')
    onSaved(sku ? `${sku.label} changed` : 'Product added to the range')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sku ? `Change ${sku.label}` : 'Add a product'}
      subtitle={
        sku
          ? 'Its prices, reorder level and case size. Sales already made keep the price they went at.'
          : 'It goes on Record a sale, the nightly count and the order list as soon as it is saved.'
      }
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon="check" onClick={save}>
            {sku ? 'Save changes' : 'Add to the range'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!sku && (
          <>
            <Field label="Fragrance">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Choose…</option>
                {collections.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {products
                      .filter((p) => p.collectionId === c.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value={NEW}>A new fragrance…</option>
              </Select>
            </Field>
            {productId === NEW && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Its name">
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Jasmine" />
                </Field>
                <Field label="Collection">
                  <Select value={collectionId} onChange={(e) => setCollectionId(e.target.value as CollectionId)}>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kind">
                <Select value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {variant !== 'vial' && (
                <Field label="Size" hint="As the counter should read it: 30ml, Set (new), Travel Kit.">
                  <TextInput value={size} onChange={(e) => setSize(e.target.value)} placeholder="30ml" />
                </Field>
              )}
            </div>
          </>
        )}

        {priced ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Promotion">
              <NumberInput
                prefix="RM"
                min={0}
                step="any"
                value={promotion}
                onChange={(e) => {
                  setPromotion(e.target.value)
                  // Everything at RM 188 also goes at RM 198 (client, 15 October).
                  if (!p2Touched) setPromotion2(Number(e.target.value) === 188 ? '198' : '')
                }}
              />
            </Field>
            <Field label="Retail">
              <NumberInput prefix="RM" min={0} step="any" value={retail} onChange={(e) => setRetail(e.target.value)} />
            </Field>
            <Field label="Promotion 2" hint="Optional.">
              <NumberInput
                prefix="RM"
                min={0}
                step="any"
                value={promotion2}
                onChange={(e) => {
                  setP2Touched(true)
                  setPromotion2(e.target.value)
                }}
              />
            </Field>
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
            {variant === 'vial'
              ? 'A vial has no price: it is given free, and counted every night.'
              : 'A tester has no price: it is ordered for the counter, and never sold or counted.'}
          </p>
        )}

        {priced && (
          <ChipToggle
            label="Can also be given free (FOC), like the Wishes"
            active={canGoFree}
            onClick={() => setCanGoFree((v) => !v)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reorder at" hint="A store is told to top up at or below this.">
            <NumberInput min={0} step={1} value={reorder} onChange={(e) => setReorder(e.target.value)} />
          </Field>
          <Field label="Case size" hint="The warehouse sends this many at a time.">
            <NumberInput min={1} step={1} value={caseSize} onChange={(e) => setCaseSize(e.target.value)} />
          </Field>
        </div>

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
