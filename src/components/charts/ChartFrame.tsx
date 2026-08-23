import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../ui/icons'

export interface LegendItem {
  label: string
  color: string
  /** Rendered right-aligned in the legend row — a count, a share, a total. */
  value?: string
}

/**
 * The frame every chart sits in. It guarantees the three things a chart must
 * never ship without: a legend when there is more than one series, a table view
 * so the figures are reachable without reading colour, and a note slot for
 * stating how a number was derived.
 */
export function ChartFrame({
  title,
  meta,
  legend = [],
  note,
  action,
  table,
  children,
  height = 240,
}: {
  title: string
  meta?: ReactNode
  legend?: LegendItem[]
  /** Says how the figure was derived when that is not obvious. */
  note?: ReactNode
  action?: ReactNode
  /** The same data as a table. Always offered when a legend is present. */
  table?: ReactNode
  children: ReactNode
  height?: number
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <section className="panel flex flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h3>
          {meta && <p className="mt-0.5 text-[12px] text-ink-2">{meta}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <button
              onClick={() => setShowTable((s) => !s)}
              aria-pressed={showTable}
              title={showTable ? 'Show the chart' : 'Show the figures'}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors duration-200 ${
                showTable
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-line text-ink-3 hover:text-ink'
              }`}
            >
              <Icon name="grid" className="h-3 w-3" />
              Figures
            </button>
          )}
        </div>
      </header>

      <div className="rule mx-5" />

      <div className="px-5 pt-4">
        {showTable && table ? (
          <div style={{ minHeight: height }}>{table}</div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>

      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-3.5">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: l.color }}
                aria-hidden="true"
              />
              {/* Labels wear ink, never the series colour — the swatch carries identity. */}
              <span className="text-[11.5px] text-ink-2">{l.label}</span>
              {l.value && <span className="readout text-[11px] text-ink-3">{l.value}</span>}
            </li>
          ))}
        </ul>
      )}

      {note && <p className="px-5 pt-3 text-[11px] leading-relaxed text-ink-3">{note}</p>}

      <div className="pb-4" />
    </section>
  )
}
