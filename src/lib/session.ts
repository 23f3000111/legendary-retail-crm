/**
 * The current session, held in a plain module.
 *
 * `useAuth` sets it and `useData` reads it, so neither store has to import the
 * other and there is no second copy of the token to keep in step. The token is
 * what every call to the server carries; the person and store are what the
 * activity log files an action against.
 */
export interface SessionRef {
  token: string
  personId: string
  /** The store this session is working at — fixed for most, chosen by a KL promoter. */
  locationId?: string
}

let current: SessionRef | null = null

export const setSession = (s: SessionRef | null) => {
  current = s
}

export const getSession = (): SessionRef | null => current

export const getSessionToken = (): string => current?.token ?? ''
