import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Icon } from '../../components/ui/icons'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/DataTable'
import { FiguresTable } from '../../components/ui/FiguresTable'
import { SegmentedControl, TextInput } from '../../components/ui/Field'
import { useToasts } from '../../components/ui/Toast'
import { PAGE } from '../../components/ui/LoadMore'
import { SalesBoxes } from '../../components/SalesBoxes'
import { SalesCalendar } from '../../components/SalesCalendar'
import { StoreSalesModal, datesChoice, windowChoices } from '../../components/StoreSales'
import { OutletOrderControl } from '../../components/OutletOrderControl'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useViews } from '../../store/useViews'
import { useOutletSort } from '../../store/useOutletOrder'
import {
  emptyFilter,
  salesWindows,
  selectSalesPeriods,
  selectStoreSales,
  selectStoreTotals,
  type PeriodSales,
  type StoreSalesRow,
  type StoreTotal,
} from '../../store/selectors'
import { CHANNELS, CHANNEL_PLURAL, locationById, locations, tradingLocations } from '../../data/locations'
import { formatDate, monthKey, monthLabel } from '../../lib/dates'
import { chooseDates } from '../../lib/periods'
import { downloadCsv } from '../../lib/exportCsv'
import { openPrintReport } from '../../lib/printReport'
import { num, rm } from '../../lib/format'
import type { Channel } from '../../data/locations'
import type { DateStr } from '../../data/types'

type View = Channel | 'all'

type Period = 'today' | 'yesterday' | 'monthToDate' | 'lastMonth'
const PERIODS: Period[] = ['today', 'yesterday', 'monthToDate', 'lastMonth']

/**
 * The estate — every place Legendary sells, in one list.
 *
 * Sales at a glance (client, 1 November): the same four boxes as the other
 * main pages, and a table of every store's today, yesterday, month so far and
 * last month, with a total at the foot of each column. A store that reports a
 * month at a time shows a dash for the days it does not report.
 *
 * **Dates** (20 November: "put calendars to select start date and end date,
 * and if they select the dates only selected data should appear"): with From
 * and To chosen, the table is those days alone — each store's sales, units
 * and customers — and so are the exports. Clear them for the four windows.
 *
 * **A store opens in a pop-up first** ("it says 20 unit sold but it's not
 * showing what 20 unit sold"): what sold and at what price, who bought, the
 * days and how they were paid, for the window or the dates tapped, and then
 * **Open full detail** for its page. The dates and the channel shown are
 * kept when you leave the page and come back.
 *
 * Finance opens on the stores themselves: no boxes (16 November).
 */
export function Locations() {
  const data = useData()
  const user = useCurrentUser()
  const finance = user?.role === 'finance'
  const push = useToasts((s) => s.push)
  const keep = useViews((s) => s.keep)
  const [kept] = useState(() => useViews.getState().stores)
  const [view, setViewState] = useState<View>(kept?.view ?? 'main')
  const [dates, setDatesState] = useState<{ from: DateStr; to: DateStr } | null>(kept?.dates ?? null)
  const [query, setQuery] = useState('')
  /** A store opened, and the window it opens on. */
  const [opened, setOpened] = useState<{ id: string; window?: Period } | null>(null)
  // Highest first, or the person's own order (20 November: "a drag option for all the outlets").
  const order = useOutletSort('stores', 'value')

  const setView = (v: View) => {
    setViewState(v)
    keep('stores', { dates, view: v })
  }
  const setDates = (d: { from: DateStr; to: DateStr } | null) => {
    setDatesState(d)
    keep('stores', { dates: d, view })
  }
  const pick = (from: DateStr, to: DateStr) => {
    if (!from && !to) return setDates(null)
    setDates(chooseDates(from || to, to || from, data.today))
  }

  const windows = salesWindows(data.today)
  const allRows = useMemo(() => selectStoreSales(data), [data])
  const dateRows = useMemo(() => (dates ? selectStoreTotals(data, emptyFilter(dates.from, dates.to)) : []), [data, dates])

  const shows = (id: string) => {
    const l = locationById(id)
    const q = query.trim().toLowerCase()
    return Boolean(l && (view === 'all' || l.channel === view) && (!q || `${l.name} ${l.code} ${l.region}`.toLowerCase().includes(q)))
  }
  const rows = useMemo(
    () =>
      order.sort(
        allRows
          .filter((r) => shows(r.locationId))
          .sort((a, b) => b.monthToDate.revenue - a.monthToDate.revenue || b.lastMonth.revenue - a.lastMonth.revenue),
        (r) => r.locationId,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, view, query, order.mode, order.order],
  )
  const chosenRows = useMemo(
    () => order.sort(dateRows.filter((r) => shows(r.locationId)), (r) => r.locationId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateRows, view, query, order.mode, order.order],
  )

  const coming = locations.filter((l) => l.status === 'coming')
  const sum = (p: Period) => rows.reduce((a, r) => a + r[p].revenue, 0)
  const chosenSum = (k: 'revenue' | 'units' | 'customers') => chosenRows.reduce((a, r) => a + r[k], 0)
  const monthly = (id: string) => locationById(id)?.cadence === 'monthly'
  const datesWords = dates ? (dates.from === dates.to ? formatDate(dates.from) : `${formatDate(dates.from)} to ${formatDate(dates.to)}`) : ''

  const PERIOD_LABEL: Record<Period, string> = {
    today: 'Today sales',
    yesterday: 'Yesterday sales',
    monthToDate: 'Month to date sales',
    lastMonth: 'Last month sales',
  }
  const PERIOD_NOTE: Record<Period, string> = {
    today: 'live',
    yesterday: formatDate(windows.yesterday.from),
    monthToDate: `since ${formatDate(windows.monthToDate.from)}`,
    lastMonth: monthLabel(monthKey(windows.lastMonth.from)),
  }

  const figure = (r: StoreSalesRow, p: Period) => {
    // A partner that reports once a month has no days to show.
    if (p !== 'lastMonth' && monthly(r.locationId)) return <span className="text-ink-3">—</span>
    const f: PeriodSales = r[p]
    return (
      // Each figure opens on its own days (20 November).
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpened({ id: r.locationId, window: p })
        }}
        title={`What made ${rm(f.revenue)}`}
        className="inline-flex flex-col items-end rounded-md px-1 -mx-1 transition-colors hover:bg-primary/8 hover:text-primary"
      >
        <span className={p === 'monthToDate' ? 'font-semibold' : ''}>{rm(f.revenue)}</span>
        {f.customers > 0 && (
          <span className="text-[10.5px] text-ink-3">
            {num(f.customers)} {f.customers === 1 ? 'customer' : 'customers'}
          </span>
        )}
      </button>
    )
  }

  const storeCell = (id: string) => {
    const l = locationById(id)!
    return (
      <span className="flex flex-col">
        <span className="flex items-center gap-1 leading-tight">
          {l.shortName}
          <Icon name="chevronRight" className="h-3 w-3 shrink-0 text-ink-3" />
        </span>
        <span className="readout text-[10.5px] text-ink-3">
          {l.code} · {l.region}
        </span>
      </span>
    )
  }

  const exportRows = () =>
    dates
      ? downloadCsv(
          `legendary-stores-${dates.from}-to-${dates.to}.csv`,
          ['From', 'To', 'Store', 'Code', 'Channel', 'Region', 'Sales MYR', 'Units', 'Customers'],
          [
            ...chosenRows.map((r) => {
              const l = locationById(r.locationId)!
              return [dates.from, dates.to, l.name, l.code, l.channel, l.region, r.revenue, r.units, r.customers]
            }),
            [dates.from, dates.to, 'Total', '', '', '', Math.round(chosenSum('revenue') * 100) / 100, chosenSum('units'), chosenSum('customers')],
          ],
        )
      : downloadCsv(
          `legendary-stores-${data.today}.csv`,
          [
            'As at',
            'Store',
            'Code',
            'Channel',
            'Region',
            `Today ${windows.today.from} MYR`,
            `Yesterday ${windows.yesterday.from} MYR`,
            `Month to date ${windows.monthToDate.from} to ${windows.monthToDate.to} MYR`,
            `Last month ${monthKey(windows.lastMonth.from)} MYR`,
          ],
          [
            ...rows.map((r) => {
              const l = locationById(r.locationId)!
              return [data.today, l.name, l.code, l.channel, l.region, ...PERIODS.map((p) => r[p].revenue)]
            }),
            [data.today, 'Total', '', '', '', ...PERIODS.map((p) => Math.round(sum(p) * 100) / 100)],
          ],
        )

  const printRows = () => {
    const title = `Stores · ${view === 'all' ? 'every store' : CHANNEL_PLURAL[view]}`
    const ok = dates
      ? openPrintReport({
          title,
          subtitle: datesWords,
          boxes: [
            { label: 'Sales', value: rm(chosenSum('revenue')) },
            { label: 'Units', value: num(chosenSum('units')) },
            { label: 'Customers', value: num(chosenSum('customers')) },
            { label: 'Stores that sold', value: num(chosenRows.filter((r) => r.revenue || r.units).length) },
          ],
          chart: {
            title: 'Sales by store',
            bars: chosenRows
              .filter((r) => r.revenue > 0)
              .slice(0, 20)
              .map((r) => ({ label: locationById(r.locationId)?.shortName ?? r.locationId, value: r.revenue, display: rm(r.revenue) })),
          },
          table: {
            headers: ['Store', 'Sales', 'Units', 'Customers'],
            right: [false, true, true, true],
            rows: chosenRows.map((r) => [locationById(r.locationId)?.name ?? r.locationId, rm(r.revenue), num(r.units), num(r.customers)]),
            total: ['Total', rm(chosenSum('revenue')), num(chosenSum('units')), num(chosenSum('customers'))],
          },
        })
      : (() => {
          const boxes = selectSalesPeriods(data, { locationIds: rows.map((r) => r.locationId) })
          return openPrintReport({
            title,
            subtitle: `As at ${formatDate(data.today)}`,
            boxes: PERIODS.map((p) => ({ label: PERIOD_LABEL[p], value: rm(boxes[p].revenue), note: PERIOD_NOTE[p] })),
            chart: {
              title: 'Month to date, by store',
              bars: rows
                .filter((r) => r.monthToDate.revenue > 0)
                .slice(0, 20)
                .map((r) => ({
                  label: locationById(r.locationId)?.shortName ?? r.locationId,
                  value: r.monthToDate.revenue,
                  display: rm(r.monthToDate.revenue),
                })),
            },
            table: {
              headers: ['Store', ...PERIODS.map((p) => PERIOD_LABEL[p])],
              right: [false, true, true, true, true],
              rows: rows.map((r) => [
                locationById(r.locationId)?.name ?? r.locationId,
                ...PERIODS.map((p) => (p !== 'lastMonth' && monthly(r.locationId) ? '—' : rm(r[p].revenue))),
              ]),
              total: ['Total', ...PERIODS.map((p) => rm(sum(p)))],
            },
          })
        })()
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  const count = dates ? chosenRows.length : rows.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Legendary Group</p>
          <h1 className="page-title mt-1">Stores</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {tradingLocations.length} trading, {coming.length} opening soon.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" onClick={exportRows}>
            CSV
          </Button>
          <Button variant="primary" icon="printer" onClick={printRows}>
            PDF report
          </Button>
        </div>
      </div>

      {!finance && <SalesBoxes />}

      <Panel>
        <PanelHeader
          eyebrow="Estate"
          title={`${count} ${view === 'all' ? 'stores' : CHANNEL_PLURAL[view].toLowerCase()}${dates ? ` · ${datesWords}` : ''}`}
          meta={
            dates
              ? `Only ${datesWords}: each store's sales, units and customers for those days. Days that have ended are as filed; today is live. Tap a store to see what is behind its figures.`
              : view === 'consignment' || view === 'dealer'
                ? 'Dealers and consignment partners report a month at a time: last month is their figure, and the days show a dash. Tap one to open it.'
                : `Today is live; yesterday and the month are as filed. ${view === 'main' ? 'Every main store at once' : `${PAGE} at a time`}; tap a store, or one of its figures, to see what is behind it.`
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stores"
                className="h-8 w-[170px] text-[12.5px]"
              />
              <SegmentedControl<View>
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'main', label: 'Main' },
                  { value: 'dealer', label: 'Dealers' },
                  { value: 'consignment', label: 'Consignment' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
          }
        />
        <Rule />
        <PanelBody className="space-y-4">
          {/* From and To (20 November): choose them and the table is those days alone. */}
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <label className="block">
              <span className="eyebrow mb-1 block">From</span>
              <TextInput
                type="date"
                aria-label="From"
                value={dates?.from ?? ''}
                max={data.today}
                onChange={(e) => pick(e.target.value, dates?.to ?? '')}
                className="h-9 w-[156px] text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">To</span>
              <TextInput
                type="date"
                aria-label="To"
                value={dates?.to ?? ''}
                max={data.today}
                onChange={(e) => pick(dates?.from ?? '', e.target.value)}
                className="h-9 w-[156px] text-[12.5px]"
              />
            </label>
            {dates ? (
              <Button size="sm" variant="secondary" icon="x" onClick={() => setDates(null)} className="mb-0.5">
                Clear dates
              </Button>
            ) : (
              <p className="mb-1.5 text-[12px] text-ink-3">Choose dates to see only those days. Until then: today, yesterday, the month and last month.</p>
            )}
            <div className="mb-0.5 ml-auto">
              <OutletOrderControl sort={order} channels={view === 'all' ? CHANNELS : [view]} />
            </div>
          </div>

          {dates ? (
            chosenRows.length ? (
              <FiguresTable<StoreTotal>
                rows={chosenRows}
                rowKey={(r) => r.locationId}
                onRowClick={(r) => setOpened({ id: r.locationId })}
                page={view === 'main' ? undefined : PAGE}
                pageKey={`${view}|${query}|${dates.from}|${dates.to}`}
                columns={[
                  { header: 'Store', render: (r) => storeCell(r.locationId) },
                  { header: `Sales · ${datesWords}`, align: 'right', render: (r) => rm(r.revenue), total: rm(chosenSum('revenue')) },
                  { header: 'Units', align: 'right', render: (r) => num(r.units), total: num(chosenSum('units')) },
                  { header: 'Customers', align: 'right', render: (r) => num(r.customers), total: num(chosenSum('customers')) },
                ]}
              />
            ) : (
              <EmptyState icon="search" title="No stores match" body="Try a different channel, or clear the search box." />
            )
          ) : rows.length ? (
            <FiguresTable
              rows={rows}
              rowKey={(r) => r.locationId}
              onRowClick={(r) => setOpened({ id: r.locationId })}
              // The main stores all at once (16 November: "I just want to see the
              // main store. All my stores"); the forty-odd dealers ten at a time.
              page={view === 'main' ? undefined : PAGE}
              pageKey={`${view}|${query}`}
              columns={[
                { header: 'Store', render: (r) => storeCell(r.locationId) },
                ...PERIODS.map((p) => ({
                  header: `${PERIOD_LABEL[p]} · ${PERIOD_NOTE[p]}`,
                  align: 'right' as const,
                  render: (r: StoreSalesRow) => figure(r, p),
                  total: rm(sum(p)),
                })),
              ]}
            />
          ) : (
            <EmptyState icon="search" title="No stores match" body="Try a different channel, or clear the search box." />
          )}
        </PanelBody>
      </Panel>

      <SalesCalendar />

      {coming.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Pipeline" title={`${coming.length} opening soon`} meta="Set up in the system, not yet trading." />
          <Rule />
          <PanelBody>
            <ul className="flex flex-wrap gap-2">
              {coming.map((l) => (
                <li key={l.id} className="rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-[12.5px] text-ink">
                  {l.name}
                  <span className="ml-2 text-[11px] text-ink-3">{l.region}</span>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {opened && (
        <StoreSalesModal
          locationId={opened.id}
          periods={dates ? [datesChoice(dates.from, dates.to)] : windowChoices(data.today)}
          initial={dates ? undefined : (opened.window ?? (monthly(opened.id) ? 'lastMonth' : 'monthToDate'))}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  )
}
