import { useState } from 'react'
import { motion } from 'framer-motion'
import { seriesColor, OTHER, INK } from './palette'
import { num, rm } from '../../lib/format'
import { Flag } from '../ui/Flag'
import { Dash, WindowFigure, WindowsTable } from '../WindowsTable'
import type { OriginSales, OriginSalesRow, OriginSlice, SalesWindow } from '../../store/selectors'

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
  // By customer, not by bottle (client, 1 November).
  const total = slices.reduce((a, s) => a + s.customers, 0)

  if (!total) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-[12px] text-ink-3"
        style={{ height }}
      >
        No customers recorded for these days
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
              animate={{ flexGrow: s.customers, opacity: dim ? 0.35 : 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ background: colour, flexBasis: 0 }}
              onMouseEnter={() => setHovered(s.countryCode)}
              onMouseLeave={() => setHovered(null)}
              title={`${s.name} · ${num(s.customers)} ${s.customers === 1 ? 'customer' : 'customers'} · ${num(s.units)} units · ${s.share.toFixed(1)}%`}
            >
              {roomForLabel && (
                <span className="flex items-center gap-1 truncate px-2 text-[11px] font-semibold text-white">
                  <Flag code={s.countryCode} size={14} alt={s.name} fallback={s.flag} />
                  {Math.round(s.share)}%
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
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
              <Flag code={s.countryCode} size={14} fallback={s.flag} />
              {s.name}
            </span>
            <span className="readout text-[11px] text-ink-3" title={`${num(s.customers)} customers`}>
              {num(s.customers)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The same figures as a table: customers first, then what they bought and
 * what it came to (client, 1 November), with a total at the foot of every
 * column. With `onSelect`, a country opens its own breakdown.
 */
export function OriginTable({
  slices,
  onSelect,
}: {
  slices: OriginSlice[]
  onSelect?: (countryCode: string) => void
}) {
  const total = (k: 'customers' | 'units' | 'revenue') => slices.reduce((a, s) => a + s[k], 0)
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line">
          {['Origin', 'Customers', 'Units', 'Sales', 'Share'].map((h, i) => (
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
        {slices.map((s, i) => {
          const name = (
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: s.countryCode === 'OTHER' ? OTHER : seriesColor(i) }}
              />
              <Flag code={s.countryCode} size={16} fallback={s.flag} />
              {s.name}
            </span>
          )
          // The whole row takes the tap, which is kinder on a phone; the name
          // stays a button for the keyboard.
          const opens = Boolean(onSelect) && s.countryCode !== 'OTHER'
          return (
            <tr
              key={s.countryCode}
              onClick={opens ? () => onSelect?.(s.countryCode) : undefined}
              className={`border-b border-line/70 last:border-0 ${opens ? 'cursor-pointer transition-colors hover:bg-primary/5' : ''}`}
            >
              <td className="py-1.5 text-[12.5px] text-ink">
                {onSelect && opens ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(s.countryCode)
                    }}
                    className="group flex items-center gap-1 text-left hover:text-primary"
                    title={`Open ${s.name}: its stores and products`}
                  >
                    {name}
                    <span className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                      ›
                    </span>
                  </button>
                ) : (
                  name
                )}
              </td>
              <td className="readout py-1.5 text-right text-[12.5px] font-semibold text-ink">{num(s.customers)}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">{num(s.units)}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink">{rm(s.revenue)}</td>
              <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">{s.share.toFixed(1)}%</td>
            </tr>
          )
        })}
        <tr className="border-t border-line">
          <td className="py-1.5 text-[12.5px] font-semibold text-ink-2">Total</td>
          <td className="readout py-1.5 text-right text-[12.5px] font-semibold text-ink">{num(total('customers'))}</td>
          <td className="readout py-1.5 text-right text-[12.5px] text-ink">{num(total('units'))}</td>
          <td className="readout py-1.5 text-right text-[12.5px] font-semibold text-ink">{rm(total('revenue'))}</td>
          <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">100.0%</td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * Where the customers came from, by the four boxes' windows and the page's
 * own dates (asked on 1 November, after Revision 9): the customers lead, with
 * what they bought and what it came to under them, ten countries at a time.
 * With `onSelect`, a country opens on its own — from a figure, for that
 * figure's days; from its name, for the page's own dates.
 */
export function OriginWindowsTable({
  rows,
  chosen,
  onSelect,
  pageKey,
}: {
  rows: OriginSalesRow[]
  /** The page's own dates, in words, for the last column. */
  chosen: string
  onSelect?: (countryCode: string, window: SalesWindow) => void
  pageKey?: string
}) {
  const figure = (s: OriginSales, strong = false) =>
    s.customers === 0 && s.units === 0 ? (
      <Dash />
    ) : (
      <WindowFigure
        lead={`${num(s.customers)} ${s.customers === 1 ? 'customer' : 'customers'}`}
        sub={`${num(s.units)} ${s.units === 1 ? 'unit' : 'units'} · ${rm(s.revenue)}`}
        strong={strong}
      />
    )
  const total = (w: SalesWindow): OriginSales =>
    rows.reduce(
      (a, r) => ({ customers: a.customers + r[w].customers, units: a.units + r[w].units, revenue: a.revenue + r[w].revenue }),
      { customers: 0, units: 0, revenue: 0 },
    )
  return (
    <WindowsTable<OriginSalesRow>
      rows={rows}
      rowKey={(r) => r.countryCode}
      chosen={chosen}
      pageKey={pageKey}
      empty="No customers recorded yet."
      first={{
        header: 'Origin',
        render: (r) => {
          const name = (
            <span className="flex items-center gap-2">
              <Flag code={r.countryCode} size={16} fallback={r.flag} />
              {r.name}
            </span>
          )
          // Wide enough on a phone that a name keeps to a line or two.
          return onSelect ? (
            <button
              onClick={() => onSelect(r.countryCode, 'chosen')}
              className="group flex min-w-[110px] items-center gap-1 text-left hover:text-primary"
              title={`Open ${r.name}: ${chosen}`}
            >
              {name}
              <span className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">›</span>
            </button>
          ) : (
            <span className="block min-w-[110px]">{name}</span>
          )
        },
      }}
      cell={(r, w) => {
        const s = r[w]
        const shown = figure(s, w === 'monthToDate')
        if (!onSelect || (s.customers === 0 && s.units === 0)) return shown
        return (
          <button
            onClick={() => onSelect(r.countryCode, w)}
            className="-mr-1 rounded-md px-1 py-0.5 transition-colors hover:bg-primary/5 hover:text-primary"
            title={`Open ${r.name} for these days`}
          >
            {shown}
          </button>
        )
      }}
      total={(w) => figure(total(w))}
    />
  )
}
