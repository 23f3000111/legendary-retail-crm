import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/** A boxed line of information inside a panel — never colour alone, always words. */
export function Notice({
  tone = 'neutral',
  icon,
  children,
  className = '',
}: {
  tone?: 'warn' | 'good' | 'neutral'
  icon: IconName
  children: ReactNode
  className?: string
}) {
  const look = {
    warn: { box: 'border-warn/40 bg-warn/8', icon: 'text-warn' },
    good: { box: 'border-good/35 bg-good/8', icon: 'text-good' },
    neutral: { box: 'border-line bg-surface-2', icon: 'text-ink-3' },
  }[tone]
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed text-ink ${look.box} ${className}`}
    >
      <Icon name={icon} className={`mt-0.5 h-4 w-4 shrink-0 ${look.icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * What changed, one per line — the same sentences the person saw before
 * saving, Kelly sees before approving, and the activity log keeps.
 */
export function ChangeList({ changes, className = '' }: { changes: string[]; className?: string }) {
  return (
    <ul className={`space-y-1 ${className}`}>
      {changes.map((c, i) => (
        <li key={`${i}-${c}`} className="flex items-start gap-2 text-[12.5px] text-ink">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="min-w-0">{c}</span>
        </li>
      ))}
    </ul>
  )
}
