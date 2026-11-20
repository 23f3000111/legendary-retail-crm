import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Channel } from '../data/locations'
import type { DateStr } from '../data/types'

/**
 * What the head-office pages were set to, kept for the browser tab, so that
 * leaving a page and coming back finds it as it was (20 November, on
 * Analytics: "when we click on any clickable button that goes to another page
 * and then comeback to analytics then the filter I put gone").
 *
 * Kept as it was given, and read back through `src/lib/views.ts`, which makes
 * a value from yesterday or from an older version of the page safe to use.
 * Signing out forgets it all.
 */
export interface Views {
  /** Analytics: its filter and measure. */
  analytics?: { filter: unknown; metric: unknown }
  /** Stores: the dates chosen, if any, and the channel shown. */
  stores?: { dates: { from: DateStr; to: DateStr } | null; view: Channel | 'all' }
  /** Revenue: the sales report's rules, and the partners' month. */
  revenue?: { rules?: unknown; month?: string }
  keep: <K extends 'analytics' | 'stores' | 'revenue'>(page: K, value: Views[K]) => void
  forget: () => void
}

/** The tab's own storage, or memory where the browser will not give it. */
const memory = new Map<string, string>()
const tab = (): StateStorage => {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
  } catch {
    // Storage blocked: the pages still work, and forget on reload.
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  }
}

export const useViews = create<Views>()(
  persist(
    (set) => ({
      keep: (page, value) => set({ [page]: value } as Partial<Views>),
      forget: () => set({ analytics: undefined, stores: undefined, revenue: undefined }),
    }),
    {
      name: 'legendary-crm-views-v1',
      storage: createJSONStorage(tab),
      partialize: ({ analytics, stores, revenue }) => ({ analytics, stores, revenue }),
    },
  ),
)
