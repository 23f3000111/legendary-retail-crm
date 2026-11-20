import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { useAuth } from './useAuth'
import { inOutletOrder, type OutletOrder } from '../lib/outletOrder'
import type { Channel } from '../data/locations'

/** A list of outlets: highest first, by its figures, or in the person's own order. */
export type ListMode = 'value' | 'mine'

interface Mine {
  order: OutletOrder
  /** Each list's choice, by the list's name: "stores", "analytics-stores", … */
  modes: Record<string, ListMode>
}

interface OutletOrders {
  byPerson: Record<string, Mine>
  arrange: (personId: string, channel: Channel, ids: string[] | null) => void
  setMode: (personId: string, list: string, mode: ListMode) => void
}

/** The device's own storage, or memory where the browser will not give it. */
const memory = new Map<string, string>()
const device = (): StateStorage => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Storage blocked: arranging still works, until the page is reloaded.
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  }
}

const none = (): Mine => ({ order: {}, modes: {} })

/**
 * Each person's own order for the outlets, and each list's choice between
 * highest first and that order (20 November: "a drag option for all the
 * outlets ... so client can drag the things and placed as per their
 * choice"). Kept on the device, per person, as "Hide other notes" is: one
 * person's arrangement never changes anybody else's lists.
 */
export const useOutletOrders = create<OutletOrders>()(
  persist(
    (set) => ({
      byPerson: {},
      arrange: (personId, channel, ids) =>
        set((s) => {
          const mine = s.byPerson[personId] ?? none()
          const order = { ...mine.order }
          if (ids) order[channel] = ids
          else delete order[channel]
          return { byPerson: { ...s.byPerson, [personId]: { ...mine, order } } }
        }),
      setMode: (personId, list, mode) =>
        set((s) => {
          const mine = s.byPerson[personId] ?? none()
          return { byPerson: { ...s.byPerson, [personId]: { ...mine, modes: { ...mine.modes, [list]: mode } } } }
        }),
    }),
    {
      name: 'legendary-crm-outlet-order-v1',
      storage: createJSONStorage(device),
      partialize: ({ byPerson }) => ({ byPerson }),
    },
  ),
)

export interface OutletSort {
  list: string
  mode: ListMode
  setMode: (mode: ListMode) => void
  order: OutletOrder
  /** Rows as the list shows them: as given when highest first, or in the person's order. */
  sort: <T>(rows: T[], idOf: (row: T) => string) => T[]
}

/** One list's order for whoever is signed in. `fallback` is how the list opens until they choose. */
export function useOutletSort(list: string, fallback: ListMode): OutletSort {
  const personId = useAuth((s) => s.personId) ?? 'nobody'
  const mine = useOutletOrders((s) => s.byPerson[personId])
  const setModeFor = useOutletOrders((s) => s.setMode)
  const mode = mine?.modes[list] ?? fallback
  const order = mine?.order ?? {}
  return {
    list,
    mode,
    setMode: (m) => setModeFor(personId, list, m),
    order,
    sort: (rows, idOf) => (mode === 'mine' ? inOutletOrder(rows, idOf, order) : rows),
  }
}
