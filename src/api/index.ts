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

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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
