import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { newerBundle, runningBundle } from '../lib/appVersion'
import { writesInFlight } from '../store/useData'

/** How often an open page asks whether a new version is live. */
const CHECK_MS = 5 * 60_000

/** Opens the new version once nothing is on its way to the server: a sale or a closing is never cut off. */
const openNewVersion = (tries = 0) => {
  if (writesInFlight() > 0 && tries < 50) {
    window.setTimeout(() => openNewVersion(tries + 1), 200)
    return
  }
  window.location.reload()
}

/**
 * A new version of the app, opened at the next change of page (27 November).
 *
 * A page left open ran the version it opened with until somebody reloaded it.
 * On 26 November KLIA T2 filed every product at 0 at 23:01, six hours after
 * the version that refuses it went live, from a phone open since before. Now
 * an open page asks every few minutes, and whenever it comes back to the
 * front, which version is live. Once another is, the next tap to another page
 * opens it — nothing typed on the page being left is lost that way, as leaving
 * the page drops it anyway — and a line at the top offers to open it now.
 *
 * Nothing happens while developing, where there is no built version to compare.
 */
export function NewVersion() {
  const { pathname } = useLocation()
  const [ready, setReady] = useState(false)
  const here = useRef(pathname)
  here.current = pathname
  /** The page that was open when the new version was found. */
  const foundOn = useRef<string | null>(null)

  useEffect(() => {
    const running = runningBundle(Array.from(document.scripts, (s) => s.src))
    if (!running) return
    let stopped = false
    const check = async () => {
      try {
        const page = `${window.location.origin}${window.location.pathname}?version=${Date.now()}`
        const res = await fetch(page, { cache: 'no-store' })
        if (!res.ok || stopped) return
        if (newerBundle(running, await res.text()) && !stopped) {
          foundOn.current ??= here.current
          setReady(true)
        }
      } catch {
        // Offline, or the server busy: ask again later.
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = window.setInterval(() => void check(), CHECK_MS)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    window.addEventListener('online', onShow)
    void check()
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('focus', onShow)
      window.removeEventListener('online', onShow)
    }
  }, [])

  useEffect(() => {
    if (ready && foundOn.current !== null && pathname !== foundOn.current) openNewVersion()
  }, [ready, pathname])

  if (!ready) return null
  return (
    <div
      role="status"
      className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5"
    >
      <Icon name="refresh" className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-[200px] flex-1 text-[13px] text-ink">
        <b>A new version of the CRM is ready.</b>{' '}
        <span className="text-ink-2">It opens when you go to another page.</span>
      </p>
      <Button size="sm" variant="secondary" onClick={() => openNewVersion()}>
        Open it now
      </Button>
    </div>
  )
}
