import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { Icon } from './ui/icons'
import { useToasts } from './ui/Toast'
import { useCurrentUser } from '../store/useAuth'
import { useData } from '../store/useData'
import {
  canSeePasswordOf,
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
 * The same dialog serves "change my own" from the account menu and "set one for
 * someone" from the Logins screen, because the rules are identical — they live
 * in `data/people.ts` and are enforced again in the store.
 *
 * The current password is shown only on request, behind a button that says the
 * look-up is recorded. Opening the dialog to *set* a new one should not log a
 * look-up that never happened.
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
  const revealPassword = useData((s) => s.revealPassword)
  const push = useToasts((s) => s.push)

  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)

  const isSelf = target?.id === me?.id

  useEffect(() => {
    if (open) {
      setValue('')
      setConfirm('')
      setShow(false)
      setError(null)
      setCurrent(null)
    }
  }, [open, target?.id])

  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!target || !me || busy) return
    if (value !== confirm) return setError('The two do not match.')
    setBusy(true)
    const result = await setPassword({ actor: me, targetId: target.id, password: value })
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'That password could not be set.')
    push(
      isSelf ? 'Your password has been changed' : `${target.name} can sign in with the new password`,
      'good',
    )
    onClose()
  }

  const strength = STRENGTH[passwordStrength(value)]

  return (
    <Modal
      open={open && target !== null}
      onClose={onClose}
      title={isSelf ? 'Change my password' : `Set a password for ${target?.name}`}
      subtitle={
        target
          ? `${target.username} · ${ROLE_LABEL[target.role]} · last set ${formatTimestamp(target.passwordSetAt)} by ${target.passwordSetBy}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {isSelf ? 'Change it' : 'Set it'}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          {me && canSeePasswordOf(me, target) && (
            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <p className="eyebrow mb-1">Current password</p>
              {current ? (
                <p className="readout break-all text-[16px] font-semibold text-ink">{current}</p>
              ) : (
                <button
                  onClick={async () => {
                    const result = await revealPassword({ actor: me, targetId: target.id })
                    if (result.ok && result.password) setCurrent(result.password)
                    else push(result.error ?? 'That password cannot be shown.', 'critical')
                  }}
                  className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
                >
                  <Icon name="eye" className="h-3.5 w-3.5" />
                  Show it — this is recorded
                </button>
              )}
            </div>
          )}

          {isSelf && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/8 px-3.5 py-3">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <p className="text-[12.5px] leading-relaxed text-ink-2">
                <b className="text-ink">Do not reuse a password from anywhere else.</b> Senior
                staff can look this one up, so it should be used for this system only — never
                the one on your personal e-mail or bank.
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

          {target.passwordChanges > 0 && (
            <p className="text-[11.5px] text-ink-3">
              {target.passwordChanges} previous{' '}
              {target.passwordChanges === 1 ? 'password' : 'passwords'} on record and blocked
              from reuse.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
