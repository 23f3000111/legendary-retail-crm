import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { salesWindows, selectSalesPeriods, selectStoreSales, type PeriodSales, type StoreSalesRow } from '../../store/selectors'
import { CHANNEL_PLURAL, locationById, locations, tradingLocations } from '../../data/locations'
import { formatDate, monthKey, monthLabel } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { openPrintReport } from '../../lib/printReport'
import { num, rm } from '../../lib/format'
import type { Channel } from '../../data/locations'

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
 * The table shows ten stores at a time, and the calendar of daily sales sits
 * above the stores opening soon (both asked on 1 November, after Revision 9).
 *
 * The sales report has moved to Analytics, where its dates, stores, items and
 * nationalities drive the whole page (16 November: "I'll do this in the
 * analytics"). Finance opens on the stores themselves: no boxes, "just keep
 * the calendar, and then pipeline is good".
 */
export function Locations() {
  const navigate = useNavigate()
  const data = useData()
  const user = useCurrentUser()
  const finance = user?.role === 'finance'
  const push = useToasts((s) => s.push)
  const [view, setView] = useState<View>('main')
  const [query, setQuery] = useState('')

  const windows = salesWindows(data.today)
  const allRows = useMemo(() => selectStoreSales(data), [data])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows
      .filter((r) => {
        const l = locationById(r.locationId)
        return l && (view === 'all' || l.channel === view)
      })
      .filter((r) => {
        const l = locationById(r.locationId)!
        return !q || `${l.name} ${l.code} ${l.region}`.toLowerCase().includes(q)
      })
      .sort((a, b) => b.monthToDate.revenue - a.monthToDate.revenue || b.lastMonth.revenue - a.lastMonth.revenue)
  }, [allRows, view, query])

  const coming = locations.filter((l) => l.status === 'coming')
  const sum = (p: Period) => rows.reduce((a, r) => a + r[p].revenue, 0)
  const monthly = (id: string) => locationById(id)?.cadence === 'monthly'

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
      <span className="inline-flex flex-col items-end">
        <span className={p === 'monthToDate' ? 'font-semibold' : ''}>{rm(f.revenue)}</span>
        {f.customers > 0 && (
          <span className="text-[10.5px] text-ink-3">
            {num(f.customers)} {f.customers === 1 ? 'customer' : 'customers'}
          </span>
        )}
      </span>
    )
  }

  const exportRows = () =>
    downloadCsv(
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
    const boxes = selectSalesPeriods(data, { locationIds: rows.map((r) => r.locationId) })
    const ok = openPrintReport({
      title: `Stores · ${view === 'all' ? 'every store' : CHANNEL_PLURAL[view]}`,
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
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

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
          title={`${rows.length} ${view === 'all' ? 'stores' : CHANNEL_PLURAL[view].toLowerCase()}`}
          meta={
            view === 'consignment' || view === 'dealer'
              ? 'Dealers and consignment partners report a month at a time, on Dealer sales: last month is their figure, and the days show a dash.'
              : `Today is live; yesterday and the month are as filed. ${PAGE} at a time; tap a store to open it.`
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
        <PanelBody>
          {rows.length ? (
            <FiguresTable
              rows={rows}
              rowKey={(r) => r.locationId}
              onRowClick={(r) => navigate(`/stores/${r.locationId}`)}
              page={PAGE}
              pageKey={`${view}|${query}`}
              columns={[
                {
                  header: 'Store',
                  render: (r) => {
                    const l = locationById(r.locationId)!
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
                  },
                },
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
    </div>
  )
}
