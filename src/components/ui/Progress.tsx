import { pct } from '../../lib/format'

/** Bar for a value against a target. Over-target keeps filling in good green. */
export function ProgressBar({
  value,
  className = '',
  tone,
}: {
  /** 0–1, may exceed 1. */
  value: number
  className?: string
  tone?: 'primary' | 'good' | 'warn' | 'critical'
}) {
  const clamped = Math.max(0, Math.min(1.25, value))
  const auto = value >= 1 ? 'good' : value >= 0.75 ? 'primary' : value >= 0.5 ? 'warn' : 'critical'
  const colour = {
    primary: 'bg-grad-command',
    good: 'bg-good',
    warn: 'bg-warn',
    critical: 'bg-critical',
  }[tone ?? auto]

  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-sunken ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-luxe ${colour}`}
        style={{ width: `${Math.min(100, clamped * 100)}%` }}
      />
    </div>
  )
}

/**
 * Target ring. The value is written inside it, so the ring reinforces the number
 * rather than being its only carrier.
 */
export function ProgressRing({
  value,
  size = 62,
  label,
}: {
  value: number
  size?: number
  label?: string
}) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  const colour =
    value >= 1 ? '#059669' : value >= 0.75 ? '#4F46E5' : value >= 0.5 ? '#B45309' : '#BE123C'

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7EDF8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-luxe"
        />
      </svg>
      <span className="readout absolute text-[12px] font-semibold text-ink">
        {label ?? pct(value * 100)}
      </span>
    </div>
  )
}
