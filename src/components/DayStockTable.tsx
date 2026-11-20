import { useMemo, useState } from 'react'
import { Badge } from './ui/Badge'
import { DataTable, type Column } from './ui/DataTable'
import { Icon } from './ui/icons'
import { Modal } from './ui/Modal'
import { StockItemDetail } from './StockItemDetail'
import { useData } from '../store/useData'
import { selectStock, type StoreDayRow } from '../store/selectors'
import { locationById } from '../data/locations'
import { TIER_LABEL } from '../data/products'
import { num, rm } from '../lib/format'

/**
 * A store's day, product by product: the price each went for, what the day
 * took off the shelf, what it sold, and the count at the close. On a store's
 * page (Revision 10), and on the promoter's own closing (20 November: "so that
 * they can refer back the deducted stocks and sales of the day"). Tap a
 * product to see what came in and what went out.
 */
export function DayStockTable({
  locationId,
  rows,
  onHandHeader = 'On hand at close',
}: {
  locationId: string
  rows: StoreDayRow[]
  onHandHeader?: string
}) {
  const data = useData()
  const store = locationById(locationId)
  const [item, setItem] = useState<StoreDayRow | null>(null)
  const stockRow = useMemo(
    () => (item ? selectStock(data, locationId).find((r) => r.skuId === item.skuId) : undefined),
    [data, locationId, item],
  )

  const counted = rows.some((r) => r.onHand !== null)
  const totals = {
    deducted: rows.reduce((a, r) => a + r.deducted, 0),
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    onHand: rows.reduce((a, r) => a + (r.onHand ?? 0), 0),
  }

  const columns: Column<StoreDayRow>[] = [
    {
      key: 'label',
      header: 'Product',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{r.label}</p>
          <p className="readout text-[11px] text-ink-3">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '150px',
      render: (r) => (
        <span className="inline-flex flex-col items-end gap-1">
          {r.prices.map((p) => (
            <span key={`${p.tier}:${p.unitPrice}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {/* Labelled the way the sale is, where it is not the store's own price. */}
              {p.tier !== store?.priceBasis && p.tier !== 'foc' && <Badge tone="neutral">{TIER_LABEL[p.tier]}</Badge>}
              <span className="readout text-[12.5px] text-ink-2">{p.tier === 'foc' ? 'FOC' : rm(p.unitPrice)}</span>
              {p.qty > 0 && <span className="readout text-[11px] text-ink-3">×{num(p.qty)}</span>}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'deducted',
      header: 'Deducted',
      align: 'right',
      width: '90px',
      render: (r) => (
        <span className={`readout text-[12.5px] ${r.deducted ? 'font-semibold text-ink' : 'text-ink-3'}`}>
          {r.deducted ? `−${num(r.deducted)}` : '0'}
        </span>
      ),
      total: totals.deducted ? `−${num(totals.deducted)}` : '0',
    },
    {
      key: 'sales',
      header: 'Sales',
      align: 'right',
      width: '100px',
      render: (r) => (
        <span className={`readout text-[12.5px] ${r.revenue ? 'text-ink' : 'text-ink-3'}`}>{r.units ? rm(r.revenue) : '—'}</span>
      ),
      total: rm(totals.revenue),
    },
    {
      key: 'onHand',
      header: onHandHeader,
      align: 'right',
      width: '110px',
      render: (r) => (
        <span className="readout text-[13px] font-semibold text-ink">{r.onHand === null ? '—' : num(r.onHand)}</span>
      ),
      total: counted ? num(totals.onHand) : undefined,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: '36px',
      render: () => <Icon name="chevronRight" className="ml-auto h-3.5 w-3.5 text-ink-3" />,
    },
  ]

  /** "Promotion 2 RM 198 ×44 · RM 188 ×6", for the phone's cards. */
  const pricesInWords = (r: StoreDayRow) =>
    r.prices
      .map(
        (p) =>
          `${p.tier !== store?.priceBasis && p.tier !== 'foc' ? `${TIER_LABEL[p.tier]} ` : ''}${p.tier === 'foc' ? 'FOC' : rm(p.unitPrice)}${
            p.qty > 0 ? ` ×${num(p.qty)}` : ''
          }`,
      )
      .join(' · ')

  return (
    <>
      {/* Phone: one card a product, everything in view without scrolling sideways. */}
      <ul className="space-y-1.5 sm:hidden">
        {rows.map((r) => (
          <li key={r.skuId}>
            <button
              onClick={() => setItem(r)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left transition-colors hover:border-primary/35"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-tight text-ink">{r.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{pricesInWords(r)}</p>
                <p className="readout mt-0.5 text-[11.5px] text-ink-2">
                  {r.deducted ? <span className="font-semibold text-ink">−{num(r.deducted)}</span> : '0'} deducted
                  {r.units ? ` · ${rm(r.revenue)}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="readout text-[15px] font-semibold text-ink">{r.onHand === null ? '—' : num(r.onHand)}</p>
                <p className="text-[9.5px] font-semibold uppercase tracking-wide2 text-ink-3">{onHandHeader}</p>
              </div>
            </button>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 pt-1.5 text-[12px] font-semibold text-ink-2">
          <span>Total · {num(rows.length)} products</span>
          <span className="readout text-ink">
            {totals.deducted ? `−${num(totals.deducted)}` : '0'} · {rm(totals.revenue)}
            {counted ? ` · ${num(totals.onHand)}` : ''}
          </span>
        </li>
      </ul>

      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.skuId}
          dense
          onRowClick={setItem}
          totalLabel={`Total · ${num(rows.length)} products`}
        />
      </div>
      <Modal
        open={item !== null}
        onClose={() => setItem(null)}
        title={item?.label ?? ''}
        subtitle={item && stockRow ? `${item.code} · ${num(stockRow.onHand)} on the shelf at ${store?.shortName ?? ''} now` : undefined}
        width="max-w-lg"
      >
        {item && stockRow && <StockItemDetail locationId={locationId} skuId={item.skuId} row={stockRow} />}
      </Modal>
    </>
  )
}
