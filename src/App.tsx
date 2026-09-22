import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ToastHost, useToasts } from './components/ui/Toast'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/DataTable'
import { Panel } from './components/ui/Panel'
import { canOpen, NAV } from './components/layout/nav'
import { useAuth, useCurrentUser, useNeedsStore } from './store/useAuth'
import { useData } from './store/useData'

import { Login } from './pages/Login'
import { ChooseStore } from './pages/ChooseStore'
import { Overview } from './pages/hq/Overview'
import { Operations } from './pages/hq/Operations'
import { Analytics } from './pages/hq/Analytics'
import { Locations } from './pages/hq/Locations'
import { StoreDetail } from './pages/hq/StoreDetail'
import { Closings } from './pages/hq/Closings'
import { StockPage } from './pages/hq/StockPage'
import { Alerts } from './pages/hq/Alerts'
import { Finance } from './pages/hq/Finance'
import { Warehouse } from './pages/hq/Warehouse'
import { Catalogue } from './pages/hq/Catalogue'
import { Promotions } from './pages/hq/Promotions'
import { Targets } from './pages/hq/Targets'
import { Activity } from './pages/hq/Activity'
import { Users } from './pages/hq/Users'
import { Orders } from './pages/orders/Orders'
import { OrderDetail } from './pages/orders/OrderDetail'
import { Today } from './pages/store/Today'
import { Sell } from './pages/store/Sell'
import { CloseDay } from './pages/store/CloseDay'
import { History } from './pages/store/History'

/**
 * Route guard. It reads the same navigation map the top bar renders from, so a
 * role can never be shown a link it would then be bounced off — nor reach a
 * screen by typing the address.
 */
function RequireAccess({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const needsStore = useNeedsStore()
  const { pathname } = useLocation()

  if (!user) return <Navigate to="/" replace />
  // A KL promoter says which store they are at before anything else.
  if (needsStore) return <Navigate to="/choose-store" replace />
  if (canOpen(user.role, pathname)) return <>{children}</>

  // Redirect somewhere the role can actually open. Sending them to a `home`
  // the guard would bounce again is an infinite loop and a blank screen, so
  // the first item in their own navigation is the safe fallback.
  const fallback = canOpen(user.role, user.home)
    ? user.home
    : (NAV[user.role][0]?.to ?? '/')
  return <Navigate to={fallback} replace />
}

function NotFound() {
  const user = useCurrentUser()
  return (
    <Panel>
      <EmptyState
        icon="search"
        title="That screen does not exist"
        body="The link may be out of date. Everything you can reach is in the bar at the top."
        action={
          <a href={`#${user?.home ?? '/'}`}>
            <Button variant="primary">Back to your home screen</Button>
          </a>
        }
      />
    </Panel>
  )
}

/** Keeps the store in step with the server for as long as somebody is signed in. */
function Sync() {
  const token = useAuth((s) => s.token)
  const status = useAuth((s) => s.status)
  const startSync = useData((s) => s.startSync)
  const errorSeq = useData((s) => s.errorSeq)
  const lastError = useData((s) => s.lastError)
  const push = useToasts((s) => s.push)

  useEffect(() => {
    if (status !== 'ready' || !token) return
    return startSync()
  }, [status, token, startSync])

  // Every refusal from the server, and every lost connection, is said once.
  useEffect(() => {
    if (errorSeq > 0 && lastError) push(lastError, 'critical')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorSeq])

  return null
}

/** Checks the saved session with the server before anything is drawn. */
function Restore({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const restore = useAuth((s) => s.restore)

  useEffect(() => {
    void restore()
  }, [restore])

  if (status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="readout text-[12px] text-ink-3">Opening…</p>
      </div>
    )
  }
  return <>{children}</>
}

/** The store picker for a KL promoter, outside the shell. */
function RequireSignIn({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    // Hash routing so the build opens straight from a file, with no server
    // rewrite rules to configure before a walkthrough.
    <HashRouter>
      <ToastHost />
      <Sync />
      <Restore>
      <Routes>
        {/* The landing page is the sign-in. */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route
          path="/choose-store"
          element={
            <RequireSignIn>
              <ChooseStore />
            </RequireSignIn>
          }
        />

        <Route
          element={
            <RequireAccess>
              <AppShell />
            </RequireAccess>
          }
        >
          {/* Head office */}
          <Route path="/overview" element={<Overview />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/stores/:id" element={<StoreDetail />} />
          <Route path="/closings" element={<Closings />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/warehouse" element={<Warehouse />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/users" element={<Users />} />

          {/* Orders, shared */}
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />

          {/* The counter */}
          <Route path="/today" element={<Today />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/close" element={<CloseDay />} />
          <Route path="/history" element={<History />} />

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Restore>
    </HashRouter>
  )
}
