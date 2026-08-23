import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { useToasts } from './ui/Toast'
import { useCurrentUser } from '../store/useAuth'
import { useData } from '../store/useData'
import { Icon } from './ui/icons'
import { canSeePinOf, PIN_LENGTH, ROLE_LABEL, suggestPin, type Person } from '../data/people'
import { formatTimestamp } from '../lib/dates'

/**
 * Setting a PIN.
 *
 * The same dialog serves "change my own PIN" from the account menu and "set a
 * PIN for someone" from the Logins screen, because the rules are identical —
 * they live in `data/people.ts` and are enforced again in the store, so this
 * component only has to collect six digits and report what came back.
 */
export function PinDialog({
  open,
  target,
  onClose,
}: {
  open: boolean
  target: Person | null
  onClose: () => void
}) {
  const me = useCurrentUser()
  const allUsers = useData((s) => s.users)
  const changePin = useData((s) => s.changePin)
  const revealPin = useData((s) => s.revealPin)
  const push = useToasts((s) => s.push)

  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)

  const isSelf = target?.id === me?.id

  useEffect(() => {
    if (open) {
      setPin('')
      setConfirm('')
      setError(null)
      // Not fetched on open: the PIN is shown only if somebody asks for it, so
      // opening this dialog to set a new PIN does not log a look-up.
      setCurrent(null)
    }
  }, [open, target?.id])

  const save = () => {
    if (!target || !me) return
    if (pin !== confirm) return setError('The two PINs do not match.')
    const result = changePin({ actor: me, targetId: target.id, pin })
    if (!result.ok) return setError(result.error ?? 'That PIN could not be set.')
    push(isSelf ? 'Your PIN has been changed' : `${target.name}'s PIN is now ${pin}`, 'good')
    onClose()
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH)

  return (
    <Modal
      open={open && target !== null}
      onClose={onClose}
      title={isSelf ? 'Change my PIN' : `Set a PIN for ${target?.name}`}
      subtitle={
        target
          ? isSelf
            ? 'You will use the new PIN the next time you sign in.'
            : `${ROLE_LABEL[target.role]} · last set ${formatTimestamp(target.pinSetAt)} by ${target.pinSetBy}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Set PIN
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          {me && canSeePinOf(me, target) && (
            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <p className="eyebrow mb-1">Current PIN</p>
              {current ? (
                <p className="readout text-[19px] font-semibold tracking-[0.25em] text-ink">
                  {current}
                </p>
              ) : (
                <button
                  onClick={() => {
                    const result = revealPin({ actor: me, targetId: target.id })
                    if (result.ok && result.pin) setCurrent(result.pin)
                    else push(result.error ?? 'That PIN cannot be shown.', 'critical')
                  }}
                  className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
                >
                  <Icon name="eye" className="h-3.5 w-3.5" />
                  Show it — this is recorded
                </button>
              )}
            </div>
          )}

          <Field
            label="New PIN"
            hint={`Six digits. Not one another login uses, and not one ${isSelf ? 'you have' : 'they have'} had before.`}
          >
            <div className="flex gap-2">
              <TextInput
                value={pin}
                inputMode="numeric"
                type="password"
                maxLength={PIN_LENGTH}
                autoFocus
                onChange={(e) => {
                  setPin(digits(e.target.value))
                  setError(null)
                }}
                className="readout text-[18px] tracking-[0.3em]"
                placeholder="••••••"
              />
              {!isSelf && (
                <Button
                  variant="secondary"
                  icon="refresh"
                  onClick={() => {
                    const next = suggestPin(allUsers)
                    setPin(next)
                    setConfirm(next)
                    setError(null)
                  }}
                >
                  Suggest
                </Button>
              )}
            </div>
          </Field>

          <Field label="Type it again" error={error}>
            <TextInput
              value={confirm}
              inputMode="numeric"
              type="password"
              maxLength={PIN_LENGTH}
              onChange={(e) => {
                setConfirm(digits(e.target.value))
                setError(null)
              }}
              className="readout text-[18px] tracking-[0.3em]"
              placeholder="••••••"
            />
          </Field>

          {target.pinHistory.length > 0 && (
            <p className="text-[11.5px] text-ink-3">
              {target.pinHistory.length} previous{' '}
              {target.pinHistory.length === 1 ? 'PIN' : 'PINs'} on record and blocked from reuse.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
