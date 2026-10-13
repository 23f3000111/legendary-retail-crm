import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * A row that opens a page when the viewer may go there, and the same row,
 * unlinked, when they may not. The route guard would only send them home, and a
 * link that bounces is worse than no link. `to` comes from a `canOpen` check;
 * `linkClassName` is what only a link should wear, like a hover.
 */
export function LinkIf({
  to,
  className,
  linkClassName = '',
  children,
}: {
  to?: string
  className: string
  linkClassName?: string
  children: ReactNode
}) {
  return to ? (
    <Link to={to} className={`${className} ${linkClassName}`}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}
