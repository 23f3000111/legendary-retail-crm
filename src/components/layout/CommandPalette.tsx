import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../ui/icons'
import { NAV } from './nav'
import { useCurrentUser } from '../../store/useAuth'
import { useData } from '../../store/useData'
import { CHANNEL_LABEL, locationName, locations } from '../../data/locations'
import { STATUS_LABEL } from '../../lib/po-machine'

interface Command {
  id: string
  label: string
  hint: string
  group: string
  run: () => void
}

/**
 * Ctrl/⌘ K. Everything reachable by clicking is reachable by typing. It only
 * ever offers what this person's role can open, because it is built from the
 * same navigation map the route guard uses.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const user = useCurrentUser()
  const orders = useData((s) => s.purchaseOrders)

  const commands = useMemo<Command[]>(() => {
    if (!user) return []
    const go = (to: string) => () => {
      navigate(to)
      onClose()
    }
    const nav: Command[] = NAV[user.role].map((n) => ({
      id: `nav-${n.to}`,
      label: n.label,
      hint: 'Go to',
      group: 'Navigate',
      run: go(n.to),
    }))
    const places: Command[] = locations.slice(0, 80).map((l) => ({
      id: `loc-${l.id}`,
      label: l.name,
      hint: `${l.code} · ${CHANNEL_LABEL[l.channel]}`,
      group: 'Stores',
      run: go(`/locations?focus=${l.id}`),
    }))
    const pos: Command[] = orders.slice(0, 40).map((p) => ({
      id: `po-${p.id}`,
      label: p.id,
      hint: `${locationName(p.locationId)} · ${STATUS_LABEL[p.status]}`,
      group: 'Purchase orders',
      run: go(`/orders/${p.id}`),
    }))
    return [...nav, ...pos, ...places]
  }, [user, orders, navigate, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 9)
    return commands
      .filter((c) => `${c.label} ${c.hint} ${c.group}`.toLowerCase().includes(q))
      .slice(0, 9)
  }, [commands, query])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      // Focus after the entry animation has begun, or the caret jumps.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(results.length - 1, c + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        results[cursor]?.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, cursor, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-[65] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Icon name="search" className="h-4 w-4 shrink-0 text-primary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search screens, stores and orders"
                className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                Esc
              </kbd>
            </div>

            {results.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">
                Nothing matches “{query}”. Try a store name or an order number.
              </p>
            ) : (
              <ul className="max-h-[52vh] overflow-y-auto py-1.5">
                {results.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onMouseEnter={() => setCursor(i)}
                      onClick={c.run}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        i === cursor ? 'bg-sunken' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{c.label}</span>
                        <span className="block truncate text-[11px] text-ink-3">{c.hint}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
                        {c.group}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** Registers the global shortcut once, from the app root. */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen])
}
