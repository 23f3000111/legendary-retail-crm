import { useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Field, NumberInput, Select } from '../ui/Field'
import { Icon } from '../ui/icons'
import { OrderableOptions } from './OrderableOptions'
import { skuById } from '../../data/products'
import { num } from '../../lib/format'
import type { StockRow } from '../../store/selectors'

export interface OrderRow {
  skuId: string
  /** The text in the box, so it can be cleared and retyped without the line vanishing. */
  qty: string
}

/** The lines that will actually be sent, in the order the store put them: those with a quantity. */
export const linesToSend = (rows: OrderRow[]): { skuId: string; qty: number }[] =>
  rows
    .map((r) => ({ skuId: r.skuId, qty: Math.max(0, Math.floor(Number(r.qty)) || 0) }))
    .filter((l) => l.qty > 0)

/**
 * The lines of an order, as the store builds it: anything low already on it,
 * anything else added from the picker, each with its quantity and a cross.
 *
 * Every line can be dragged by its handle into the order the store wants
 * them in (client, 20 October), and the order is sent that way. The handle
 * also answers the arrow keys, for a keyboard.
 */
export function OrderLines({
  rows,
  onChange,
  stock,
  disabled = false,
}: {
  rows: OrderRow[]
  onChange: (rows: OrderRow[]) => void
  /** The store's shelf, for "19 on hand · reorder at 24" and the low and out badges. */
  stock?: StockRow[]
  disabled?: boolean
}) {
  const [addSku, setAddSku] = useState('')

  const add = () => {
    if (!addSku) return
    const caseSize = skuById(addSku)?.caseSize ?? 12
    onChange(
      rows.some((r) => r.skuId === addSku)
        ? rows.map((r) => (r.skuId === addSku ? { ...r, qty: String((Number(r.qty) || 0) + caseSize) } : r))
        : [...rows, { skuId: addSku, qty: String(caseSize) }],
    )
    setAddSku('')
  }

  const move = (skuId: string, by: -1 | 1) => {
    const from = rows.findIndex((r) => r.skuId === skuId)
    const to = from + by
    if (from < 0 || to < 0 || to >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add something else" className="min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[220px]">
          <Select value={addSku} onChange={(e) => setAddSku(e.target.value)} disabled={disabled}>
            <option value="">Choose a product…</option>
            <OrderableOptions />
          </Select>
        </Field>
        <Button variant="secondary" icon="plus" className="w-full sm:w-auto" disabled={disabled || !addSku} onClick={add}>
          Add
        </Button>
      </div>

      {rows.length > 1 && !disabled && (
        <p className="text-[11.5px] text-ink-3">Drag a line by its handle to change the order the items are listed in.</p>
      )}

      <Reorder.Group
        as="ul"
        axis="y"
        values={rows.map((r) => r.skuId)}
        onReorder={(ids: string[]) => onChange(ids.map((id) => rows.find((r) => r.skuId === id)!))}
        className="space-y-2"
      >
        {rows.map((r, i) => (
          <OrderLine
            key={r.skuId}
            row={r}
            first={i === 0}
            last={i === rows.length - 1}
            stockRow={stock?.find((s) => s.skuId === r.skuId)}
            counted={Boolean(stock)}
            disabled={disabled}
            onQty={(qty) => onChange(rows.map((x) => (x.skuId === r.skuId ? { ...x, qty } : x)))}
            onRemove={() => onChange(rows.filter((x) => x.skuId !== r.skuId))}
            onMove={(by) => move(r.skuId, by)}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}

function OrderLine({
  row,
  first,
  last,
  stockRow,
  counted,
  disabled,
  onQty,
  onRemove,
  onMove,
}: {
  row: OrderRow
  first: boolean
  last: boolean
  stockRow?: StockRow
  /** Whether the shelf was given at all — on a closing it is, when changing an order it is not. */
  counted: boolean
  disabled: boolean
  onQty: (qty: string) => void
  onRemove: () => void
  onMove: (by: -1 | 1) => void
}) {
  const controls = useDragControls()
  const sku = skuById(row.skuId)
  const label = sku?.label ?? row.skuId
  const blank = !(Number(row.qty) > 0)

  return (
    <Reorder.Item
      as="li"
      value={row.skuId}
      dragListener={false}
      dragControls={controls}
      className={`relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border py-3 pl-1.5 pr-3.5 ${
        blank && !disabled ? 'border-warn/50 bg-warn/5' : 'border-line bg-surface-2'
      }`}
    >
      <button
        type="button"
        aria-label={`Move ${label}: drag, or use the arrow keys`}
        title="Drag to move"
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return
          e.preventDefault()
          controls.start(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' && !first) {
            e.preventDefault()
            onMove(-1)
          }
          if (e.key === 'ArrowDown' && !last) {
            e.preventDefault()
            onMove(1)
          }
        }}
        style={{ touchAction: 'none' }}
        className="flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
      >
        <Icon name="grip" className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 basis-[60%] sm:basis-0 sm:min-w-[160px]">
        <p className="text-[13px] text-ink">{label}</p>
        {counted && (
          <p className="text-[11px] text-ink-3">
            {stockRow
              ? stockRow.counted
                ? `${num(stockRow.onHand)} on hand · reorder at ${num(stockRow.reorderPoint)}`
                : `No count filed yet · reorder at ${num(stockRow.reorderPoint)}`
              : 'Tester — not counted on the shelf'}
          </p>
        )}
        {!counted && (sku?.variant === 'tester' || sku?.variant === 'vial') && (
          <p className="text-[11px] text-ink-3">{sku.variant === 'vial' ? 'Vial' : 'Tester'}</p>
        )}
      </div>
      {stockRow && stockRow.status !== 'ok' && (
        <Badge tone={stockRow.status === 'low' ? 'warn' : 'critical'} icon="alert">
          {stockRow.status === 'out' ? 'Out of stock' : stockRow.status === 'critical' ? 'Very low' : 'Low'}
        </Badge>
      )}
      {counted && sku?.variant === 'tester' && <Badge tone="active">Tester</Badge>}
      {counted && sku?.variant === 'vial' && <Badge tone="active">Vial</Badge>}
      <div className="ml-auto flex items-center gap-2">
        <div className="w-24">
          <NumberInput
            aria-label={`Units of ${label} to order`}
            min={0}
            step={sku?.caseSize ?? 12}
            value={row.qty}
            placeholder="0"
            onChange={(e) => onQty(e.target.value)}
            disabled={disabled}
          />
        </div>
        <IconButton name="x" label={`Take ${sku?.label ?? 'this'} off the order`} onClick={onRemove} />
      </div>
    </Reorder.Item>
  )
}
