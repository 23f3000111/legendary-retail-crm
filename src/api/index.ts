/**
 * Which backend this build talks to.
 *
 * With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set at build time —
 * the deploy workflow reads them from the repository's secrets — every device
 * shares one server. Without them the app runs against one browser's storage,
 * which is what the tests and local development use.
 */
import type { Backend } from './backend'
import { LocalBackend } from './local'
import { SupabaseBackend } from './supabase'

/**
 * The project's base address. Supabase shows the URL in more than one place
 * and some of them carry the `/rest/v1` path; the client adds that itself, so
 * whatever was pasted in is trimmed back to the origin.
 */
export const projectUrl = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/(rest|auth|realtime|storage)\/v\d.*$/, '')
  }
}

const url = projectUrl(import.meta.env.VITE_SUPABASE_URL)
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

let instance: Backend | null = null

export function backend(): Backend {
  if (instance) return instance
  instance = url && key ? new SupabaseBackend(url, key) : new LocalBackend()
  return instance
}

/** The local backend, where the app is running on one. For the walkthrough panel and tests. */
export const localBackend = (): LocalBackend | null => {
  const b = backend()
  return b instanceof LocalBackend ? b : null
}

/** Tests swap in a fresh, storage-free instance. */
export const useBackendForTests = (b: Backend) => {
  instance = b
}

export const isShared = (): boolean => backend().mode === 'live'
