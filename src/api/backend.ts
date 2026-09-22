/**
 * What the app needs from a server, and nothing more.
 *
 * Every screen reads from the store; the store reads and writes through this.
 * There are two implementations: `supabase.ts`, the shared one every phone and
 * laptop at Legendary talks to, and `local.ts`, which keeps everything in one
 * browser for tests and for working on the code without a server.
 *
 * **Documents, not tables.** Everything that changes — a sale line, a closing,
 * an order, a target, a line in the activity log — is one document with a kind
 * and an id, written whole. Two promoters at the same counter write different
 * sale lines, so neither can overwrite the other; two people editing the same
 * order write the same document, and the last one wins, which for an order
 * moving down a chain is the right answer.
 *
 * **People are separate**, because they carry a password. A person's document
 * never includes it; the password is set and read back only through the two
 * calls below, which the server checks against the same authority table the
 * Logins screen uses.
 */
import type { Person } from '../data/people'
import type { DateStr } from '../data/types'

export type DocKind =
  | 'sale_line'
  | 'closing'
  | 'po'
  | 'target'
  | 'promotion'
  | 'audit'
  | 'alert_read'
  | 'setting'

export interface Doc {
  kind: DocKind
  id: string
  /** For anything that belongs to a store, so a promoter is sent only their own. */
  locationId?: string | null
  /** The trading day, for sale lines and closings. */
  day?: DateStr | null
  doc: unknown
  /** Server time. Used to ask for "everything since". */
  updatedAt: string
  updatedBy?: string | null
  /** A tombstone. Kept so every device learns of the removal. */
  deleted?: boolean
}

/** What a client sends: the server stamps the time. */
export type PutDoc = Omit<Doc, 'updatedAt' | 'updatedBy' | 'deleted'>

export interface Result {
  ok: boolean
  error?: string
}

export interface SignInResult extends Result {
  token?: string
  person?: Person
  /** The store this session is working at, for a promoter who chooses. */
  locationId?: string
  /** True where a code has been e-mailed and must be entered next. */
  needsCode?: boolean
  sentTo?: string
}

export interface Session {
  token: string
  person: Person
  locationId?: string
}

export interface Snapshot {
  /** Everyone, without passwords. Null on an incremental load where nobody changed. */
  people: Person[] | null
  docs: Doc[]
  /** Server time, to be sent back as `since` next time. */
  now: string
  /** The trading day on the server's clock, Malaysian time. */
  today: DateStr
}

export interface Backend {
  readonly mode: 'live' | 'local'

  signIn(username: string, password: string): Promise<SignInResult>
  submitCode(token: string, code: string): Promise<SignInResult>
  /** `locationName` is only for the log line; the id is what is checked. */
  chooseStore(token: string, locationId: string, locationName?: string): Promise<Result>
  signOut(token: string): Promise<void>
  /** The session behind a saved token, or null if it has ended. */
  whoami(token: string): Promise<Session | null>

  /** Everything this person may see, or only what changed since a server time. */
  load(token: string, since?: string): Promise<Snapshot>
  put(token: string, docs: PutDoc[]): Promise<Result>
  remove(token: string, kind: DocKind, ids: string[]): Promise<Result>

  addPerson(token: string, person: Person, password: string): Promise<Result>
  updatePerson(token: string, id: string, patch: Partial<Person>): Promise<Result>
  setPassword(token: string, targetId: string, password: string): Promise<Result>
  revealPassword(token: string, targetId: string): Promise<Result & { password?: string }>

  /** Wipes every document but keeps the people. IT and the MD only. */
  clearAllData(token: string): Promise<Result>

  /** Called whenever another device has written something. */
  onChange(listener: () => void): () => void
  /** Tells every other device something was written. */
  notify(): void
}

/** The person as the server sends them: never with a password. */
export const publicPerson = (p: Person): Person => {
  const copy = { ...p } as Person & { password?: unknown; passwordHistory?: unknown }
  delete copy.password
  delete copy.passwordHistory
  return copy
}

export const docKey = (kind: DocKind, id: string) => `${kind}:${id}`
