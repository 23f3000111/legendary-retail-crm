/**
 * Sign-in.
 *
 * Everyone signs in with their own six-digit PIN — there are no passwords and
 * no Google accounts. A PIN belongs to exactly one person (the store enforces
 * that on every change), so a PIN identifies them on its own and the keypad
 * needs no name to be picked first.
 *
 * Everything downstream reads the capability set rather than the person, so
 * moving this to a real server changes only this module: `signInWithPin` becomes
 * a request, and the rest of the app does not notice.
 *
 * Signing in also tells the activity log who is acting, so every entry written
 * from here on carries a name. A wrong PIN is written down too — a sign-in log
 * that only records the successes is not much of a sign-in log.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { can, type Capability, type Person } from '../data/people'
import { setAuditActor } from '../lib/audit'
import { useData } from './useData'

interface AuthState {
  personId: string | null
  /** Signs in the person holding this PIN. Returns them, or null. */
  signInWithPin: (pin: string) => Person | null
  signOut: () => void
}

/** A wrong PIN never reaches the log — only the fact that one was tried. */
const NOT_SIGNED_IN = { id: 'unknown', name: 'Someone at the keypad', role: 'promoter' } as const

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      personId: null,
      signInWithPin: (pin) => {
        const data = useData.getState()
        const person = data.users.find((u) => u.pin === pin && u.active)
        if (!person) {
          data.record({
            kind: 'session',
            action: 'session.pin_failed',
            summary: 'A PIN that belongs to nobody was entered at the keypad',
            actor: { ...NOT_SIGNED_IN },
          })
          return null
        }
        set({ personId: person.id })
        setAuditActor(person.id)
        data.record({
          kind: 'session',
          action: 'session.signed_in',
          summary: `${person.name} signed in`,
          entityId: person.id,
          locationId: person.locationId,
          actor: { id: person.id, name: person.name, role: person.role },
        })
        return person
      },
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
        set({ personId: null })
      },
    }),
    {
      name: 'legendary-crm-session-v3',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // After a refresh the session comes back before anything is clicked, so
      // the log has to be told who is here — otherwise the first action of the
      // day would be filed against nobody.
      onRehydrateStorage: () => (state) => setAuditActor(state?.personId ?? null),
    },
  ),
)

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
