import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { Flag } from './ui/Flag'
import { FiguresTable } from './ui/FiguresTable'
import { SegmentedControl } from './ui/Field'
import { PAGE } from './ui/LoadMore'
import { Icon } from './ui/icons'
import { filterInWords } from './FilterBar'
import { canOpen } from './layout/nav'
import { useData } from '../store/useData'
import { useCurrentUser } from '../store/useAuth'
import { emptyFilter, salesWindows, selectStorePeriod, type Filter, type StorePeriod } from '../store/selectors'
import { CHANNEL_LABEL, locationById } from '../data/locations'
import { countryByCode } from '../data/countries'
import { TIER_LABEL } from '../data/products'
import { formatDate, formatDayShort, monthKey, monthLabel } from '../lib/dates'
import { monthDates } from '../lib/periods'
import { num, rm } from '../lib/format'
import type { DateStr } from '../data/types'

/** Some days the pop-up can show, and how it says them. */
export interface StorePeriodChoice {
  key: string
  /** On the switch: "Yesterday". */
  label: string
  from: DateStr
  to: DateStr
  /** Over the figures: "Yesterday, 19 Nov 2026". */
  when: string
}

const span = (from: DateStr, to: DateStr) => (from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`)

/** The four boxes' windows: today live, yesterday, the month so far, last month. */
export const windowChoices = (today: DateStr): StorePeriodChoice[] => {
  const w = salesWindows(today)
  return [
    { key: 'today', label: 'Today', ...w.today, when: `Today, ${formatDate(today)}, live` },
    { key: 'yesterday', label: 'Yesterday', ...w.yesterday, when: `Yesterday, ${formatDate(w.yesterday.from)}` },
    { key: 'monthToDate', label: 'Month to date', ...w.monthToDate, when: `Month to date, ${span(w.monthToDate.from, w.monthToDate.to)}` },
    { key: 'lastMonth', label: 'Last month', ...w.lastMonth, when: `Last month, ${monthLabel(monthKey(w.lastMonth.from))}` },
  ]
}

/** Dates chosen on a page. */
export const datesChoice = (from: DateStr, to: DateStr): StorePeriodChoice => ({
  key: 'dates',
  label: 'Dates chosen',
  from,
  to,
  when: span(from, to),
})

/** A dealer's or consignment partner's month, as keyed in. */
export const monthChoice = (month: string, today: DateStr): StorePeriodChoice => ({
  key: `month:${month}`,
  label: monthLabel(month),
  ...monthDates(month, today),
  when: monthLabel(month),
})

/**
 * One store, in a window over the page it was opened from (20 November: "when
 * click on any stores then its data should be open in pop-up with all the
 * details ... it says 20 unit sold but it's not showing what 20 unit sold").
 *
 * For the days it was opened on — or any of `periods`, on the switch — it
 * gives the sales, units and customers, how the filed days were paid, every
 * product sold with the prices it went at, where the customers came from, and
 * the days, each of which opens on its own. A dealer or consignment partner
 * shows its months as keyed in. `base` narrows it as the page is narrowed
 * (Analytics' products and countries). **Open full detail** goes on to the
 * store's own page — on the same day, for one day.
 */
export function StoreSalesModal({
  locationId,
  periods,
  initial,
  base,
  onClose,
}: {
  locationId: string
  periods: StorePeriodChoice[]
  /** Which of `periods` it opens on; the first if not given. */
  initial?: string
  /** Products and countries the page is narrowed to. */
  base?: Partial<Filter>
  onClose: () => void
}) {
  const data = useData()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [key, setKey] = useState(initial ?? periods[0]?.key)
  /** A day tapped in the list of days, seen alone. */
  const [day, setDay] = useState<DateStr | null>(null)

  const chosen = periods.find((p) => p.key === key) ?? periods[0]
  const period = day ? datesChoice(day, day) : chosen
  const baseKey = JSON.stringify(base ?? {})
  const filter = useMemo<Filter>(
    () => ({ ...emptyFilter(period.from, period.to), ...base, from: period.from, to: period.to }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.from, period.to, baseKey],
  )
  const p = useMemo(() => selectStorePeriod(data, filter, locationId), [data, filter, locationId])
  // Other days start at the top, where the boxes and the way back are.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 })
  }, [period.from, period.to])

  const store = locationById(locationId)
  const narrowed = base ? filterInWords({ ...emptyFilter(period.from, period.to), ...base, locationIds: [], channels: [], regions: [] }) : []
  const full = `/stores/${locationId}`
  const canOpenFull = Boolean(user && canOpen(user.role, full))
  const oneDay = period.from === period.to
  const openFull = () => {
    onClose()
    navigate(oneDay ? `${full}?day=${period.from}` : full)
  }

  const people = (n: number) => `${num(n)} ${n === 1 ? 'customer' : 'customers'}`
  const nothing = p.revenue === 0 && p.units === 0

  return (
    <Modal
      open
      onClose={onClose}
      title={store?.name ?? locationId}
      subtitle={
        <>
          {store ? `${CHANNEL_LABEL[store.channel]} · ${store.region} · ` : ''}
          {period.when}: {rm(p.revenue)} · {num(p.units)} units · {people(p.customers)}
        </>
      }
      width="max-w-3xl"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Done
          </Button>
          {canOpenFull && (
            <Button size="sm" variant="primary" iconRight="chevronRight" onClick={openFull}>
              Open full detail
            </Button>
          )}
        </>
      }
    >
      <div ref={top} className="space-y-5">
        {(periods.length > 1 || day) && (
          <div className="flex flex-wrap items-center gap-2">
            {day ? (
              <Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => setDay(null)}>
                Back to {chosen.label.toLowerCase()}
              </Button>
            ) : (
              <SegmentedControl<string>
                size="sm"
                value={chosen.key}
                onChange={setKey}
                options={periods.map((x) => ({ value: x.key, label: x.label }))}
              />
            )}
          </div>
        )}

        {narrowed.length > 0 && (
          <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-3">
            <Icon name="filter" className="mt-px h-3.5 w-3.5 shrink-0" />
            Only {narrowed.join(' · ')}, as on the page it was opened from.
          </p>
        )}

        <Boxes p={p} partner={Boolean(store && store.channel !== 'main')} narrowed={narrowed.length > 0} />

        {p.months.length > 0 && (
          <section>
            <p className="eyebrow mb-2">Months keyed in</p>
            <FiguresTable
              rows={p.months}
              rowKey={(m) => m.month}
              columns={[
                { header: 'Month', render: (m) => monthLabel(m.month) },
                { header: 'Keyed in by', render: (m) => m.keyed?.enteredBy ?? '—' },
                { header: 'Sales', align: 'right', render: (m) => rm(m.revenue), total: rm(p.months.reduce((a, m) => a + m.revenue, 0)) },
              ]}
            />
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              A month keyed in is one figure: it has no products or customers behind it.
            </p>
          </section>
        )}

        {p.skus.length > 0 && (
          <section>
            <p className="eyebrow mb-2">What sold, most first</p>
            <FiguresTable
              rows={p.skus}
              rowKey={(s) => s.skuId}
              page={PAGE}
              pageKey={`${period.from}:${period.to}`}
              columns={[
                {
                  header: 'Product',
                  render: (s) => (
                    <span className="flex flex-col">
                      <span className="leading-tight">{s.label}</span>
                      <span className="readout text-[10.5px] text-ink-3">{s.code}</span>
                    </span>
                  ),
                },
                {
                  header: 'Price',
                  align: 'right',
                  render: (s) => (
                    <span className="inline-flex flex-col items-end gap-0.5">
                      {s.prices.map((x) => (
                        <span key={`${x.tier}:${x.unitPrice}`} className="inline-flex items-center gap-1.5">
                          {x.tier !== store?.priceBasis && x.tier !== 'foc' && <Badge tone="neutral">{TIER_LABEL[x.tier]}</Badge>}
                          <span className="text-ink-2">{x.tier === 'foc' ? 'FOC' : rm(x.unitPrice)}</span>
                          <span className="text-[11px] text-ink-3">×{num(x.qty)}</span>
                        </span>
                      ))}
                    </span>
                  ),
                },
                { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(p.skus.reduce((a, s) => a + s.units, 0)) },
                { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(p.skus.reduce((a, s) => a + s.revenue, 0)) },
              ]}
            />
          </section>
        )}

        {p.countries.length > 0 && (
          <section>
            <p className="eyebrow mb-2">Where the customers came from</p>
            <FiguresTable
              rows={p.countries}
              rowKey={(c) => c.countryCode}
              page={PAGE}
              pageKey={`${period.from}:${period.to}`}
              columns={[
                {
                  header: 'Country',
                  render: (c) => (
                    <span className="flex items-center gap-2">
                      <Flag code={c.countryCode} size={16} />
                      {countryByCode(c.countryCode)?.name ?? c.countryCode}
                    </span>
                  ),
                },
                { header: 'Customers', align: 'right', render: (c) => num(c.customers), total: num(p.countries.reduce((a, c) => a + c.customers, 0)) },
                { header: 'Units', align: 'right', render: (c) => num(c.units), total: num(p.countries.reduce((a, c) => a + c.units, 0)) },
                { header: 'Sales', align: 'right', render: (c) => rm(c.revenue), total: rm(p.countries.reduce((a, c) => a + c.revenue, 0)) },
              ]}
            />
          </section>
        )}

        {p.days.length > 1 && (
          <section>
            <p className="eyebrow mb-2">Day by day · tap a day to see it alone</p>
            <FiguresTable
              rows={p.days}
              rowKey={(d) => d.day}
              page={PAGE}
              pageKey={`${period.from}:${period.to}`}
              onRowClick={(d) => setDay(d.day)}
              columns={[
                {
                  header: 'Day',
                  render: (d) => (
                    <span className="inline-flex items-center gap-1">
                      {formatDayShort(d.day)} {d.day.slice(0, 4)}
                      {d.day === data.today && <span className="text-[11px] text-ink-3">· live</span>}
                      <Icon name="chevronRight" className="h-3 w-3 text-ink-3" />
                    </span>
                  ),
                },
                { header: 'Customers', align: 'right', render: (d) => num(d.customers), total: num(p.customers) },
                { header: 'Units', align: 'right', render: (d) => num(d.units), total: num(p.days.reduce((a, d) => a + d.units, 0)) },
                { header: 'Sales', align: 'right', render: (d) => rm(d.revenue), total: rm(p.days.reduce((a, d) => a + d.revenue, 0)) },
              ]}
            />
          </section>
        )}

        {nothing && p.months.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-3">
            {store && store.channel !== 'main'
              ? `${store.shortName} reports a month at a time, and nothing is keyed in for these days.`
              : 'Nothing sold here on these days.'}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Sales, units, customers, and how the filed days were paid. */
function Boxes({ p, partner, narrowed }: { p: StorePeriod; partner: boolean; narrowed: boolean }) {
  const box = (label: string, value: ReactNode, note?: string, strong = false) => (
    <div key={label} className="min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <div className={`readout mt-1 text-[16px] ${strong ? 'font-semibold text-primary' : 'text-ink'}`}>{value}</div>
      {note && <p className="mt-0.5 text-[11px] text-ink-3">{note}</p>}
    </div>
  )
  const t = p.tender
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {box('Sales', rm(p.revenue), undefined, true)}
      {box('Units', num(p.units))}
      {box('Customers', num(p.customers), 'one sale is one customer')}
      {partner
        ? box('Paid', '—', 'reported once a month')
        : t
          ? box(
              'Paid',
              <span className="block space-y-0.5 text-[12.5px] leading-snug">
                <span className="block">Cash {rm(t.cash)}</span>
                <span className="block">Card {rm(t.card)}</span>
                {t.ewallet > 0 && <span className="block">E-wallet {rm(t.ewallet)}</span>}
              </span>,
              `as filed, ${num(t.days)} ${t.days === 1 ? 'day' : 'days'}`,
            )
          : box('Paid', '—', narrowed ? 'a day is paid as a whole, not by product or country' : 'known once the day is filed')}
    </div>
  )
}
