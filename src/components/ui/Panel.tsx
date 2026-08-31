import type { ReactNode } from 'react'

/**
 * Glass on the command deck: white at 85%, a line edge, light caught along
 * the top. Every surface in the app is one of these.
 */
export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>
}

export function PanelHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow?: string
  title: ReactNode
  /** A short factual line under the title — never a second title. */
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    // The header wraps rather than overflowing: a filter row beside a title is
    // fine on a laptop and is wider than a phone on its own, so below `sm` it
    // drops onto its own full-width line instead of pushing out of the panel.
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 pt-4 pb-3 sm:px-5">
      <div className="min-w-[180px] flex-1">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-[16px] font-semibold leading-tight tracking-tight text-ink sm:text-[17px]">
          {title}
        </h2>
        {meta && <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{meta}</p>}
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </header>
  )
}

/** The indigo rule that closes a panel header. */
export function Rule() {
  return <div className="rule mx-4 sm:mx-5" />
}

export function PanelBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>
}
