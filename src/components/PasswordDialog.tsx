import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { Icon } from './ui/icons'
import { useToasts } from './ui/Toast'
import { useCurrentUser } from '../store/useAuth'
import { useData } from '../store/useData'
import {
  passwordStrength,
  suggestPassword,
  PASSWORD_MIN,
  ROLE_LABEL,
  type Person,
} from '../data/people'
import { formatTimestamp } from '../lib/dates'

const STRENGTH = [
  { label: 'Too short', tone: 'bg-critical', width: 'w-1/4' },
  { label: 'Weak', tone: 'bg-warn', width: 'w-2/4' },
  { label: 'Good', tone: 'bg-good', width: 'w-3/4' },
  { label: 'Strong', tone: 'bg-good', width: 'w-full' },
] as const

/**
 * Setting a password.
 *
 * The same dialog serves "change my own" from the account menu and "reset it
 * for someone" from the Logins screen, because the rules are identical — they
 * live in `data/people.ts` and are enforced again in the store, so this
 * component only has to collect the thing and report what came back.
 *
 * There is deliberately no way to *see* an existing password. It is stored as a
 * one-way hash in production, so there is nothing to show — which is the whole
 * reason this is safer than the PIN arrangement it replaced.
 */
export function PasswordDialog({
  open,
  target,
  onClose,
}: {
  open: boolean
  target: Person | null
  onClose: () => void
}) {
  const me = useCurrentUser()
  const setPassword = useData((s) => s.setPassword)
  const push = useToasts((s) => s.push)

  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = target?.id === me?.id

  useEffect(() => {
    if (open) {
      setValue('')
      setConfirm('')
      setShow(false)
      setError(null)
    }
  }, [open, target?.id])

  const save = () => {
    if (!target || !me) return
    if (value !== confirm) return setError('The two do not match.')
    const result = setPassword({
      actor: me,
      targetId: target.id,
      password: value,
      issued: !isSelf,
    })
    if (!result.ok) return setError(result.error ?? 'That password could not be set.')
    push(
      isSelf
        ? 'Your password has been changed'
        : `${target.name} can sign in with the new password`,
      'good',
    )
    onClose()
  }

  const strength = STRENGTH[passwordStrength(value)]

  return (
    <Modal
      open={open && target !== null}
      onClose={onClose}
      title={isSelf ? 'Change my password' : `Reset the password for ${target?.name}`}
      subtitle={
        target
          ? isSelf
            ? 'You will use it the next time you sign in.'
            : `${ROLE_LABEL[target.role]} · last set ${formatTimestamp(target.passwordSetAt)} by ${target.passwordSetBy}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            {isSelf ? 'Change it' : 'Set it'}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          {!isSelf && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[12.5px] leading-relaxed text-ink-2">
                Nobody can see an existing password, including you — it is stored so that it
                cannot be read back. Set a new one here and hand it over; {target.name} will be
                asked to choose their own the next time they sign in.
              </p>
            </div>
          )}

          <Field
            label={isSelf ? 'New password' : 'The password to give them'}
            hint={`At least ${PASSWORD_MIN} characters, with a number. Not one used before.`}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <TextInput
                  value={value}
                  type={show ? 'text' : 'password'}
                  autoFocus
                  autoComplete="new-password"
                  onChange={(e) => {
                    setValue(e.target.value)
                    setError(null)
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide' : 'Show'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 transition-colors hover:text-ink"
                >
                  <Icon name={show ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                </button>
              </div>
              {!isSelf && (
                <Button
                  variant="secondary"
                  icon="refresh"
                  onClick={() => {
                    const next = suggestPassword()
                    setValue(next)
                    setConfirm(next)
                    setShow(true)
                    setError(null)
                  }}
                >
                  Suggest
                </Button>
              )}
            </div>
          </Field>

          {value.length > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                <div className={`h-full rounded-full ${strength.tone} ${strength.width}`} />
              </div>
              <span className="w-16 text-right text-[11.5px] text-ink-3">{strength.label}</span>
            </div>
          )}

          <Field label="Type it again" error={error}>
            <TextInput
              value={confirm}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              onChange={(e) => {
                setConfirm(e.target.value)
                setError(null)
              }}
            />
          </Field>

          {target.passwordHistory.length > 0 && (
            <p className="text-[11.5px] text-ink-3">
              {target.passwordHistory.length} previous{' '}
              {target.passwordHistory.length === 1 ? 'password' : 'passwords'} on record and
              blocked from reuse.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
