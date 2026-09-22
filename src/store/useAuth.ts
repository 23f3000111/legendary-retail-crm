/**
 * Signing in.
 *
 * A username and a password, checked by the server. The server hands back a
 * session token, which this device keeps and sends with every call; the
 * password itself is never stored anywhere on the device.
 *
 * Leadership and IT can additionally be asked for a six-digit code by e-mail.
 * Whether they are is the server's decision (`needsCode` in the reply) — it
 * stays off until a mail sender is connected, and this module already handles
 * the step for when it is switched on.
 *
 * A KL promoter floats between four stores and picks one after signing in
 * (client's third revision); the choice is kept on the session, on the server,
 * so everything they record that day is filed against the right store.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { backend } from '../api'
import type { Result } from '../api/backend'
import { can, type Capability, type Person } from '../data/people'
import { setSession } from '../lib/session'
import { useData } from './useData'

interface AuthState {
  token: string | null
  personId: string | null
  /** The store this session is working at, where the person chose one. */
  locationId: string | null
  /** A sign-in half-finished: password accepted, code not yet entered. */
  pending: { token: string; sentTo: string } | null
  /** 'restoring' while a saved token is being checked with the server on load. */
  status: 'restoring' | 'ready'

  beginSignIn: (
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; person?: Person; needsStore?: boolean; needsCode?: boolean; sentTo?: string; error?: string }>
  submitCode: (code: string) => Promise<{ ok: boolean; person?: Person; needsStore?: boolean; error?: string }>
  chooseStore: (locationId: string) => Promise<Result>
  cancelSignIn: () => void
  signOut: () => Promise<void>
  /** Checks the saved token with the server. Called once, on load. */
  restore: () => Promise<void>
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      const open = (token: string, person: Person, locationId?: string) => {
        const at = locationId ?? person.locationId ?? null
        setSession({ token, personId: person.id, locationId: at ?? undefined })
        set({ token, personId: person.id, locationId: at, pending: null, status: 'ready' })
        return { ok: true, person, needsStore: Boolean(person.storeChoices?.length) && !at }
      }

      return {
        token: null,
        personId: null,
        locationId: null,
        pending: null,
        status: 'restoring',

        beginSignIn: async (username, password) => {
          const r = await backend().signIn(username.trim(), password)
          if (!r.ok || !r.token) return { ok: false, error: r.error ?? 'That username and password do not match.' }
          if (r.needsCode) {
            set({ pending: { token: r.token, sentTo: r.sentTo ?? '' } })
            return { ok: true, needsCode: true, sentTo: r.sentTo }
          }
          if (!r.person) return { ok: false, error: 'Something went wrong. Try again.' }
          return open(r.token, r.person, r.locationId)
        },

        submitCode: async (code) => {
          const pending = get().pending
          if (!pending) return { ok: false, error: 'Start again — that sign-in has expired.' }
          const r = await backend().submitCode(pending.token, code.trim())
          if (!r.ok || !r.token || !r.person) return { ok: false, error: r.error ?? 'That code is not right.' }
          return open(r.token, r.person, r.locationId)
        },

        chooseStore: async (locationId) => {
          const { token, personId } = get()
          if (!token || !personId) return { ok: false, error: 'Sign in again.' }
          const r = await backend().chooseStore(token, locationId)
          if (!r.ok) return r
          setSession({ token, personId, locationId })
          set({ locationId })
          // The store's data is scoped to the store: fetch it afresh.
          await useData.getState().sync(true)
          return r
        },

        cancelSignIn: () => set({ pending: null }),

        signOut: async () => {
          const token = get().token
          setSession(null)
          set({ token: null, personId: null, locationId: null, pending: null })
          useData.getState().clearSession()
          if (token) await backend().signOut(token)
        },

        restore: async () => {
          const token = get().token
          if (!token) {
            set({ status: 'ready' })
            return
          }
          const session = await backend().whoami(token)
          if (!session) {
            setSession(null)
            set({ token: null, personId: null, locationId: null, status: 'ready' })
            return
          }
          open(token, session.person, session.locationId)
        },
      }
    },
    {
      name: 'legendary-crm-session-v5',
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // Only the token. A half-finished sign-in is never written to storage.
      partialize: (s) => ({ token: s.token }) as unknown as AuthState,
    },
  ),
)

/** The signed-in person, or null — with the store they chose, where they chose one. */
export const useCurrentUser = (): Person | null => {
  const personId = useAuth((s) => s.personId)
  const locationId = useAuth((s) => s.locationId)
  const users = useData((s) => s.users)
  if (!personId) return null
  const found = users.find((u) => u.id === personId)
  // A login that has been disabled cannot hold a session open.
  if (!found || !found.active) return null
  return found.storeChoices?.length && locationId ? { ...found, locationId } : found
}

/** True for a KL promoter who has not yet said which store they are at today. */
export const useNeedsStore = (): boolean => {
  const user = useCurrentUser()
  return Boolean(user?.storeChoices?.length) && !user?.locationId
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
