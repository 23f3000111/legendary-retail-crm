/**
 * Test fixtures: a fresh, storage-free local backend with the sample history
 * loaded and somebody signed in, and the store filled from it.
 */
import { LocalBackend } from '../api/local'
import { useBackendForTests } from '../api'
import { seedPeople } from '../data/people'
import { DEMO_TODAY } from '../data/seed'
import { setSession } from '../lib/session'
import type { AuditEntry } from '../lib/audit'
import type { DateStr } from '../data/types'
import { useData } from './useData'

let seededAuditIds = new Set<string>()

/** Starts from the sample history, signed in as `as`. Returns the backend. */
export function startFixture(as = 'davy', today: DateStr = DEMO_TODAY, locationId?: string): LocalBackend {
  const lb = new LocalBackend(null)
  useBackendForTests(lb)
  lb.seed(today, false)
  useData.getState().clearSession()
  signInAs(lb, as, locationId)
  seededAuditIds = new Set(useData.getState().audit.map((e) => e.id))
  return lb
}

/** Switches who is signed in, refreshing the store for their view. */
export function signInAs(lb: LocalBackend, personId: string, locationId?: string): void {
  const person = seedPeople.find((p) => p.id === personId)
  const at = locationId ?? person?.locationId
  const token = lb.openSessionForTests(personId, at)
  setSession({ token, personId, locationId: at })
  useData.getState().applySnapshot(lb.loadSync(token), true)
}

/** Nobody signed in — the store keeps its copy, but the session is gone. */
export function signOutForTests(): void {
  setSession(null)
}

/** Entries written since the fixture started, newest first. */
export const written = (): AuditEntry[] =>
  useData.getState().audit.filter((e) => !seededAuditIds.has(e.id))

/** Waits for the queued backend writes to land. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 0))
