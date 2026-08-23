import type { Role } from '../../data/people'
import type { IconName } from '../ui/icons'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Matched exactly, so child routes keep the parent highlighted. */
  end?: boolean
  /**
   * Reached through the "More" menu rather than sitting in the bar.
   *
   * Davy can open eleven screens, and eleven pills do not fit on a laptop —
   * they end up in a horizontal scroller nobody notices. So the bar carries
   * what somebody opens most days and the rest sit one click away. This is
   * presentation only: `allowedPaths` does not care, and neither does the
   * route guard.
   */
  secondary?: boolean
}

/**
 * What each role sees. The founder's list is identical to the Managing
 * Director's — he can reach everything — but every screen renders read-only for
 * him, because the capability set and not the navigation decides what he can do.
 */
export const NAV: Record<Role, NavItem[]> = {
  director: [
    { to: '/overview', label: 'Overview', icon: 'grid', end: true },
    { to: '/analytics', label: 'Analytics', icon: 'chart' },
    { to: '/locations', label: 'Stores', icon: 'globe' },
    { to: '/closings', label: 'Closings', icon: 'clipboard' },
    { to: '/orders', label: 'Orders', icon: 'doc' },
    { to: '/stock', label: 'Stock', icon: 'box' },
    { to: '/promotions', label: 'Promotions', icon: 'sparkle', secondary: true },
    { to: '/targets', label: 'Targets', icon: 'trophy', secondary: true },
    { to: '/activity', label: 'Activity', icon: 'clock', secondary: true },
  ],
  md: [
    { to: '/overview', label: 'Overview', icon: 'grid', end: true },
    { to: '/analytics', label: 'Analytics', icon: 'chart' },
    { to: '/locations', label: 'Stores', icon: 'globe' },
    { to: '/closings', label: 'Closings', icon: 'clipboard' },
    { to: '/orders', label: 'Orders', icon: 'doc' },
    { to: '/stock', label: 'Stock', icon: 'box' },
    { to: '/alerts', label: 'Alerts', icon: 'bell' },
    { to: '/promotions', label: 'Promotions', icon: 'sparkle', secondary: true },
    { to: '/targets', label: 'Targets', icon: 'trophy', secondary: true },
    { to: '/users', label: 'Logins', icon: 'users', secondary: true },
    { to: '/activity', label: 'Activity', icon: 'clock', secondary: true },
  ],
  ops: [
    { to: '/operations', label: 'Today', icon: 'grid', end: true },
    { to: '/closings', label: 'Closings', icon: 'clipboard' },
    { to: '/orders', label: 'Orders', icon: 'doc' },
    { to: '/stock', label: 'Stock', icon: 'box' },
    { to: '/alerts', label: 'Alerts', icon: 'bell' },
    { to: '/locations', label: 'Stores', icon: 'globe', secondary: true },
    { to: '/promotions', label: 'Promotions', icon: 'sparkle', secondary: true },
    { to: '/users', label: 'Logins', icon: 'users', secondary: true },
    { to: '/activity', label: 'Activity', icon: 'clock', secondary: true },
  ],
  pa: [
    { to: '/overview', label: 'Overview', icon: 'grid', end: true },
    { to: '/analytics', label: 'Analytics', icon: 'chart' },
    { to: '/locations', label: 'Stores', icon: 'globe' },
    { to: '/catalogue', label: 'Products', icon: 'sparkle' },
    { to: '/promotions', label: 'Promotions', icon: 'trophy' },
    { to: '/users', label: 'Logins', icon: 'users', secondary: true },
    { to: '/activity', label: 'Activity', icon: 'clock', secondary: true },
  ],
  finance: [
    { to: '/finance', label: 'Revenue', icon: 'wallet', end: true },
    { to: '/analytics', label: 'Analytics', icon: 'chart' },
    { to: '/orders', label: 'Orders', icon: 'doc' },
    { to: '/locations', label: 'Stores', icon: 'globe' },
  ],
  warehouse: [
    { to: '/warehouse', label: 'Despatch', icon: 'truck', end: true },
    { to: '/stock', label: 'Stock', icon: 'box' },
  ],
  promoter: [
    { to: '/today', label: 'Today', icon: 'grid', end: true },
    { to: '/sell', label: 'Record a sale', icon: 'plus' },
    { to: '/close', label: 'Close the day', icon: 'clipboard' },
    { to: '/stock', label: 'Stock', icon: 'box' },
    { to: '/orders', label: 'My orders', icon: 'doc' },
    { to: '/history', label: 'History', icon: 'clock' },
  ],
  it: [
    { to: '/users', label: 'Logins', icon: 'users', end: true },
    { to: '/locations', label: 'Stores', icon: 'globe' },
    // Chloe's last step is to tell Imran about a promotion (Q59), so he needs
    // somewhere to read what he has been told.
    { to: '/promotions', label: 'Promotions', icon: 'sparkle' },
    { to: '/activity', label: 'Activity', icon: 'clock' },
  ],
}

/** Every path a role may open, including detail pages not shown in the bar. */
export const allowedPaths = (role: Role): string[] => {
  const base = NAV[role].map((n) => n.to)
  // Order detail is reachable from any list that shows an order.
  if (base.some((p) => p === '/orders' || p === '/warehouse')) base.push('/orders/')
  return base
}

export const canOpen = (role: Role, pathname: string): boolean =>
  allowedPaths(role).some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  )
