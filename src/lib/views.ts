/**
 * What a page was set to, read back when you come back to it (20 November, on
 * Analytics: "when we click on any clickable button that goes to another page
 * and then comeback to analytics then the filter I put gone").
 *
 * The values are kept for the browser tab (`src/store/useViews.ts`), so what
 * comes back may be from yesterday, or from an older version of the page.
 * These make it safe: every list there, dates real and in order, and never
 * past today; anything else is refused, and the page starts afresh.
 */
import { emptyFilter, type Filter, type ReportRule } from '../store/selectors'
import { chooseDates } from './periods'
import type { DateStr } from '../data/types'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (v: unknown): v is DateStr => typeof v === 'string' && DAY.test(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Analytics' filter, as it was left. */
export const restoreFilter = (saved: unknown, today: DateStr): Filter | null => {
  if (!isRecord(saved) || !isDay(saved.from) || !isDay(saved.to)) return null
  const { from, to } = chooseDates(saved.from, saved.to, today)
  return {
    ...emptyFilter(from, to),
    locationIds: strings(saved.locationIds),
    channels: strings(saved.channels) as Filter['channels'],
    regions: strings(saved.regions) as Filter['regions'],
    collectionIds: strings(saved.collectionIds) as Filter['collectionIds'],
    skuIds: strings(saved.skuIds),
    variants: strings(saved.variants) as Filter['variants'],
    countryCodes: strings(saved.countryCodes),
  }
}

/**
 * The sales report's rules, as they were left: the business date always
 * *between* two dates, and every other rule "one of these" (20 November:
 * "remove equal ... only keep between, from start date to end date").
 */
export const restoreRules = (saved: unknown, today: DateStr): ReportRule[] | null => {
  if (!Array.isArray(saved)) return null
  const out: ReportRule[] = []
  for (const r of saved) {
    if (!isRecord(r) || typeof r.id !== 'string') continue
    const id = r.id
    if (r.field === 'date') {
      const span = isRecord(r.span) ? r.span : {}
      if (!isDay(span.from) || !isDay(span.to)) continue
      out.push({ id, field: 'date', span: { op: 'between', ...chooseDates(span.from, span.to, today) } })
    } else if (r.field === 'store') out.push({ id, field: 'store', op: 'equal', locationIds: strings(r.locationIds) })
    else if (r.field === 'item') out.push({ id, field: 'item', op: 'equal', skuIds: strings(r.skuIds) })
    else if (r.field === 'nationality') out.push({ id, field: 'nationality', op: 'equal', countryCodes: strings(r.countryCodes) })
  }
  return out
}
