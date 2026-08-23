import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon, Wordmark } from '../components/ui/icons'
import { useAuth } from '../store/useAuth'
import { useData } from '../store/useData'
import { PIN_LENGTH, ROLE_LABEL } from '../data/people'
import { locationById } from '../data/locations'
import { formatDate } from '../lib/dates'

/** Five wrong attempts locks the keypad for a minute. */
const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 60

/**
 * The walkthrough aid: a panel listing every PIN so a client can move between
 * people without being handed a list on paper.
 *
 * Set this to `false` before real staff use the system. It is the only thing
 * that has to change — nothing else on this screen depends on it.
 */
const SHOW_DEMO_PINS = true

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

/**
 * The front door.
 *
 * Everybody signs in with a six-digit PIN — no accounts, no passwords, no
 * e-mail. It is built for a finger on a counter iPad first and a mouse second,
 * which is why the keypad is large and the whole thing works without ever
 * touching a keyboard.
 */
export function Login() {
  const navigate = useNavigate()
  const signInWithPin = useAuth((s) => s.signInWithPin)
  const users = useData((s) => s.users)
  const today = useData((s) => s.today)

  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [showHelp, setShowHelp] = useState(false)
  const [greeting, setGreeting] = useState<string | null>(null)

  const locked = lockedUntil !== null && lockedUntil > now
  const secondsLeft = locked ? Math.ceil((lockedUntil! - now) / 1000) : 0

  // Only ticks while the keypad is actually locked.
  useEffect(() => {
    if (!locked) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [locked])

  const attempt = (value: string) => {
    const person = signInWithPin(value)
    if (!person) {
      const next = attempts + 1
      setAttempts(next)
      setPin('')
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000)
        setNow(Date.now())
        setAttempts(0)
        setError(`Too many wrong PINs. Try again in ${LOCKOUT_SECONDS} seconds.`)
      } else {
        setError(`That PIN was not recognised. ${MAX_ATTEMPTS - next} tries left.`)
      }
      return
    }
    setError(null)
    setGreeting(person.name)
    // A brief beat so the person sees whose account they opened.
    setTimeout(() => navigate(person.home), 550)
  }

  const press = (key: string) => {
    if (locked || greeting) return
    if (key === 'clear') return setPin('')
    if (key === 'back') return setPin((p) => p.slice(0, -1))
    if (pin.length >= PIN_LENGTH) return

    const next = pin + key
    setPin(next)
    setError(null)
    if (next.length === PIN_LENGTH) attempt(next)
  }

  // A physical keyboard works too, for head office on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Escape') press('clear')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Demo aid only — see the note beneath it.
  const demoList = useMemo(
    () =>
      users
        .filter((u) => u.active)
        .map((u) => ({
          name: u.name,
          role: ROLE_LABEL[u.role],
          pin: u.pin,
          where: u.locationId ? locationById(u.locationId)?.shortName : 'Head Office',
        })),
    [users],
  )

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[380px]"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Wordmark className="h-14 w-14" />
          <h1 className="mt-4 font-display text-[26px] font-bold leading-none tracking-tight text-ink">
            Legendary
          </h1>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-luxe text-primary">
            Retail CRM
          </p>
          <p className="readout mt-3 text-[12px] text-ink-3">{formatDate(today)}</p>
        </div>

        <div className="panel px-6 py-7">
          <AnimatePresence mode="wait">
            {greeting ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-10 text-center"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-good/12 text-good">
                  <Icon name="check" className="h-6 w-6" strokeWidth={2.4} />
                </span>
                <p className="mt-3 font-display text-[17px] font-semibold text-ink">
                  Welcome, {greeting.split(' ')[0]}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-2">Opening your screen…</p>
              </motion.div>
            ) : (
              <motion.div key="pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-center text-[13.5px] text-ink-2">
                  {locked ? 'Keypad locked' : 'Enter your six-digit PIN'}
                </p>

                {/* ── The six slots ─────────────────────────────────── */}
                <div className="mt-4 flex justify-center gap-2.5" aria-live="polite">
                  {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <motion.span
                        key={i}
                        animate={
                          error && !locked ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }
                        }
                        transition={{ duration: 0.35 }}
                        className={`h-11 w-9 rounded-xl border transition-colors duration-150 ${
                          filled
                            ? 'border-primary bg-primary/10'
                            : 'border-line bg-surface-2'
                        }`}
                      >
                        <span className="flex h-full items-center justify-center text-[20px] leading-none text-primary">
                          {filled ? '•' : ''}
                        </span>
                      </motion.span>
                    )
                  })}
                </div>

                <div className="mt-3 min-h-[34px] text-center">
                  {error && (
                    <p className="text-[12.5px] leading-snug text-critical">
                      {locked ? `Locked. Try again in ${secondsLeft}s.` : error}
                    </p>
                  )}
                </div>

                {/* ── Keypad ────────────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-2.5">
                  {KEYS.map((key) => {
                    const isAction = key === 'clear' || key === 'back'
                    return (
                      <button
                        key={key}
                        onClick={() => press(key)}
                        disabled={locked}
                        aria-label={
                          key === 'clear' ? 'Clear' : key === 'back' ? 'Delete' : key
                        }
                        className={`flex h-[58px] items-center justify-center rounded-2xl border text-[21px] font-medium transition-all duration-150 disabled:opacity-40 ${
                          isAction
                            ? 'border-line bg-surface-2 text-ink-2 hover:text-ink'
                            : 'border-line bg-surface text-ink hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-glass active:translate-y-0'
                        }`}
                      >
                        {key === 'clear' ? (
                          <span className="text-[12px] font-semibold uppercase tracking-wide2">
                            Clear
                          </span>
                        ) : key === 'back' ? (
                          <Icon name="chevronLeft" className="h-5 w-5" />
                        ) : (
                          key
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Demo aid ──────────────────────────────────────────────── */}
        {SHOW_DEMO_PINS && (
        <div className="mt-4">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="mx-auto flex items-center gap-1.5 text-[12px] text-ink-3 transition-colors hover:text-ink-2"
          >
            <Icon name={showHelp ? 'chevronDown' : 'chevronRight'} className="h-3.5 w-3.5" />
            {showHelp ? 'Hide the demo PINs' : 'Show the demo PINs'}
          </button>

          {showHelp && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-2xl border border-warn/30 bg-warn/8 p-4"
            >
              <p className="text-[11.5px] leading-relaxed text-ink-2">
                <b className="text-ink">For the walkthrough only.</b> This panel lists every PIN and
                must be turned off before real staff use the system — set{' '}
                <code className="readout text-[11px] text-ink">SHOW_DEMO_PINS</code> to false.
              </p>
              <ul className="mt-3 max-h-[240px] space-y-1 overflow-y-auto">
                {demoList.map((d) => (
                  <li
                    key={d.pin}
                    className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5"
                  >
                    <button
                      onClick={() => {
                        setPin(d.pin)
                        attempt(d.pin)
                      }}
                      className="readout w-[68px] shrink-0 text-left text-[12.5px] font-semibold text-primary hover:underline"
                    >
                      {d.pin}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{d.name}</span>
                    <span className="shrink-0 text-[10.5px] text-ink-3">{d.role}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-3">
          Forgotten your PIN? Ask Davy, Kelly, Chloe or Imran to set you a new one.
        </p>
      </motion.div>
    </div>
  )
}
