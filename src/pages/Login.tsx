import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon, Wordmark } from '../components/ui/icons'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { useAuth } from '../store/useAuth'
import { useData } from '../store/useData'
import { localBackend } from '../api'
import {
  startingPassword,
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  ROLE_LABEL,
  type Person,
  type Role,
} from '../data/people'
import { locationById } from '../data/locations'
import { formatDate, todayInMalaysia } from '../lib/dates'

/**
 * The walkthrough aid: the sample logins, a button to load the sample
 * history, and the code that would have been e-mailed.
 *
 * It exists only in a build with no server behind it. The moment the shared
 * server is connected (the two secrets in the deploy workflow) this panel is
 * not rendered at all — nothing on the published site depends on a flag
 * being remembered.
 */
const SHOW_DEMO_HELP = localBackend() !== null

/** The demo list in the order of the company chart, promoters last and by store. */
const DEMO_ORDER: Role[] = ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'it', 'promoter']

const demoGroups = (users: Person[]) =>
  DEMO_ORDER.map((role) => ({
    role,
    label: role === 'promoter' ? 'Store Promoters' : ROLE_LABEL[role],
    people: users
      .filter((u) => u.active && u.role === role)
      .sort((a, b) =>
        role === 'promoter'
          ? (locationById(a.locationId ?? '')?.name ?? '').localeCompare(
              locationById(b.locationId ?? '')?.name ?? '',
            ) || a.name.localeCompare(b.name)
          : 0,
      ),
  })).filter((g) => g.people.length > 0)

type Step = 'credentials' | 'code'

/**
 * The front door.
 *
 * Username and password. Leadership then gets a six-digit code to their work
 * e-mail, because their accounts can read everybody else's password; everyone
 * else is in as soon as the password is right.
 *
 * The failure messages are deliberately unhelpful to an attacker: a wrong
 * username and a wrong password produce the same sentence, because saying
 * which one was wrong hands over half the answer.
 */
export function Login() {
  const navigate = useNavigate()
  const beginSignIn = useAuth((s) => s.beginSignIn)
  const submitCode = useAuth((s) => s.submitCode)
  const cancelSignIn = useAuth((s) => s.cancelSignIn)
  const pending = useAuth((s) => s.pending)
  const users = useData((s) => s.users)
  const resetDemo = useData((s) => s.resetDemo)
  const today = todayInMalaysia()

  const [step, setStep] = useState<Step>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [greeting, setGreeting] = useState<string | null>(null)

  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'code') {
      const id = requestAnimationFrame(() => codeRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [step])

  /** Opens the person's screen — or the store picker, for a KL promoter. */
  const welcome = (person: Person, needsStore?: boolean) => {
    setGreeting(person.name)
    const to = needsStore ? '/choose-store' : person.home
    // A brief beat so the person sees whose account they opened.
    setTimeout(() => navigate(to), 550)
  }

  const submitCredentials = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    const result = await beginSignIn(username, password)
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'That did not work.')
    // Most people are in straight away; only leadership may get the code step.
    if (result.needsCode) {
      setCode('')
      setStep('code')
      return
    }
    if (result.person) welcome(result.person, result.needsStore)
  }

  const submitTheCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    const result = await submitCode(code)
    setBusy(false)
    if (!result.ok) {
      setCode('')
      // A thrown-away attempt goes back to the start.
      if (!useAuth.getState().pending) {
        setStep('credentials')
        setPassword('')
      }
      return setError(result.error ?? 'That code is not right.')
    }
    welcome(result.person!, result.needsStore)
  }

  const startOver = () => {
    cancelSignIn()
    setStep('credentials')
    setPassword('')
    setCode('')
    setError(null)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px]"
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
            ) : step === 'credentials' ? (
              <motion.form
                key="credentials"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={submitCredentials}
                className="space-y-4"
              >
                <div className="mb-1 text-center">
                  <p className="font-display text-[17px] font-semibold text-ink">Sign in</p>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    With the username and password you were given.
                  </p>
                </div>

                <Field label="Username">
                  <TextInput
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      setError(null)
                    }}
                    placeholder="kellytew"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                  />
                </Field>

                <Field label="Password">
                  <div className="relative">
                    <TextInput
                      value={password}
                      type={showPassword ? 'text' : 'password'}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError(null)
                      }}
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 transition-colors hover:text-ink"
                    >
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                    </button>
                  </div>
                </Field>

                {error && (
                  <p className="flex items-start gap-2 text-[12.5px] leading-snug text-critical">
                    <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                )}

                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => submitCredentials()}
                  disabled={busy || !username.trim() || !password}
                >
                  Continue
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="code"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={submitTheCode}
                className="space-y-4"
              >
                <div className="mb-1 text-center">
                  <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon name="lock" className="h-5 w-5" />
                  </span>
                  <p className="font-display text-[17px] font-semibold text-ink">
                    Check your e-mail
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
                    We sent a {CODE_LENGTH}-digit code to{' '}
                    <span className="readout text-ink">{pending?.sentTo}</span>. It lasts{' '}
                    {CODE_TTL_MINUTES} minutes.
                  </p>
                </div>

                <Field label="The code">
                  <TextInput
                    ref={codeRef}
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={CODE_LENGTH}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
                      setCode(next)
                      setError(null)
                    }}
                    className="readout text-center text-[22px] tracking-[0.4em]"
                    placeholder="••••••"
                  />
                </Field>

                {error && (
                  <p className="flex items-start gap-2 text-[12.5px] leading-snug text-critical">
                    <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                )}

                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => submitTheCode()}
                  disabled={busy || code.length < CODE_LENGTH}
                >
                  Sign in
                </Button>

                <div className="flex items-center justify-between text-[12px]">
                  <button
                    type="button"
                    onClick={startOver}
                    className="flex items-center gap-1 text-ink-3 transition-colors hover:text-ink"
                  >
                    <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={startOver}
                    className="text-primary transition-colors hover:underline"
                  >
                    Sign in again for a new code
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* ── Walkthrough aid ───────────────────────────────────────────── */}
        {SHOW_DEMO_HELP && !greeting && (
          <div className="mt-4">
            {step === 'code' && pending && (
              <div className="mb-3 rounded-2xl border border-warn/30 bg-warn/8 p-4 text-center">
                <p className="text-[11.5px] text-ink-2">
                  <b className="text-ink">No mail is sent in this build.</b> The code would have
                  been:
                </p>
                <button
                  onClick={() => setCode(localBackend()?.peekCode(pending.token) ?? '')}
                  className="readout mt-2 text-[24px] font-semibold tracking-[0.3em] text-primary hover:underline"
                >
                  {localBackend()?.peekCode(pending.token)}
                </button>
                <p className="mt-1 text-[11px] text-ink-3">Tap it to fill the box.</p>
              </div>
            )}

            <button
              onClick={() => setShowHelp((v) => !v)}
              className="mx-auto flex items-center gap-1.5 text-[12px] text-ink-3 transition-colors hover:text-ink-2"
            >
              <Icon name={showHelp ? 'chevronDown' : 'chevronRight'} className="h-3.5 w-3.5" />
              {showHelp ? 'Hide the demo logins' : 'Show the demo logins'}
            </button>

            {showHelp && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 rounded-2xl border border-warn/30 bg-warn/8 p-4"
              >
                <p className="text-[11.5px] leading-relaxed text-ink-2">
                  <b className="text-ink">No server is connected to this build yet</b> — it runs
                  on this browser alone, and nothing here reaches anybody else. Tap a name to
                  fill in their username and starting password, or load ninety days of sample
                  history first.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => {
                    resetDemo(todayInMalaysia())
                    setError(null)
                  }}
                >
                  Load the sample history
                </Button>
                <div className="mt-3 max-h-[280px] space-y-3 overflow-y-auto pr-1">
                  {demoGroups(users).map((g) => (
                    <div key={g.role}>
                      <p className="eyebrow mb-1 px-1">{g.label}</p>
                      <ul className="space-y-1">
                        {g.people.map((u) => (
                          <li key={u.id}>
                            <button
                              onClick={() => {
                                setUsername(u.username)
                                setPassword(startingPassword(u.username))
                                setError(null)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-left transition-colors hover:bg-sunken"
                            >
                              <span className="readout w-[112px] shrink-0 truncate text-[11.5px] font-semibold text-primary">
                                {u.username}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                                {u.name}
                              </span>
                              {g.role === 'promoter' && u.locationId && (
                                <span className="shrink-0 truncate text-[10.5px] text-ink-3">
                                  {locationById(u.locationId)?.shortName}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-3">
          Forgotten your password? Ask Davy, Kelly, Chloe or Imran to set you a new one.
        </p>
      </motion.div>
    </div>
  )
}
