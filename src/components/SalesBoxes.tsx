import { useMemo } from 'react'
import { StatTile } from './ui/StatTile'
import { Icon } from './ui/icons'
import { useData } from '../store/useData'
import { selectNotFiled, selectSalesPeriods, type Filter } from '../store/selectors'
import { tradingLocations } from '../data/locations'
import { formatDate, monthKey, monthLabel } from '../lib/dates'
import { num, rm } from '../lib/format'

/**
 * The four sales boxes every main page opens with (client, 1 November):
 * today's sales, live; yesterday's, as filed; the month so far; and last
 * month. The same four on the Overview, Stores, Analytics and Closings, and on
 * each store's own page for that store alone.
 *
 * `base` narrows them as the page itself is narrowed — one store, or the
 * stores, products and nationalities chosen on Analytics.
 */
export function SalesBoxes({
  base = {},
  scope,
}: {
  base?: Partial<Filter>
  /** Said over the boxes when a page has narrowed them. */
  scope?: string
}) {
  const data = useData()
  // The filter is compared by what it says, so a page can pass a fresh object.
  const key = JSON.stringify(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const p = useMemo(() => selectSalesPeriods(data, base), [data, key])

  // Yesterday is final once every store has filed it.
  const oneStore = base.locationIds?.length === 1 ? base.locationIds[0] : null
  const yesterday = p.yesterday.from
  // Of the main stores that file daily, those in and those due; a store that
  // has never filed has not started, so it is not counted as due.
  const daily = tradingLocations.filter((l) => l.cadence === 'daily' && l.channel === 'main')
  const filedYesterday = new Set(data.closings.filter((c) => c.period === yesterday).map((c) => c.locationId))
  const filed = daily.filter((l) => filedYesterday.has(l.id)).length
  const missing = selectNotFiled(data, yesterday).filter((id) => daily.some((l) => l.id === id)).length
  const filedNote = oneStore
    ? filedYesterday.has(oneStore)
      ? 'filed'
      : 'not filed yet'
    : filed + missing === 0
      ? 'nothing filed yet'
      : `${num(filed)} of ${num(filed + missing)} stores filed`

  const people = (n: number) => `${num(n)} ${n === 1 ? 'customer' : 'customers'}`

  const boxes = (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile
        label="Today sales"
        value={p.today.revenue}
        format={rm}
        fit
        footnote={`${people(p.today.customers)} · ${num(p.today.units)} units, live`}
        tone="violet"
        icon="chart"
      />
      <StatTile
        label="Yesterday sales"
        value={p.yesterday.revenue}
        format={rm}
        fit
        footnote={`${formatDate(yesterday)} · ${people(p.yesterday.customers)} · ${filedNote}`}
        tone="blue"
        icon="clipboard"
      />
      <StatTile
        label="Month to date sales"
        value={p.monthToDate.revenue}
        format={rm}
        fit
        footnote={`since ${formatDate(p.monthToDate.from)} · ${people(p.monthToDate.customers)}`}
        tone="cyan"
        icon="trophy"
      />
      <StatTile
        label="Last month sales"
        value={p.lastMonth.revenue}
        format={rm}
        fit
        footnote={`${monthLabel(monthKey(p.lastMonth.from))} · ${people(p.lastMonth.customers)}`}
        tone="teal"
        icon="wallet"
      />
    </div>
  )

  if (!scope) return boxes
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-3">
        <Icon name="filter" className="mt-px h-3.5 w-3.5 shrink-0" />
        {scope}
      </p>
      {boxes}
    </div>
  )
}
