import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { signedPct } from '../../lib/format'

export type TileTone = 'violet' | 'blue' | 'cyan' | 'teal' | 'plain'

const GRADIENT: Record<Exclude<TileTone, 'plain'>, string> = {
  violet: 'bg-grad-violet',
  blue: 'bg-grad-blue',
  cyan: 'bg-grad-cyan',
  teal: 'bg-grad-teal',
}

/**
 * Counts to a value once, on mount or when the value changes. Numbers arriving
 * rather than appearing is the only motion on the KPI row; reduced-motion
 * preference lands them immediately instead.
 */
function useCountUp(target: number, duration = 820): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(target)
      from.current = target
      return
    }
    const start = performance.now()
    const origin = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(origin + (target - origin) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

/**
 * The headline readouts. A toned tile is a saturated gradient block with white
 * type; `plain` is glass, for secondary rows where four gradients would shout.
 */
export function StatTile({
  label,
  value,
  format,
  delta,
  footnote,
  tone = 'plain',
  icon,
}: {
  label: string
  value: number
  /** Turns the animated number into its final string. */
  format: (n: number) => string
  delta?: number | null
  footnote?: ReactNode
  tone?: TileTone
  icon?: IconName
}) {
  const shown = useCountUp(value)
  const toned = tone !== 'plain'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl px-4 py-3.5 ${
        toned
          ? `${GRADIENT[tone]} text-white shadow-tile`
          : 'border border-line bg-surface/85 shadow-glass backdrop-blur-xl'
      }`}
    >
      {/* A single specular highlight, so the gradient reads as a lit surface. */}
      {toned && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/20 blur-2xl"
        />
      )}

      <div className="relative flex items-start justify-between gap-2">
        <p className={`eyebrow ${toned ? 'text-white/75' : ''}`}>{label}</p>
        {icon && (
          <Icon
            name={icon}
            className={`h-4 w-4 shrink-0 ${toned ? 'text-white/60' : 'text-ink-3'}`}
          />
        )}
      </div>

      <p
        className={`readout relative mt-2 font-display text-[26px] font-semibold leading-none tracking-tight ${
          toned ? 'text-white' : 'text-ink'
        }`}
      >
        {format(shown)}
      </p>

      <div className="relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined && <TileDelta value={delta} onTone={toned} />}
        {footnote && (
          <span className={`text-[11.5px] ${toned ? 'text-white/70' : 'text-ink-3'}`}>
            {footnote}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Change against the prior period. Null means the prior period was zero — a real
 * state for a new outlet, and it reads as "no basis" rather than as 0%.
 */
function TileDelta({ value, onTone }: { value: number | null; onTone: boolean }) {
  if (value === null) {
    return (
      <span className={`text-[11.5px] ${onTone ? 'text-white/70' : 'text-ink-3'}`}>
        no prior period
      </span>
    )
  }
  const up = value >= 0
  const colour = onTone
    ? 'bg-white/18 text-white'
    : up
      ? 'bg-good/10 text-good'
      : 'bg-critical/10 text-critical'

  return (
    <span
      className={`readout inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11.5px] font-semibold ${colour}`}
    >
      <Icon name={up ? 'arrowUp' : 'arrowDown'} className="h-3 w-3" strokeWidth={2.4} />
      {signedPct(Math.abs(value) < 0.05 ? 0 : value)}
    </span>
  )
}
