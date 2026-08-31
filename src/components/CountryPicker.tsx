import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './ui/icons'
import {
  byInitial,
  searchCountries,
  topCountries,
  MALAYSIA,
  MALAYSIA_SEGMENTS,
  type Country,
  type MalaysiaSegment,
} from '../data/countries'

/**
 * Finding a country at a counter.
 *
 * All 200 from the client's Zeoniq list are here, but nobody scrolls 200 rows
 * with a customer waiting — so the box is focused the moment it opens and you
 * type two or three letters. Results are grouped A, B, C so a mis-typed search
 * still leaves you somewhere you can read.
 *
 * Picking Malaysia asks one more question. It is the home market and the client
 * wants the mix inside it, so Malay / Chinese / Indian / Others is a second tap
 * rather than a guess. No other country has it.
 */
export function CountryPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (code: string, segment?: MalaysiaSegment) => void
}) {
  const [query, setQuery] = useState('')
  const [askingSegment, setAskingSegment] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setAskingSegment(false)
    // After the entry animation has begun, or the caret jumps on iOS.
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const results = useMemo(() => searchCountries(query, 300), [query])
  const grouped = useMemo(() => byInitial(results), [results])

  const choose = (c: Country) => {
    if (c.code === MALAYSIA) {
      setAskingSegment(true)
      return
    }
    onPick(c.code)
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-[70] flex items-end justify-center sm:items-start sm:pt-[8vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a country"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lift sm:max-h-[80vh] sm:max-w-lg sm:rounded-2xl"
          >
            {askingSegment ? (
              <SegmentStep
                onBack={() => setAskingSegment(false)}
                onPick={(segment) => onPick(MALAYSIA, segment)}
              />
            ) : (
              <>
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <Icon name="search" className="h-4 w-4 shrink-0 text-primary" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type a country"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    // 16px or larger, or iOS zooms the whole page on focus.
                    className="w-full bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
                  />
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="shrink-0 rounded-lg p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                  {!query && (
                    <>
                      <p className="eyebrow mb-2">Most often</p>
                      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {topCountries.slice(0, 12).map((c) => (
                          <button
                            key={c.code}
                            onClick={() => choose(c)}
                            className="flex min-h-[46px] items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left transition-colors hover:border-primary/45 hover:bg-primary/8"
                          >
                            <span className="shrink-0 text-[17px] leading-none">{c.flag}</span>
                            <span className="min-w-0 truncate text-[13px] text-ink">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {results.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-ink-3">
                      No country matches “{query}”.
                    </p>
                  ) : (
                    grouped.map(([letter, list]) => (
                      <div key={letter} className="mb-3">
                        <p className="eyebrow sticky top-0 z-[1] bg-surface py-1">{letter}</p>
                        <div className="grid gap-1">
                          {list.map((c) => (
                            <button
                              key={c.code}
                              onClick={() => choose(c)}
                              className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-sunken"
                            >
                              <span className="shrink-0 text-[17px] leading-none">{c.flag}</span>
                              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                                {c.name}
                              </span>
                              {c.code === MALAYSIA && (
                                <span className="shrink-0 text-[11px] text-ink-3">
                                  asks one more
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** The one extra question Malaysia asks. */
function SegmentStep({
  onBack,
  onPick,
}: {
  onBack: () => void
  onPick: (segment: MalaysiaSegment) => void
}) {
  return (
    <div className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to the country list"
          className="rounded-lg p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="text-[19px] leading-none">🇲🇾</span>
        <h2 className="font-display text-[17px] font-semibold tracking-tight">Malaysian customer</h2>
      </div>
      <p className="mb-4 pl-9 text-[12.5px] text-ink-2">Which group? Ask if you are not sure.</p>

      <div className="grid grid-cols-2 gap-2.5">
        {MALAYSIA_SEGMENTS.map((s) => (
          <button
            key={s.value}
            onClick={() => onPick(s.value)}
            className="min-h-[62px] rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-left text-[14.5px] font-medium text-ink transition-all duration-200 hover:border-primary/60 hover:bg-primary/14 active:scale-[0.98]"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
