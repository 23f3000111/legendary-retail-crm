/**
 * Signing in.
 *
 * Three things, in order: a username, a password, and a six-digit code sent to
 * the person's company e-mail. The PIN keypad is gone.
 *
 * The second step is what makes this worth doing. A password on its own can be
 * shoulder-surfed at a counter, guessed, or reused from somewhere that has
 * already been breached; a code that arrives on the person's own mailbox means
 * knowing the password is not enough. It costs one extra screen and about ten
 * seconds, once per device.
 *
 * **In this wireframe there is no server**, so no mail is actually sent — the
 * code is generated here and shown on screen behind a clearly marked panel. In
 * production `beginSignIn` becomes one request that returns nothing but "we
 * sent it", and the code never reaches the browser at all. That is the whole
 * difference, and it is contained in this module.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  can,
  maskEmail,
  newSignInCode,
  personByUsername,
  CODE_TTL_MINUTES,
  type Capability,
  type Person,
} from '../data/people'
import { setAuditActor } from '../lib/audit'
import { useData } from './useData'

/** Wrong passwords before the account is held for a minute. */
const MAX_PASSWORD_TRIES = 5
/** Wrong codes before the whole attempt is thrown away. */
const MAX_CODE_TRIES = 5
const LOCKOUT_MS = 60_000

/** A sign-in half-finished: password accepted, code not yet entered. */
interface Pending {
  personId: string
  code: string
  /** Epoch ms. */
  expiresAt: number
  sentTo: string
  tries: number
}

interface AuthState {
  personId: string | null
  pending: Pending | null
  /** Epoch ms until which sign-in is refused after too many wrong passwords. */
  lockedUntil: number | null

  /** Step one. Returns where the code went, never who the person is. */
  beginSignIn: (
    username: string,
    password: string,
  ) => { ok: boolean; sentTo?: string; error?: string }
  /** Step two. */
  submitCode: (code: string) => { ok: boolean; person?: Person; error?: string }
  /** Sends a fresh code for the attempt in progress. */
  resendCode: () => { ok: boolean; error?: string }
  cancelSignIn: () => void
  signOut: () => void
}

/** Nobody is signed in yet, so a failed attempt is filed against this. */
const NOBODY = { id: 'unknown', name: 'Someone signing in', role: 'promoter' } as const

/**
 * Wrong-password count, held outside the store so it is never written to
 * storage and cannot be cleared by hand from the browser. In production this
 * lives in the database against the account, not against the device.
 */
let failedTries = 0

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      personId: null,
      pending: null,
      lockedUntil: null,

      beginSignIn: (username, password) => {
        const data = useData.getState()
        const locked = get().lockedUntil
        if (locked && locked > Date.now()) {
          const seconds = Math.ceil((locked - Date.now()) / 1000)
          return { ok: false, error: `Too many attempts. Try again in ${seconds} seconds.` }
        }

        const person = personByUsername(username, data.users)
        const matches = Boolean(person) && person!.password === password && person!.active

        if (!matches) {
          // The message never says which half was wrong. Telling somebody the
          // username exists is telling them half the answer.
          data.record({
            kind: 'session',
            action: 'session.sign_in_failed',
            summary: 'A sign-in was refused — wrong username or password',
            actor: { ...NOBODY },
          })

          const tries = failedTries + 1
          failedTries = tries
          if (tries >= MAX_PASSWORD_TRIES) {
            failedTries = 0
            set({ lockedUntil: Date.now() + LOCKOUT_MS })
            return { ok: false, error: 'Too many attempts. Try again in a minute.' }
          }
          return { ok: false, error: 'That username and password do not match.' }
        }

        failedTries = 0
        const code = newSignInCode()
        set({
          pending: {
            personId: person!.id,
            code,
            expiresAt: Date.now() + CODE_TTL_MINUTES * 60_000,
            sentTo: maskEmail(person!.email),
            tries: 0,
          },
        })
        data.record({
          kind: 'session',
          action: 'session.code_sent',
          summary: `A sign-in code was sent to ${maskEmail(person!.email)}`,
          entityId: person!.id,
          actor: { id: person!.id, name: person!.name, role: person!.role },
        })
        return { ok: true, sentTo: maskEmail(person!.email) }
      },

      submitCode: (code) => {
        const pending = get().pending
        const data = useData.getState()
        if (!pending) return { ok: false, error: 'Start again — that sign-in has expired.' }

        if (Date.now() > pending.expiresAt) {
          set({ pending: null })
          return { ok: false, error: 'That code has expired. Sign in again for a new one.' }
        }

        if (code.trim() !== pending.code) {
          const tries = pending.tries + 1
          if (tries >= MAX_CODE_TRIES) {
            set({ pending: null })
            data.record({
              kind: 'session',
              action: 'session.code_failed',
              summary: 'A sign-in was abandoned after five wrong codes',
              actor: { ...NOBODY },
            })
            return { ok: false, error: 'Too many wrong codes. Start again.' }
          }
          set({ pending: { ...pending, tries } })
          return {
            ok: false,
            error: `That code is not right. ${MAX_CODE_TRIES - tries} tries left.`,
          }
        }

        const person = data.users.find((u) => u.id === pending.personId)
        if (!person || !person.active) {
          set({ pending: null })
          return { ok: false, error: 'That login is no longer active.' }
        }

        set({ personId: person.id, pending: null, lockedUntil: null })
        setAuditActor(person.id)
        data.record({
          kind: 'session',
          action: 'session.signed_in',
          summary: `${person.name} signed in`,
          entityId: person.id,
          locationId: person.locationId,
          actor: { id: person.id, name: person.name, role: person.role },
        })
        return { ok: true, person }
      },

      resendCode: () => {
        const pending = get().pending
        if (!pending) return { ok: false, error: 'Start again — that sign-in has expired.' }
        const code = newSignInCode()
        set({
          pending: {
            ...pending,
            code,
            tries: 0,
            expiresAt: Date.now() + CODE_TTL_MINUTES * 60_000,
          },
        })
        return { ok: true }
      },

      cancelSignIn: () => set({ pending: null }),

      signOut: () => {
        const id = get().personId
        const person = id ? useData.getState().users.find((u) => u.id === id) : undefined
        if (person) {
          useData.getState().record({
            kind: 'session',
            action: 'session.signed_out',
            summary: `${person.name} signed out`,
            entityId: person.id,
            actor: { id: person.id, name: person.name, role: person.role },
          })
        }
        setAuditActor(null)
        set({ personId: null, pending: null })
      },
    }),
    {
      name: 'legendary-crm-session-v4',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // A half-finished sign-in is never written to storage: the code would be
      // sitting in the browser for anyone to read. Only the finished session is.
      partialize: (s) => ({ personId: s.personId }) as unknown as AuthState,
      // After a refresh the session comes back before anything is clicked, so
      // the activity log has to be told who is here — otherwise the first
      // action of the day would be filed against nobody.
      onRehydrateStorage: () => (state) => setAuditActor(state?.personId ?? null),
    },
  ),
)

/**
 * The code that was just "sent", for the walkthrough panel only.
 *
 * Set `SHOW_DEMO_CODE` to false in `pages/Login.tsx` and this is never read.
 * In production the code exists only in the mail and in the database.
 */
export const peekSignInCode = (): string | null => useAuth.getState().pending?.code ?? null

/** The signed-in person, or null. Read from the live list, not the seed. */
export const useCurrentUser = (): Person | null => {
  const id = useAuth((s) => s.personId)
  const users = useData((s) => s.users)
  if (!id) return null
  const found = users.find((u) => u.id === id)
  // A login that has been disabled cannot hold a session open.
  return found && found.active ? found : null
}

/**
 * What the signed-in person may do. Read-only sign-ins (the founder) get a
 * capability set with `canEdit: false`, and screens hide every action rather
 * than offering something that will be refused.
 */
export const useCan = (): Capability => {
  const user = useCurrentUser()
  return can(user?.role ?? 'director')
}
