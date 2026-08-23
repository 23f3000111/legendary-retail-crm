import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-all duration-200 ease-luxe disabled:pointer-events-none disabled:opacity-40 whitespace-nowrap'

const variants: Record<Variant, string> = {
  // The command gradient is scarce — only the action that moves the workflow on.
  primary:
    'bg-grad-command text-white shadow-glow hover:brightness-110 active:brightness-95',
  secondary:
    'border border-line-strong bg-surface text-ink hover:border-primary/45 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'border border-critical/30 bg-critical/8 text-critical hover:bg-critical/15',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-10 px-4 text-[13.5px]',
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  children?: ReactNode
}) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {icon && <Icon name={icon} className="h-4 w-4 shrink-0" />}
      {children}
      {iconRight && <Icon name={iconRight} className="h-4 w-4 shrink-0" />}
    </button>
  )
}

export function IconButton({
  name,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { name: IconName; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink ${className}`}
      {...rest}
    >
      <Icon name={name} className="h-4 w-4" />
    </button>
  )
}
