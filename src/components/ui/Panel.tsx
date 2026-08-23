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
    <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-[17px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h2>
        {meta && <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{meta}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

/** The indigo rule that closes a panel header. */
export function Rule() {
  return <div className="rule mx-5" />
}

export function PanelBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}
