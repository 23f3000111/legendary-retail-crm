import { useState } from 'react'
import { motion } from 'framer-motion'
import { seriesColor, OTHER, INK } from './palette'
import { num } from '../../lib/format'
import type { OriginSlice } from '../../store/selectors'

/**
 * The Origin Ribbon.
 *
 * One strip, laid out in proportion, widest note first — the day's customers
 * read the way a perfume house reads a fragrance, in layers. It is the app's
 * signature mark and appears on the staff screen (today, live) and on the
 * leadership screens (the whole window).
 *
 * Per the mark spec: 2px of surface between segments so adjacent fills never
 * touch, rounded outer ends, and direct labels only where a segment is wide
 * enough to hold one — the rest are named in the legend.
 */
export function OriginRibbon({
  slices,
  height = 46,
  showLabels = true,
}: {
  slices: OriginSlice[]
  height?: number
  showLabels?: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = slices.reduce((a, s) => a + s.units, 0)

  if (!total) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-[12px] text-ink-3"
        style={{ height }}
      >
        No sales recorded yet today
      </div>
    )
  }

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-xl"
        style={{ height, gap: 2, background: INK.surface }}
        role="img"
        aria-label={`Customer origins: ${slices
          .map((s) => `${s.name} ${Math.round(s.share)}%`)
          .join(', ')}`}
      >
        {slices.map((s, i) => {
          const colour = s.countryCode === 'OTHER' ? OTHER : seriesColor(i)
          const dim = hovered !== null && hovered !== s.countryCode
          // A label needs roughly 9% of the strip before it stops being a smudge.
          const roomForLabel = showLabels && s.share >= 9
          return (
            <motion.div
              key={s.countryCode}
              className="relative flex min-w-0 cursor-default items-center justify-center first:rounded-l-xl last:rounded-r-xl"
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: s.units, opacity: dim ? 0.35 : 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ background: colour, flexBasis: 0 }}
              onMouseEnter={() => setHovered(s.countryCode)}
              onMouseLeave={() => setHovered(null)}
              title={`${s.name} · ${num(s.units)} units · ${s.share.toFixed(1)}%`}
            >
              {roomForLabel && (
                <span className="truncate px-2 text-[11px] font-semibold text-white">
                  {s.flag} {Math.round(s.share)}%
                </span>
              )}
            </motion.div>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.countryCode}
            className="flex items-center gap-1.5"
            onMouseEnter={() => setHovered(s.countryCode)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.countryCode === 'OTHER' ? OTHER : seriesColor(i) }}
              aria-hidden="true"
            />
            <span className="text-[11.5px] text-ink-2">
              {s.flag} {s.name}
            </span>
            <span className="readout text-[11px] text-ink-3">{num(s.units)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The same figures as a table, for the chart frame's "Figures" view. */
export function OriginTable({ slices }: { slices: OriginSlice[] }) {
  const total = slices.reduce((a, s) => a + s.units, 0)
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line">
          {['Origin', 'Units', 'Share'].map((h, i) => (
            <th
              key={h}
              scope="col"
              className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${
                i === 0 ? 'text-left' : 'text-right'
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {slices.map((s, i) => (
          <tr key={s.countryCode} className="border-b border-line/70 last:border-0">
            <td className="py-1.5 text-[12.5px] text-ink">
              <span
                className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-middle"
                style={{ background: s.countryCode === 'OTHER' ? OTHER : seriesColor(i) }}
              />
              {s.flag} {s.name}
            </td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink">
              {num(s.units)}
            </td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">
              {s.share.toFixed(1)}%
            </td>
          </tr>
        ))}
        <tr className="border-t border-line">
          <td className="py-1.5 text-[12.5px] text-ink-2">Total</td>
          <td className="readout py-1.5 text-right text-[12.5px] text-ink">{num(total)}</td>
          <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">100.0%</td>
        </tr>
      </tbody>
    </table>
  )
}
