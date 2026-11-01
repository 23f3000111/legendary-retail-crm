import { useMemo } from 'react'
import { seriesColor } from './palette'
import { collections, skuById, productById } from '../../data/products'
import { totalOf, usePaged } from '../ui/LoadMore'
import { Dash, WindowFigure, WindowsTable } from '../WindowsTable'
import { num, rm } from '../../lib/format'
import type { SalesWindow, SkuPerformance, SkuSales, SkuSalesRow } from '../../store/selectors'

/** What a bar needs: the product, and what it sold. */
type SkuBar = Pick<SkuPerformance, 'skuId' | 'label' | 'units' | 'revenue'>

/**
 * SKU ranking. Horizontal bars because the labels are words, and words read
 * along a row. Colour encodes collection — an entity, not a rank — so filtering
 * the list never repaints the survivors.
 */
export function SkuBars({
  rows,
  metric = 'revenue',
}: {
  rows: SkuBar[]
  metric?: 'revenue' | 'units'
}) {
  const value = (r: SkuBar) => (metric === 'revenue' ? r.revenue : r.units)
  const max = Math.max(1, ...rows.map(value))
  const format = metric === 'revenue' ? (n: number) => rm(n) : (n: number) => `${num(n)} units`

  const colourFor = (skuId: string) => {
    const collectionId = productById(skuById(skuId)?.productId ?? '')?.collectionId
    const slot = collections.find((c) => c.id === collectionId)?.slot ?? 1
    return seriesColor(slot - 1)
  }

  return (
    // Rows share the frame height evenly rather than overflowing it, so the last
    // SKU is never cut in half by the panel edge.
    <div className="flex h-full flex-col justify-between gap-1 pr-1">
      {rows.map((r) => (
        <div key={r.skuId} className="group grid grid-cols-[140px_1fr_auto] items-center gap-3">
          <span className="truncate text-[12px] text-ink-2 group-hover:text-ink" title={r.label}>{r.label}</span>
          <div className="h-[14px] w-full rounded-full bg-sunken">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-luxe"
              style={{ width: `${(value(r) / max) * 100}%`, background: colourFor(r.skuId) }}
              title={`${r.label} · ${format(value(r))}`}
            />
          </div>
          <span className="readout w-[84px] text-right text-[11.5px] font-medium text-ink">
            {metric === 'revenue' ? rm(r.revenue) : num(r.units)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The same figures as a table, with a total at the foot of every column. The
 * collection column was taken off at the client's request (1 November). With
 * `page`, it shows that many products at a time, and the total counts them all.
 */
export function SkuTable({
  rows,
  totalLabel = 'Total',
  page,
}: {
  rows: SkuPerformance[]
  /** "Top 12 total", where the table shows only the first few. */
  totalLabel?: string
  page?: number
}) {
  const { visible, partial, more } = usePaged(rows, { page })
  const units = rows.reduce((a, r) => a + r.units, 0)
  const revenue = rows.reduce((a, r) => a + r.revenue, 0)
  const perDay = rows.reduce((a, r) => a + r.velocity, 0)
  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {['SKU', 'Units', 'Revenue', 'Per day'].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${
                  i >= 1 ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.skuId} className="border-b border-line/70 last:border-0">
              <td className="py-1.5 text-[12.5px] text-ink">{r.label}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink">{num(r.units)}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink">{rm(r.revenue)}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">
                {r.velocity.toFixed(1)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-1.5 text-[12.5px] font-semibold text-ink-2">{totalOf(partial, rows.length, totalLabel)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] font-semibold text-ink">{num(units)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] font-semibold text-ink">{rm(revenue)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">{perDay.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
      {more}
    </>
  )
}

/**
 * Every product by the four boxes' windows and the page's own dates (asked on
 * 1 November, after Revision 9): its sales and its units in each, with the
 * measure chosen leading and the products ranked by it, ten at a time.
 */
export function SkuWindowsTable({
  rows,
  metric = 'revenue',
  chosen,
  pageKey,
}: {
  rows: SkuSalesRow[]
  metric?: 'revenue' | 'units'
  /** The page's own dates, in words, for the last column. */
  chosen: string
  pageKey?: string
}) {
  // The rows come best month so far first, by sales; units re-rank them.
  const sorted = useMemo(
    () =>
      metric === 'revenue'
        ? rows
        : [...rows].sort(
            (a, b) =>
              b.monthToDate.units - a.monthToDate.units ||
              b.lastMonth.units - a.lastMonth.units ||
              b.chosen.units - a.chosen.units,
          ),
    [rows, metric],
  )
  const figure = (s: SkuSales, strong = false) => {
    if (s.units === 0 && s.revenue === 0) return <Dash />
    const units = `${num(s.units)} ${s.units === 1 ? 'unit' : 'units'}`
    return metric === 'revenue' ? (
      <WindowFigure lead={rm(s.revenue)} sub={units} strong={strong} />
    ) : (
      <WindowFigure lead={units} sub={rm(s.revenue)} strong={strong} />
    )
  }
  const total = (w: SalesWindow): SkuSales =>
    rows.reduce((a, r) => ({ units: a.units + r[w].units, revenue: a.revenue + r[w].revenue }), { units: 0, revenue: 0 })
  return (
    <WindowsTable<SkuSalesRow>
      rows={sorted}
      rowKey={(r) => r.skuId}
      chosen={chosen}
      pageKey={pageKey}
      empty="No product sold in these windows."
      // Wide enough on a phone that a name takes two lines, not four.
      first={{ header: 'Product', render: (r) => <span className="block min-w-[120px]">{r.label}</span> }}
      cell={(r, w) => figure(r[w], w === 'monthToDate')}
      total={(w) => figure(total(w))}
    />
  )
}
