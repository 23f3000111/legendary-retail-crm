import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { num } from '../../lib/format'

/** How many rows a long list shows before "Load more". */
export const PAGE = 10

/**
 * Ten at a time (client, 1 November: "load 10 items only, and a load more
 * button at the bottom to load 10 more"). A list of every dealer is 44 rows;
 * it opens on its first ten, and the buttons under it add ten more, or the
 * rest at once.
 *
 * `resetOn` names the list being shown. When it changes — another channel,
 * another filter, other rules — the count starts again at ten. Without
 * `page`, nothing is held back.
 */
export function usePaged<T>(rows: T[], { page, resetOn = '' }: { page?: number; resetOn?: string } = {}) {
  const size = page ?? Infinity
  const [state, setState] = useState({ key: resetOn, shown: size })
  const shown = state.key === resetOn ? state.shown : size
  const left = rows.length - shown
  const more: ReactNode =
    left > 0 ? (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon="chevronDown"
          onClick={() => setState({ key: resetOn, shown: shown + size })}
        >
          Load more · {num(Math.min(size, left))} of {num(left)} left
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState({ key: resetOn, shown: rows.length })}>
          Show all {num(rows.length)}
        </Button>
      </div>
    ) : null
  return {
    visible: left > 0 ? rows.slice(0, shown) : rows,
    /** Some rows are still held back, so a total under the list says it counts them all. */
    partial: left > 0,
    /** The buttons, for under the list: nothing once every row is showing. */
    more,
  }
}

/** "Total", or "Total · all 44" while the list shows only some of its rows. */
export const totalOf = (partial: boolean, count: number, label = 'Total') =>
  partial ? `${label} · all ${num(count)}` : label
