import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-ink-3 transition-colors duration-200 hover:border-line-strong focus:border-primary/60'

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string
  /** Says what good input looks like. Never repeats the label. */
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[11.5px] text-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11.5px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} h-10 text-[14px] ${className}`} {...rest} />
}

/** Money and counts are read column-wise, so they are set in the mono face. */
export function NumberInput({
  prefix,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-3">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        className={`${control} readout h-10 text-[14px] ${prefix ? 'pl-11' : ''} ${className}`}
        {...rest}
      />
    </div>
  )
}

export function TextArea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} min-h-[84px] py-2.5 text-[14px] ${className}`} {...rest} />
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${control} h-10 text-[14px] ${className}`} {...rest}>
      {children}
    </select>
  )
}

/** A row of mutually exclusive options — used for metric and range pickers. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-line bg-sunken p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-[10px] font-medium transition-all duration-200 ease-luxe ${
              size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]'
            } ${
              active
                ? 'bg-grad-command text-white shadow-glow'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Multi-select chips for the analytics filter rail. */
export function ChipToggle({
  label,
  active,
  onClick,
  swatch,
}: {
  label: ReactNode
  active: boolean
  onClick: () => void
  /** Optional colour dot, when the chip corresponds to a chart series. */
  swatch?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-all duration-200 ease-luxe ${
        active
          ? 'border-primary/45 bg-primary/10 text-primary'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
      }`}
    >
      {swatch && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  )
}
