import { seriesColor } from './palette'
import { collections, skuById, productById } from '../../data/products'
import { num, rm } from '../../lib/format'
import type { SkuPerformance } from '../../store/selectors'

/**
 * SKU ranking. Horizontal bars because the labels are words, and words read
 * along a row. Colour encodes collection — an entity, not a rank — so filtering
 * the list never repaints the survivors.
 */
export function SkuBars({
  rows,
  metric = 'revenue',
}: {
  rows: SkuPerformance[]
  metric?: 'revenue' | 'units'
}) {
  const value = (r: SkuPerformance) => (metric === 'revenue' ? r.revenue : r.units)
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

export function SkuTable({ rows }: { rows: SkuPerformance[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line">
          {['SKU', 'Collection', 'Units', 'Revenue', 'Per day'].map((h, i) => (
            <th
              key={h}
              scope="col"
              className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${
                i >= 2 ? 'text-right' : 'text-left'
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.skuId} className="border-b border-line/70 last:border-0">
            <td className="py-1.5 text-[12.5px] text-ink">{r.label}</td>
            <td className="py-1.5 text-[12.5px] text-ink-2">{r.collection}</td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink">{num(r.units)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink">{rm(r.revenue)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">
              {r.velocity.toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
