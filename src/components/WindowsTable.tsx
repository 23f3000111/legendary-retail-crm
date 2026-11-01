import type { ReactNode } from 'react'
import { FiguresTable, type FiguresColumn } from './ui/FiguresTable'
import { PAGE } from './ui/LoadMore'
import { useData } from '../store/useData'
import { SALES_WINDOWS, salesWindows, type SalesWindow } from '../store/selectors'
import { formatDateShort, monthKey, monthLabel } from '../lib/dates'

/** Each window's heading, with its days: "Yesterday · 31 Oct". `chosen` names the page's own dates. */
export function useWindowHeadings(chosen: string): Record<SalesWindow, string> {
  const today = useData((s) => s.today)
  const w = salesWindows(today)
  return {
    today: 'Today · live',
    yesterday: `Yesterday · ${formatDateShort(w.yesterday.from)}`,
    monthToDate: `Month to date · since ${formatDateShort(w.monthToDate.from)}`,
    lastMonth: `Last month · ${monthLabel(monthKey(w.lastMonth.from))}`,
    chosen,
  }
}

/**
 * A table by the four boxes' windows — today live, yesterday as filed, the
 * month so far and last month — with the page's own dates as the last column
 * (asked on 1 November, after Revision 9). Ten rows at a time, and a total at
 * the foot of every column.
 */
export function WindowsTable<T>({
  rows,
  rowKey,
  first,
  cell,
  total,
  chosen,
  pageKey,
  empty,
}: {
  rows: T[]
  rowKey: (row: T) => string
  /** What each row is. */
  first: FiguresColumn<T>
  /** A row's figure in one window. */
  cell: (row: T, window: SalesWindow) => ReactNode
  /** A window's figure at the foot. */
  total: (window: SalesWindow) => ReactNode
  /** The page's own dates, in words: "Last 30 days · 3 Oct to 1 Nov". */
  chosen: string
  /** Names the list: when it changes, the count starts again at ten. */
  pageKey?: string
  empty?: ReactNode
}) {
  const heading = useWindowHeadings(chosen)
  return (
    <FiguresTable<T>
      rows={rows}
      rowKey={rowKey}
      page={PAGE}
      pageKey={pageKey}
      empty={empty}
      columns={[
        first,
        ...SALES_WINDOWS.map((w) => ({
          header: heading[w],
          align: 'right' as const,
          render: (r: T) => cell(r, w),
          total: total(w),
        })),
      ]}
    />
  )
}

/** A window's figure: the one that leads, and the other under it. */
export function WindowFigure({ lead, sub, strong = false }: { lead: ReactNode; sub: ReactNode; strong?: boolean }) {
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap">
      <span className={strong ? 'font-semibold' : ''}>{lead}</span>
      <span className="text-[10.5px] text-ink-3">{sub}</span>
    </span>
  )
}

/** Nothing in that window. */
export function Dash() {
  return <span className="text-ink-3">—</span>
}
