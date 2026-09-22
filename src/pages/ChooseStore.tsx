import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wordmark, Icon } from '../components/ui/icons'
import { Button } from '../components/ui/Button'
import { useAuth, useCurrentUser, useStoreChoices } from '../store/useAuth'
import { locationById } from '../data/locations'

/**
 * Which outlet are you at today?
 *
 * Staff are rotated between the counters in their own town, so a promoter
 * belongs to a city rather than to one store and says where they are each
 * time they sign in. The choice lives on the session, on the server, and
 * everything they record until they sign out is filed against that outlet.
 * They can change it from the menu part-way through a day.
 *
 * Where a town has one outlet open there is nothing to ask, and this screen
 * is skipped — it appears by itself the day a second one opens.
 */
export function ChooseStore() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const chooseStore = useAuth((s) => s.chooseStore)
  const signOut = useAuth((s) => s.signOut)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choiceIds = useStoreChoices()
  if (!user) return null
  const choices = choiceIds.map((id) => locationById(id)).filter(Boolean)

  const pick = async (id: string) => {
    if (busy) return
    setBusy(id)
    setError(null)
    const r = await chooseStore(id, locationById(id)?.name)
    setBusy(null)
    if (!r.ok) return setError(r.error ?? 'That did not work.')
    navigate(user.home, { replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px]"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Wordmark className="h-12 w-12" />
          <p className="mt-4 eyebrow">
            {user.name}
            {user.city ? ` · ${user.city}` : ''}
          </p>
          <h1 className="mt-1 font-display text-[22px] font-bold leading-tight tracking-tight text-ink">
            Which outlet are you at today?
          </h1>
          <p className="mt-2 text-[12.5px] text-ink-2">
            Everything you record until you sign out goes against this store.
          </p>
        </div>

        <div className="panel px-5 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {choices.map((l) => (
              <button
                key={l!.id}
                onClick={() => pick(l!.id)}
                disabled={busy !== null}
                className={`flex min-h-[74px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:shadow-glass ${
                  user.locationId === l!.id
                    ? 'border-primary bg-primary/10'
                    : 'border-line bg-surface sm:hover:border-primary/45'
                } disabled:opacity-60`}
              >
                <span className="readout flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[12px] font-semibold text-primary">
                  {l!.code}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">{l!.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-3">{l!.region}</span>
                </span>
                {busy === l!.id && <Icon name="clock" className="ml-auto h-4 w-4 animate-pulse text-primary" />}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-3 flex items-start gap-2 text-[12.5px] text-critical">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => void signOut().then(() => navigate('/'))}>
            Not you? Sign out
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
