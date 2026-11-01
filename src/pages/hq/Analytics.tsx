import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Icon } from '../../components/ui/icons'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/DataTable'
import { FiguresTable } from '../../components/ui/FiguresTable'
import { PAGE, totalOf, usePaged } from '../../components/ui/LoadMore'
import { useToasts } from '../../components/ui/Toast'
import { FilterBar, filterInWords } from '../../components/FilterBar'
import { SalesBoxes } from '../../components/SalesBoxes'
import { SalesReport } from '../../components/SalesReport'
import { CountryDetailModal } from '../../components/CountryDetail'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars } from '../../components/charts/SkuBars'
import { HeatCalendar } from '../../components/charts/HeatCalendar'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import {
  activeFilterCount,
  countryCoverage,
  emptyFilter,
  METRIC_LABEL,
  metricValue,
  selectChannelSplit,
  selectKpis,
  selectLocationSparkline,
  selectLocationRows,
  selectOriginMix,
  salesWindows,
  selectSkusForCountry,
  selectSkuSales,
  selectTimeSeries,
  type Filter,
  type Metric,
  type SkuSales,
  type SkuSalesRow,
} from '../../store/selectors'
import { CHANNEL_PLURAL } from '../../data/locations'
import { countryByCode } from '../../data/countries'
import { addDays, formatDate, formatDateShort, monthKey, monthLabel } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { openPrintReport } from '../../lib/printReport'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The screen for digging.
 *
 * One filter drives every panel, so a change moves the whole page at once. When
 * a nationality is chosen the page adds a panel showing exactly what that
 * country bought — the question the airport stores exist to answer.
 *
 * The figures come first and the graphs last (client, 1 November): the four
 * sales boxes, narrowed by the filter's stores, products and countries; the
 * countries and channels; the sales report; product performance by the same
 * four windows as the boxes; every store, ten at a time; then the trend and
 * the trading pattern at the foot of the page.
 */

type Window = 'today' | 'yesterday' | 'monthToDate' | 'lastMonth' | 'chosen'
const WINDOWS: Window[] = ['today', 'yesterday', 'monthToDate', 'lastMonth', 'chosen']
export function Analytics() {
  const navigate = useNavigate()
  const data = useData()
  const push = useToasts((s) => s.push)
  const [filter, setFilter] = useState<Filter>(() =>
    emptyFilter(addDays(data.today, -29), data.today),
  )
  const [metric, setMetric] = useState<Metric>('revenue')
  /** A country opened from "Which countries bought". */
  const [country, setCountry] = useState<string | null>(null)

  const kpis = useMemo(() => selectKpis(data, filter), [data, filter])
  const trend = useMemo(() => selectTimeSeries(data, filter, metric), [data, filter, metric])
  const heat = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  const mix = useMemo(() => selectOriginMix(data, filter), [data, filter])
  const rows = useMemo(() => selectLocationRows(data, filter, metric), [data, filter, metric])
  const channels = useMemo(() => selectChannelSplit(data, filter), [data, filter])
  const coverage = useMemo(() => countryCoverage(data, filter), [data, filter])

  const format = (n: number) => (metric === 'revenue' ? rm(n) : num(Math.round(n)))
  const formatCompact = (n: number) => (metric === 'revenue' ? rmCompact(n) : num(Math.round(n)))

  const channelSlices: DonutSlice[] = channels.map((c) => ({
    key: c.channel,
    label: CHANNEL_PLURAL[c.channel],
    value: metric === 'revenue' ? c.revenue : c.units,
  }))

  const focusCountry = filter.countryCodes.length === 1 ? filter.countryCodes[0] : null
  const countryBasket = useMemo(
    () => (focusCountry ? selectSkusForCountry(data, filter, focusCountry) : []),
    [data, filter, focusCountry],
  )

  const empty = kpis.current.revenue === 0 && kpis.current.units === 0
  const period = `${formatDate(filter.from)} to ${formatDate(filter.to)}`

  // Every store in view, ten at a time; the total counts them all.
  const stores = usePaged(rows, { page: PAGE, resetOn: JSON.stringify([filter, metric]) })
  const totals = {
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    units: rows.reduce((a, r) => a + r.units, 0),
    monthToDate: rows.reduce((a, r) => a + r.monthToDate, 0),
  }

  // The boxes keep their own four periods; the rest of the filter narrows them.
  const boxBase: Partial<Filter> = {
    locationIds: filter.locationIds,
    channels: filter.channels,
    regions: filter.regions,
    collectionIds: filter.collectionIds,
    skuIds: filter.skuIds,
    variants: filter.variants,
    countryCodes: filter.countryCodes,
  }

  // Product performance by the boxes' four windows, and the dates set above
  // (asked on 1 November, after Revision 9). The boxes' base is the filter
  // without its dates, so the filter alone decides when to work it out again.
  const skuRows = useMemo(
    () => selectSkuSales(data, boxBase, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filter],
  )
  const windows = salesWindows(data.today)
  const WINDOW_LABEL: Record<Window, string> = {
    today: 'Today · live',
    yesterday: `Yesterday · ${formatDateShort(windows.yesterday.from)}`,
    monthToDate: `Month to date · since ${formatDateShort(windows.monthToDate.from)}`,
    lastMonth: `Last month · ${monthLabel(monthKey(windows.lastMonth.from))}`,
    chosen: `Dates above · ${formatDateShort(filter.from)} to ${formatDateShort(filter.to)}`,
  }
  const skuTotal = (w: Window): SkuSales =>
    skuRows.reduce((a, r) => ({ units: a.units + r[w].units, revenue: a.revenue + r[w].revenue }), { units: 0, revenue: 0 })
  // The measure chosen above leads; the other sits under it.
  const skuFigure = (s: SkuSales, strong = false) => {
    if (s.units === 0 && s.revenue === 0) return <span className="text-ink-3">—</span>
    const units = `${num(s.units)} ${s.units === 1 ? 'unit' : 'units'}`
    return (
      <span className="inline-flex flex-col items-end whitespace-nowrap">
        <span className={strong ? 'font-semibold' : ''}>{metric === 'revenue' ? rm(s.revenue) : units}</span>
        <span className="text-[10.5px] text-ink-3">{metric === 'revenue' ? units : rm(s.revenue)}</span>
      </span>
    )
  }
  const skuSorted = useMemo(
    () =>
      metric === 'revenue'
        ? skuRows
        : [...skuRows].sort(
            (a, b) =>
              b.monthToDate.units - a.monthToDate.units ||
              b.lastMonth.units - a.lastMonth.units ||
              b.chosen.units - a.chosen.units,
          ),
    [skuRows, metric],
  )
  // The chart draws the dates set above, the best twelve.
  const skuBars = useMemo(
    () =>
      skuRows
        .map((r) => ({ skuId: r.skuId, label: r.label, ...r.chosen }))
        .filter((r) => r.units > 0 || r.revenue > 0)
        .sort((a, b) => (metric === 'revenue' ? b.revenue - a.revenue : b.units - a.units))
        .slice(0, 12),
    [skuRows, metric],
  )

  // The period goes in the file, and on every row (client, 20 October).
  const exportSummary = () =>
    downloadCsv(
      `legendary-analytics-${filter.from}-to-${filter.to}.csv`,
      ['From', 'To', 'Store', 'Channel', 'Region', 'Revenue MYR', 'Units', 'Month to date', 'Monthly target'],
      [
        ...rows.map((r) => [
          filter.from,
          filter.to,
          r.name,
          r.channel,
          r.region,
          r.revenue,
          r.units,
          r.monthToDate,
          r.monthlyTarget ?? '',
        ]),
        [
          filter.from,
          filter.to,
          'Total',
          '',
          '',
          Math.round(totals.revenue * 100) / 100,
          totals.units,
          Math.round(totals.monthToDate * 100) / 100,
          '',
        ],
      ],
    )

  // The same figures, drawn up to print or keep as a PDF (client, 1 November).
  const printAnalytics = () => {
    const traded = rows.filter((r) => r.revenue > 0 || r.units > 0)
    const ok = openPrintReport({
      title: 'Analytics',
      subtitle: period,
      boxes: [
        {
          label: 'Revenue',
          value: rm(kpis.current.revenue),
          note:
            kpis.delta.revenue === null
              ? undefined
              : `${kpis.delta.revenue >= 0 ? '+' : '−'}${Math.abs(kpis.delta.revenue).toFixed(1)}% on the period before`,
        },
        { label: 'Units sold', value: num(kpis.current.units) },
        { label: 'Stores', value: num(traded.length), note: 'that traded' },
        { label: 'Staff purchases', value: rm(kpis.current.staffRevenue), note: 'kept separate' },
      ],
      rules: activeFilterCount(filter) ? filterInWords(filter) : ['Every store, every product'],
      chart: {
        title: `${METRIC_LABEL[metric]}, by store`,
        bars: rows
          .filter((r) => metricValue(r, metric) > 0)
          .slice(0, 20)
          .map((r) => ({ label: r.shortName, value: metricValue(r, metric), display: format(metricValue(r, metric)) })),
      },
      // The stores that sold nothing in the period add nothing to the page.
      table: {
        headers: ['Store', 'Channel', 'Units', 'Revenue'],
        right: [false, false, true, true],
        rows: traded.map((r) => [r.name, CHANNEL_PLURAL[r.channel], num(r.units), rm(r.revenue)]),
        total: ['Total', '', num(totals.units), rm(totals.revenue)],
      },
    })
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Legendary Group</p>
          <h1 className="page-title mt-1">
            Analytics
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Set the period, pick a measure, then filter by store, channel, product or country.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" onClick={exportSummary}>
            CSV
          </Button>
          <Button variant="primary" icon="printer" onClick={printAnalytics} disabled={empty}>
            PDF report
          </Button>
        </div>
      </div>

      <FilterBar
        filter={filter}
        onChange={setFilter}
        metric={metric}
        onMetricChange={setMetric}
        today={data.today}
        coverage={coverage}
      />

      <SalesBoxes
        base={boxBase}
        scope={
          activeFilterCount(filter)
            ? `Narrowed by the filter above: ${filterInWords(filter).join(' · ')}. Each box keeps its own days.`
            : undefined
        }
      />

      {empty ? (
        <Panel>
          <EmptyState
            icon="filter"
            title="Nothing matches this combination"
            body="No store traded under these filters in this period. Widen the period or clear a filter."
            action={
              <Button onClick={() => setFilter(emptyFilter(addDays(data.today, -29), data.today))}>
                Reset to last 30 days
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          {focusCountry && countryBasket.length > 0 && (
            <Panel>
              <PanelHeader
                eyebrow="Country basket"
                title={`What ${countryByCode(focusCountry)?.name} bought`}
                meta="Taken from the country recorded against each sale in the main stores."
              />
              <Rule />
              <PanelBody>
                <FiguresTable
                  rows={countryBasket}
                  rowKey={(r) => r.skuId}
                  page={PAGE}
                  pageKey={JSON.stringify(filter)}
                  columns={[
                    { header: 'Product', render: (r) => r.label },
                    {
                      header: 'Units',
                      align: 'right',
                      render: (r) => num(r.units),
                      total: num(countryBasket.reduce((a, r) => a + r.units, 0)),
                    },
                    {
                      header: 'Revenue',
                      align: 'right',
                      render: (r) => rm(r.revenue),
                      total: rm(countryBasket.reduce((a, r) => a + r.revenue, 0)),
                    },
                  ]}
                />
              </PanelBody>
            </Panel>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame
              title="Which countries bought"
              meta={`${num(mix.reduce((a, m) => a + m.customers, 0))} customers with a country recorded. Tap a country to open it.`}
              height={240}
              note="Counted by customer: one sale is one customer. Main stores only — dealers and consignment partners do not capture nationality."
              table={<OriginTable slices={mix} onSelect={setCountry} />}
            >
              <div className="flex h-full items-center">
                <div className="w-full">
                  <OriginRibbon slices={mix} height={58} />
                </div>
              </div>
            </ChartFrame>

            <ChartFrame
              title="Revenue by channel"
              meta="Where the business sits"
              height={240}
              table={<DonutTable slices={channelSlices} format={format} unitHeader={METRIC_LABEL[metric]} />}
            >
              <div className="flex h-full items-center justify-center">
                <Donut
                  slices={channelSlices}
                  centreLabel={METRIC_LABEL[metric]}
                  centreValue={formatCompact(metricValue(kpis.current, metric))}
                  format={format}
                  size={176}
                />
              </div>
            </ChartFrame>
          </div>

        </>
      )}

      {/* The counter: date, store, item and nationality — above product
          performance (asked on 1 November, after Revision 9). */}
      <SalesReport />

      {!empty && (
        <>
          <ChartFrame
            title="Product performance"
            meta={`Every size, set and tester counted separately, ${PAGE} at a time. Today is live; the days before are as filed. The chart shows the dates set above.`}
            height={280}
            note="Narrowed by the filter's stores, products and countries, like the boxes. A dealer's or consignment partner's month keyed in on Dealer sales has no products behind it, so it is not in this table."
            table={
              <FiguresTable<SkuSalesRow>
                rows={skuSorted}
                rowKey={(r) => r.skuId}
                page={PAGE}
                pageKey={JSON.stringify([filter, metric])}
                empty="No product sold in these windows."
                columns={[
                  // Wide enough on a phone that a name takes two lines, not four.
                  { header: 'Product', render: (r) => <span className="block min-w-[120px]">{r.label}</span> },
                  ...WINDOWS.map((w) => ({
                    header: WINDOW_LABEL[w],
                    align: 'right' as const,
                    render: (r: SkuSalesRow) => skuFigure(r[w], w === 'monthToDate'),
                    total: skuFigure(skuTotal(w)),
                  })),
                ]}
              />
            }
          >
            <SkuBars rows={skuBars} metric={metric} />
          </ChartFrame>

          <Panel>
            <PanelHeader
              eyebrow="By store"
              title={`Ranked by ${METRIC_LABEL[metric].toLowerCase()}`}
              meta={`${rows.length} stores in view, ${PAGE} at a time. Tap any row to open that store.`}
            />
            <Rule />
            <PanelBody>
              <div className="scroll-x">
                {/* On a phone the channel and the trend step aside, so the figures fit. */}
                <table className="w-full border-collapse sm:min-w-[720px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['', 'Store', 'Channel', 'Trend', METRIC_LABEL[metric], 'vs previous'].map(
                        (h, i) => (
                          <th
                            key={h || i}
                            className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i >= 4 ? 'text-right' : 'text-left'} ${
                              i === 2 || i === 3 ? 'hidden sm:table-cell' : ''
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stores.visible.map((r, i) => (
                      <tr
                        key={r.locationId}
                        onClick={() => navigate(`/stores/${r.locationId}`)}
                        className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-sunken"
                      >
                        <td className="w-8 py-2.5">
                          <span className="readout text-[11px] text-ink-3">{i + 1}</span>
                        </td>
                        <td className="py-2.5">
                          <Link
                            to={`/stores/${r.locationId}`}
                            className="group block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="flex items-center gap-1 text-[13px] leading-tight text-ink group-hover:text-primary">
                              {r.shortName}
                              <Icon
                                name="chevronRight"
                                className="h-3 w-3 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                              />
                            </p>
                            <p className="text-[11px] text-ink-3">{r.region}</p>
                          </Link>
                        </td>
                        <td className="hidden py-2.5 text-[12px] text-ink-2 sm:table-cell">
                          {CHANNEL_PLURAL[r.channel]}
                        </td>
                        <td className="hidden py-2.5 sm:table-cell">
                          <Sparkline data={selectLocationSparkline(data, r.locationId)} />
                        </td>
                        <td className="readout whitespace-nowrap py-2.5 pl-3 text-right text-[13px] text-ink">
                          {format(metricValue(r, metric))}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {r.delta === null ? (
                            <span className="text-[11.5px] text-ink-3">—</span>
                          ) : (
                            <span
                              className={`readout text-[12px] ${r.delta >= 0 ? 'text-good' : 'text-critical'}`}
                            >
                              {r.delta >= 0 ? '+' : '−'}
                              {Math.abs(r.delta).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line">
                      <td />
                      <td className="py-2.5 text-[12.5px] font-semibold text-ink-2">
                        {totalOf(stores.partial, rows.length)}
                      </td>
                      <td className="hidden sm:table-cell" />
                      <td className="hidden sm:table-cell" />
                      <td className="readout whitespace-nowrap py-2.5 pl-3 text-right text-[13px] font-semibold text-ink">
                        {format(metric === 'revenue' ? totals.revenue : totals.units)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {stores.more}
            </PanelBody>
          </Panel>
        </>
      )}

      {/* The graphs, at the foot of the page. */}
      {!empty && (
        <>
          <ChartFrame
            title={METRIC_LABEL[metric]}
            meta={`${format(metricValue(kpis.current, metric))} across the period · previous period ${format(metricValue(kpis.previous, metric))}`}
            height={260}
          >
            <TrendChart data={trend} format={formatCompact} label={METRIC_LABEL[metric]} />
          </ChartFrame>

          <ChartFrame title="Trading pattern" meta={`Revenue per day · ${period}`} height={160}>
            <HeatCalendar data={heat} format={rmCompact} />
          </ChartFrame>
        </>
      )}

      {country && (
        <CountryDetailModal
          countryCode={country}
          filter={filter}
          when={period}
          onClose={() => setCountry(null)}
        />
      )}
    </div>
  )
}
