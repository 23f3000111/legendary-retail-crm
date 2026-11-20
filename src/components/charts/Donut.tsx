import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { seriesColor, OTHER, INK } from './palette'
import { Icon } from '../ui/icons'
import { totalOf, usePaged } from '../ui/LoadMore'
import { num, pct } from '../../lib/format'

export interface DonutSlice {
  key: string
  label: string
  value: number
}

/**
 * Composition as a ring, with the total read in the hole. Segments are separated
 * by a 2px gap in the surface colour so adjacent fills never touch, and the top
 * segments are labelled on the ring itself — the legend carries the rest.
 */
export function Donut({
  slices,
  total: totalOverride,
  centreLabel,
  centreValue,
  size = 200,
  thickness = 26,
  format = (n: number) => num(n),
  href,
  onSelect,
}: {
  slices: DonutSlice[]
  total?: number
  centreLabel?: string
  centreValue?: string
  size?: number
  thickness?: number
  format?: (n: number) => string
  /** Where a segment's name leads, if anywhere: a store's own page. */
  href?: (key: string) => string | undefined
  /** Or what a segment's name opens in place: a store's pop-up (20 November). */
  onSelect?: (key: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const total = totalOverride ?? slices.reduce((a, s) => a + s.value, 0)
  if (!total) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-line text-[12px] text-ink-3"
        style={{ height: size }}
      >
        Nothing to show for this selection
      </div>
    )
  }

  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  // A 2px visual gap between segments, expressed in arc length.
  const gap = 2.4

  let offset = 0
  const arcs = slices.map((s, i) => {
    const fraction = s.value / total
    const length = Math.max(0, fraction * circumference - gap)
    const arc = {
      ...s,
      colour: s.key === 'OTHER' ? OTHER : seriesColor(i),
      dash: `${length} ${circumference - length}`,
      offset: -offset,
      share: fraction * 100,
    }
    offset += fraction * circumference
    return arc
  })

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${centreLabel ?? 'Composition'}: ${arcs
            .map((a) => `${a.label} ${Math.round(a.share)}%`)
            .join(', ')}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#F1F5FC"
            strokeWidth={thickness}
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.colour}
              strokeWidth={hovered === a.key ? thickness + 5 : thickness}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
              opacity={hovered === null || hovered === a.key ? 1 : 0.35}
              className="cursor-default transition-all duration-200 ease-luxe"
              onMouseEnter={() => setHovered(a.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${a.label} · ${format(a.value)} · ${a.share.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hovered ? (
            <>
              <p className="readout font-display text-[20px] font-semibold leading-none text-ink">
                {pct(arcs.find((a) => a.key === hovered)!.share, 1)}
              </p>
              <p className="mt-1 max-w-[110px] text-[11px] leading-tight text-ink-2">
                {arcs.find((a) => a.key === hovered)!.label}
              </p>
            </>
          ) : (
            <>
              <p className="readout font-display text-[22px] font-semibold leading-none text-ink">
                {centreValue ?? format(total)}
              </p>
              {centreLabel && (
                <p className="mt-1 text-[10px] uppercase tracking-wide2 text-ink-3">{centreLabel}</p>
              )}
            </>
          )}
        </div>
      </div>

      <ul className="min-w-[140px] space-y-1.5">
        {arcs.map((a) => (
          <li
            key={a.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHovered(a.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: a.colour }}
              aria-hidden="true"
            />
            {/* Labels wear ink, never the series colour — the swatch carries identity. */}
            <SegmentName
              label={a.label}
              to={a.key === 'OTHER' ? undefined : href?.(a.key)}
              onSelect={a.key === 'OTHER' || !onSelect ? undefined : () => onSelect(a.key)}
              className="flex-1 text-[12px] text-ink-2"
            />
            <span className="readout text-[11.5px] text-ink-3">{a.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A segment's name: a link to its own page where it has one (client, 1 November), or a pop-up. */
function SegmentName({ label, to, onSelect, className }: { label: string; to?: string; onSelect?: () => void; className: string }) {
  if (!to && onSelect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        className={`group inline-flex items-center gap-1 text-left hover:text-primary ${className}`}
      >
        {label}
        <Icon
          name="chevronRight"
          className="h-3 w-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </button>
    )
  }
  if (!to) return <span className={className}>{label}</span>
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()} className={`group inline-flex items-center gap-1 hover:text-primary ${className}`}>
      {label}
      <Icon
        name="chevronRight"
        className="h-3 w-3 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </Link>
  )
}

/**
 * The same figures as a table, for the chart frame's "Figures" view. With
 * `href`, each row opens its own page; with `page`, a long list shows that
 * many rows at a time, and the total still counts them all.
 */
export function DonutTable({
  slices,
  format = (n: number) => num(n),
  unitHeader = 'Value',
  href,
  onSelect,
  page,
}: {
  slices: DonutSlice[]
  format?: (n: number) => string
  unitHeader?: string
  href?: (key: string) => string | undefined
  /** Or what a row opens in place: a store's pop-up (20 November). */
  onSelect?: (key: string) => void
  page?: number
}) {
  const navigate = useNavigate()
  const { visible, partial, more } = usePaged(slices, { page })
  const total = slices.reduce((a, s) => a + s.value, 0)
  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {['Segment', unitHeader, 'Share'].map((h, i) => (
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
          {visible.map((s, i) => {
            const to = s.key === 'OTHER' ? undefined : href?.(s.key)
            const select = s.key === 'OTHER' || to || !onSelect ? undefined : () => onSelect(s.key)
            return (
              <tr
                key={s.key}
                onClick={to ? () => navigate(to) : select}
                className={`border-b border-line/70 last:border-0 ${to || select ? 'cursor-pointer transition-colors hover:bg-primary/5' : ''}`}
              >
                <td className="py-1.5 text-[12.5px] text-ink">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-middle"
                    style={{ background: s.key === 'OTHER' ? OTHER : seriesColor(i) }}
                  />
                  <SegmentName label={s.label} to={to} onSelect={select} className="align-middle" />
                </td>
                <td className="readout py-1.5 text-right text-[12.5px] text-ink">{format(s.value)}</td>
                <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">
                  {total ? ((s.value / total) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            )
          })}
          <tr className="border-t border-line">
            <td className="py-1.5 text-[12.5px] text-ink-2">{totalOf(partial, slices.length)}</td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink" style={{ color: INK.primary }}>
              {format(total)}
            </td>
            <td className="readout py-1.5 text-right text-[12.5px] text-ink-2">100.0%</td>
          </tr>
        </tbody>
      </table>
      {more}
    </>
  )
}
