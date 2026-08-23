import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { INK, PRIMARY, PRIMARY_BRIGHT } from './palette'
import { formatDateShort, formatDayShort } from '../../lib/dates'
import type { SeriesPoint } from '../../store/selectors'

/**
 * Change over time, as a thin line over a fading fill. Grid and axes stay
 * recessive; the crosshair and tooltip do the reading, so no value is printed on
 * the plot itself. A single series wears the UI accent rather than taking a
 * categorical slot.
 */
export function TrendChart({
  data,
  format,
  label,
  color = PRIMARY,
  gradientTo = PRIMARY_BRIGHT,
}: {
  data: SeriesPoint[]
  format: (n: number) => string
  /** Names the single series, so no legend box is needed. */
  label: string
  color?: string
  gradientTo?: string
}) {
  // With a long window, one tick per week keeps the axis legible.
  const step = data.length > 45 ? 14 : data.length > 20 ? 7 : 3
  const id = `fill-${color.slice(1)}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientTo} stopOpacity={0.34} />
            <stop offset="100%" stopColor={gradientTo} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          interval={step - 1}
          tick={{ fill: INK.muted, fontSize: 10.5, fontFamily: 'Inter' }}
          axisLine={{ stroke: INK.axis }}
          tickLine={false}
          dy={4}
        />
        <YAxis
          tickFormatter={(v: number) => format(v)}
          tick={{ fill: INK.muted, fontSize: 10.5, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          width={62}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(79,70,229,0.45)', strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as SeriesPoint
            return (
              <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
                <p className="text-[11px] text-ink-3">{formatDayShort(p.date)}</p>
                <p className="readout mt-0.5 text-[13px] font-semibold text-ink">
                  {format(p.value)}
                </p>
                <p className="text-[10.5px] text-ink-3">{label}</p>
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={`url(#${id}-line)`}
          strokeWidth={2.5}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: color,
            // A 2px ring in the surface colour keeps the dot off the line beneath.
            stroke: INK.surface,
            strokeWidth: 2,
          }}
          isAnimationActive
          animationDuration={620}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
