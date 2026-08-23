import { PRIMARY } from './palette'
import type { SeriesPoint } from '../../store/selectors'

/**
 * A shape, not a chart — it sits inside a table row to show direction, and
 * carries no axes or values of its own. The number beside it does the reading.
 */
export function Sparkline({
  data,
  width = 92,
  height = 24,
  color = PRIMARY,
}: {
  data: SeriesPoint[]
  width?: number
  height?: number
  color?: string
}) {
  if (data.length < 2) return <div style={{ width, height }} />

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 2

  const x = (i: number) => (i / (data.length - 1)) * (width - pad * 2) + pad
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)

  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`
  const lastX = x(values.length - 1)
  const lastY = y(values[values.length - 1])

  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={area} fill={color} opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* The current value gets a dot, ringed in the surface so it stays legible. */}
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
    </svg>
  )
}
