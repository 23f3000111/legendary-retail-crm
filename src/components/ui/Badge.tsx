import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { STATUS_LABEL, STATUS_TONE, type StatusTone } from '../../lib/po-machine'
import { signedPct } from '../../lib/format'
import type { PoStatus } from '../../data/types'

const tones: Record<StatusTone, string> = {
  neutral: 'border-line-strong bg-sunken text-ink-2',
  active: 'border-primary/30 bg-primary/8 text-primary',
  good: 'border-good/30 bg-good/8 text-good',
  warn: 'border-warn/30 bg-warn/8 text-warn',
  critical: 'border-critical/30 bg-critical/8 text-critical',
}

export function Badge({
  children,
  tone = 'neutral',
  icon,
  className = '',
}: {
  children: ReactNode
  tone?: StatusTone
  icon?: IconName
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-[3px] text-[11px] font-semibold leading-none ${tones[tone]} ${className}`}
    >
      {icon && <Icon name={icon} className="h-3 w-3" strokeWidth={2} />}
      {children}
    </span>
  )
}

/** Status never travels as colour alone — it always carries its own words. */
export function StatusChip({ status }: { status: PoStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

/**
 * A period-on-period change. Null means the prior period was zero, which is a
 * real state (a new outlet) and reads as "no basis" rather than as 0%.
 */
export function DeltaChip({
  value,
  className = '',
}: {
  value: number | null
  className?: string
}) {
  if (value === null) {
    return <span className={`text-[11.5px] text-ink-3 ${className}`}>no prior period</span>
  }
  const up = value >= 0
  return (
    <span
      className={`readout inline-flex items-center gap-1 text-[11.5px] font-semibold ${
        up ? 'text-good' : 'text-critical'
      } ${className}`}
    >
      <Icon name={up ? 'arrowUp' : 'arrowDown'} className="h-3 w-3" strokeWidth={2.4} />
      {signedPct(Math.abs(value) < 0.05 ? 0 : value)}
    </span>
  )
}

/** Severity always ships with an icon and a word, never a bare colour. */
export function SeverityBadge({ severity }: { severity: 'warn' | 'serious' | 'critical' }) {
  const map = {
    warn: { tone: 'warn' as StatusTone, label: 'Watch' },
    serious: { tone: 'warn' as StatusTone, label: 'Act soon' },
    critical: { tone: 'critical' as StatusTone, label: 'Urgent' },
  }
  const { tone, label } = map[severity]
  return (
    <Badge tone={tone} icon="alert">
      {label}
    </Badge>
  )
}

/**
 * A live indicator: a dot with a slow expanding ring behind it. `onDark` is for
 * the gradient bars, where the default slate label would disappear.
 */
export function LiveDot({
  label = 'Live',
  onDark = false,
}: {
  label?: string
  onDark?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide2 ${
        onDark ? 'text-white/85' : 'text-ink-3'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-pulse-ring rounded-full ${
            onDark ? 'bg-white' : 'bg-good'
          }`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${onDark ? 'bg-white' : 'bg-good'}`}
        />
      </span>
      {label}
    </span>
  )
}
