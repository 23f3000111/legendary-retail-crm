import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Icon, Wordmark } from '../ui/icons'
import { Badge, LiveDot } from '../ui/Badge'
import { NAV } from './nav'
import { useAuth, useCan, useCurrentUser } from '../../store/useAuth'
import { useData } from '../../store/useData'
import { locationById, tradingLocations } from '../../data/locations'
import { ROLE_LABEL, ROLE_ACCESS, ACCENT_GRADIENT, canChangeOwnPassword, picksStore } from '../../data/people'
import { PasswordDialog } from '../PasswordDialog'
import { isShared } from '../../api'
import { addDays, formatDate, formatTimestamp, todayInMalaysia } from '../../lib/dates'
import { rm } from '../../lib/format'
import { emptyFilter, selectKpis, selectNotFiled } from '../../store/selectors'
import { useToasts } from '../ui/Toast'
import { CommandPalette, useCommandPaletteHotkey } from './CommandPalette'

/**
 * The command deck. A gradient bar carries identity and navigation across the
 * top, and a thin status strip pins the live figures to every screen.
 *
 * A read-only sign-in wears a badge in the bar. That is deliberate: the founder
 * should be able to tell at a glance why no buttons are appearing, rather than
 * wondering whether the system is broken.
 *
 * The account menu holds only this person's own account. There is no "view as
 * someone else" — everyone signs in with their own PIN, and to see another
 * person's screen you sign out and they sign in.
 */
export function AppShell() {
  const user = useCurrentUser()
  const capability = useCan()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const signOut = useAuth((s) => s.signOut)
  const data = useData()
  const syncStatus = useData((s) => s.syncStatus)
  const lastSyncAt = useData((s) => s.lastSyncAt)
  const resetDemo = useData((s) => s.resetDemo)
  const push = useToasts((s) => s.push)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)

  useCommandPaletteHotkey(() => setPaletteOpen(true))

  if (!user) return null

  const secondary = NAV[user.role].filter((i) => i.secondary)
  // When a "More" screen is open, the button wears its name — otherwise the bar
  // would show nothing highlighted and the person would not know where they are.
  const onSecondary = secondary.find(
    (i) => pathname === i.to || pathname.startsWith(`${i.to}/`),
  )

  const location = user.locationId ? locationById(user.locationId) : null
  const unread = data.alerts.filter((a) => !a.read).length
  const today = data.today
  // A promoter sees their own store's figures; head office sees the group's.
  const scope = location
    ? { ...emptyFilter(addDays(today, -29), today), locationIds: [location.id] }
    : emptyFilter(addDays(today, -29), today)
  const kpis = selectKpis(data, scope)
  const notFiled = selectNotFiled(data, addDays(today, -1))

  return (
    <div className="flex min-h-screen flex-col">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <PasswordDialog open={pinOpen} target={user} onClose={() => setPinOpen(false)} />

      <header className="no-print sticky top-0 z-40">
        <div className="relative bg-grad-command">
          {/* The sweep needs clipping; the bar must not clip, because the
              switcher hangs out of the bottom of it. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          </span>

          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Wordmark className="h-9 w-9 shrink-0" />
              <div className="min-w-0 leading-tight">
                <p className="font-display text-[15px] font-semibold tracking-tight text-white">
                  Legendary
                </p>
                <p className="text-[9.5px] uppercase tracking-luxe text-white/60">Retail CRM</p>
              </div>
            </div>

            <span className="hidden h-8 w-px bg-white/20 lg:block" />

            {/* On a phone the pills wrap onto a second line — a sideways
                scroller there just cuts a label in half and hides the rest.
                From `sm` up they sit in their own scroll container, and the
                "More" panel sits *outside* it: an element with
                `overflow-x: auto` clips on both axes, which would swallow a
                panel hanging below it. */}
            <div className="order-last flex w-full min-w-0 flex-wrap items-center gap-1 sm:flex-nowrap lg:order-none lg:w-auto lg:flex-1">
              <nav className="flex min-w-0 flex-wrap items-center gap-1 sm:flex-1 sm:flex-nowrap sm:overflow-x-auto sm:pb-0.5 lg:pb-0">
                {NAV[user.role].filter((i) => !i.secondary).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `relative shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
                        isActive ? 'text-primary-deep' : 'text-white/75 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-pill"
                            className="absolute inset-0 rounded-full bg-white shadow-sm"
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          />
                        )}
                        <span className="relative flex items-center gap-1.5">
                          <Icon name={item.icon} className="h-3.5 w-3.5" />
                          {item.label}
                          {item.to === '/alerts' && unread > 0 && (
                            <span
                              className={`readout rounded-full px-1.5 text-[10px] font-semibold ${
                                isActive ? 'bg-critical/12 text-critical' : 'bg-white/25 text-white'
                              }`}
                            >
                              {unread}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>

              {/* Everything else, one click away. Eleven pills do not fit on a
                  laptop, and a horizontal scroller is a place things go to be
                  lost. */}
              {secondary.length > 0 && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
                      onSecondary
                        ? 'bg-white text-primary-deep shadow-sm'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {onSecondary ? (
                      <>
                        <Icon name={onSecondary.icon} className="h-3.5 w-3.5" />
                        {onSecondary.label}
                      </>
                    ) : (
                      'More'
                    )}
                    <Icon name="chevronDown" className="h-3.5 w-3.5" />
                  </button>

                  {moreOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute left-0 z-20 mt-2 w-[210px] overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lift"
                      >
                        {secondary.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors hover:bg-sunken ${
                                isActive ? 'bg-sunken/70 text-primary' : 'text-ink-2 hover:text-ink'
                              }`
                            }
                          >
                            <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
                            {item.label}
                          </NavLink>
                        ))}
                      </motion.div>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] text-white/80 transition-colors hover:bg-white/18 hover:text-white md:inline-flex"
            >
              <Icon name="search" className="h-3.5 w-3.5" />
              Jump to
              <kbd className="rounded border border-white/25 px-1 font-mono text-[9.5px]">Ctrl K</kbd>
            </button>

            <div className="relative ml-auto lg:ml-0">
              <button
                onClick={() => setSwitcherOpen((s) => !s)}
                aria-expanded={switcherOpen}
                className="flex items-center gap-2.5 rounded-full border border-white/25 bg-white/12 py-1 pl-1 pr-2.5 transition-colors hover:bg-white/20"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white ${ACCENT_GRADIENT[user.accent]}`}
                >
                  {user.initials}
                </span>
                <span className="hidden min-w-0 text-left leading-tight sm:block">
                  <span className="block truncate text-[12.5px] font-medium text-white">
                    {user.name}
                  </span>
                  <span className="block truncate text-[10px] text-white/65">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
                <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-white/70" />
              </button>

              {switcherOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 z-20 mt-2 w-[280px] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
                  >
                    <div className="flex items-center gap-2.5 px-3 pt-3.5 pb-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-white ${ACCENT_GRADIENT[user.accent]}`}
                      >
                        {user.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {user.name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </span>
                    </div>

                    <p className="border-t border-line px-3 py-2 text-[11.5px] leading-snug text-ink-2">
                      {ROLE_ACCESS[user.role]}
                    </p>

                    <div className="border-t border-line">
                      {canChangeOwnPassword(user) ? (
                        <button
                          onClick={() => {
                            setSwitcherOpen(false)
                            setPinOpen(true)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                        >
                          <Icon name="lock" className="h-3.5 w-3.5" />
                          Change my password
                        </button>
                      ) : (
                        <p className="flex items-start gap-2 px-3 py-2.5 text-[11.5px] leading-snug text-ink-3">
                          <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Ask Davy, Kelly, Chloe or Imran if you need a new password.
                        </p>
                      )}
                      {capability.manageUsers && (
                        <button
                          onClick={() => {
                            setSwitcherOpen(false)
                            navigate('/users')
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                        >
                          <Icon name="users" className="h-3.5 w-3.5" />
                          Manage logins
                        </button>
                      )}
                      {picksStore(user) && (
                        <button
                          onClick={() => {
                            setSwitcherOpen(false)
                            navigate('/choose-store')
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                        >
                          <Icon name="globe" className="h-3.5 w-3.5" />
                          Switch outlet · {location?.shortName ?? 'none chosen'}
                        </button>
                      )}
                    </div>

                    <div className="border-t border-line">
                      <button
                        onClick={() => {
                          void signOut()
                          navigate('/')
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                      >
                        <Icon name="logout" className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface/80 px-4 py-1.5 backdrop-blur-md sm:px-6">
          <LiveDot label="Live" />
          <span className="text-[11.5px] text-ink-2">
            {location ? location.name : 'Head Office · Kuala Lumpur'}
          </span>
          <span className="readout hidden text-[11.5px] text-ink-3 sm:inline">
            {formatDate(today)}
          </span>
          {!capability.canEdit && (
            <Badge tone="neutral" icon="alert">
              View only
            </Badge>
          )}
          <span className="ml-auto hidden items-center gap-4 md:flex">
            <span className="text-[11.5px] text-ink-3">
              {location ? 'This store · 30 days' : '30-day revenue'}{' '}
              <span className="readout font-semibold text-ink">{rm(kpis.current.revenue)}</span>
            </span>
            {!location && (
              <>
                <span className="text-[11.5px] text-ink-3">
                  Stores{' '}
                  <span className="readout font-semibold text-ink">{tradingLocations.length}</span>
                </span>
                {notFiled.length > 0 && (
                  <span className="text-[11.5px] text-ink-3">
                    Unfiled yesterday{' '}
                    <span className="readout font-semibold text-critical">{notFiled.length}</span>
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">
        <Outlet />
      </main>

      {/* Sticky only where there is room for it. On a phone a pinned footer
          costs a line of content on every screen and covers the last row of
          whatever you are reading, so there it simply ends the page. */}
      <footer className="no-print z-30 flex flex-wrap items-center gap-x-4 gap-y-1 bg-grad-command px-4 py-2 text-[11px] text-white/80 sm:sticky sm:bottom-0 sm:px-6">
        <span className="font-medium text-white">Legendary Retail CRM</span>
        {isShared() ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                syncStatus === 'offline' ? 'bg-critical' : syncStatus === 'ready' ? 'bg-good' : 'bg-white/50'
              }`}
            />
            {syncStatus === 'offline'
              ? 'No connection — showing what was last received'
              : syncStatus === 'ready'
                ? `Shared with every device · updated ${lastSyncAt ? formatTimestamp(lastSyncAt).split(' · ').pop() : ''}`
                : 'Connecting…'}
          </span>
        ) : (
          <>
            <span className="hidden sm:inline">Local build · this browser only</span>
            <button
              onClick={() => {
                resetDemo(todayInMalaysia())
                push('Sample history loaded', 'info')
                navigate(user.home)
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-0.5 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Icon name="refresh" className="h-3 w-3" />
              Load sample history
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
