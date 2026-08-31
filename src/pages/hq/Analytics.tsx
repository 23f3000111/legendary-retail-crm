import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Icon } from '../../components/ui/icons'
import { Button } from '../../components/ui/Button'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { FilterBar } from '../../components/FilterBar'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon, OriginTable } from '../../components/charts/OriginRibbon'
import { SkuBars, SkuTable } from '../../components/charts/SkuBars'
import { HeatCalendar } from '../../components/charts/HeatCalendar'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import {
  countryCoverage,
  emptyFilter,
  METRIC_LABEL,
  metricValue,
  selectChannelSplit,
  selectKpis,
  selectLocationSparkline,
  selectLocationRows,
  selectOriginMix,
  selectSkusForCountry,
  selectSkuPerformance,
  selectTimeSeries,
  type Filter,
  type Metric,
} from '../../store/selectors'
import { CHANNEL_PLURAL } from '../../data/locations'
import { countryByCode } from '../../data/countries'
import { addDays, formatDate } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The screen for digging.
 *
 * One filter drives every panel, so a change moves the whole page at once. When
 * a nationality is chosen the page adds a panel showing exactly what that
 * country bought — the question the airport stores exist to answer.
 */
export function Analytics() {
  const navigate = useNavigate()
  const data = useData()
  const [filter, setFilter] = useState<Filter>(() =>
    emptyFilter(addDays(data.today, -29), data.today),
  )
  const [metric, setMetric] = useState<Metric>('revenue')

  const kpis = useMemo(() => selectKpis(data, filter), [data, filter])
  const trend = useMemo(() => selectTimeSeries(data, filter, metric), [data, filter, metric])
  const heat = useMemo(() => selectTimeSeries(data, filter, 'revenue'), [data, filter])
  const mix = useMemo(() => selectOriginMix(data, filter), [data, filter])
  const skuRows = useMemo(() => selectSkuPerformance(data, filter), [data, filter])
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

  const exportSummary = () =>
    downloadCsv(
      'legendary-analytics.csv',
      ['Store', 'Channel', 'Region', 'Revenue MYR', 'Units', 'Month to date', 'Monthly target'],
      rows.map((r) => [
        r.name,
        r.channel,
        r.region,
        r.revenue,
        r.units,
        r.monthToDate,
        r.monthlyTarget ?? '',
      ]),
    )

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
        <div className="flex gap-2">
          <Button variant="secondary" icon="download" onClick={exportSummary}>
            Export
          </Button>
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>
            Print
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Revenue"
              value={kpis.current.revenue}
              format={rm}
              delta={kpis.delta.revenue}
              tone="violet"
              icon="chart"
            />
            <StatTile
              label="Units sold"
              value={kpis.current.units}
              format={(n) => num(Math.round(n))}
              delta={kpis.delta.units}
              tone="blue"
              icon="box"
            />
            <StatTile
              label="With a country recorded"
              value={kpis.current.attributedUnits}
              format={(n) => num(Math.round(n))}
              footnote={`${coverage.capableLocations} of ${coverage.totalLocations} stores capture it`}
              tone="cyan"
              icon="globe"
            />
            <StatTile
              label="Staff purchases"
              value={kpis.current.staffRevenue}
              format={rm}
              footnote={`${num(kpis.current.staffUnits)} units, kept separate`}
              tone="teal"
              icon="users"
            />
          </div>

          <ChartFrame
            title={METRIC_LABEL[metric]}
            meta={`${format(metricValue(kpis.current, metric))} across the period · previous period ${format(metricValue(kpis.previous, metric))}`}
            height={260}
          >
            <TrendChart data={trend} format={formatCompact} label={METRIC_LABEL[metric]} />
          </ChartFrame>

          {focusCountry && countryBasket.length > 0 && (
            <Panel>
              <PanelHeader
                eyebrow="Country basket"
                title={`What ${countryByCode(focusCountry)?.name} bought`}
                meta="Taken from the country recorded against each sale in the main stores."
              />
              <Rule />
              <PanelBody>
                <div className="scroll-x">
                  <table className="w-full min-w-[420px] border-collapse">
                    <thead>
                      <tr className="border-b border-line">
                        {['Product', 'Units', 'Revenue'].map((h, i) => (
                          <th
                            key={h}
                            className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i === 0 ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {countryBasket.map((r) => (
                        <tr key={r.skuId} className="border-b border-line/70 last:border-0">
                          <td className="py-2 text-[13px] text-ink">{r.label}</td>
                          <td className="readout py-2 text-right text-[13px] text-ink-2">
                            {num(r.units)}
                          </td>
                          <td className="readout py-2 text-right text-[13px] text-ink">
                            {rm(r.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelBody>
            </Panel>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame
              title="Which countries bought"
              meta={`${num(kpis.current.attributedUnits)} units with a country recorded`}
              height={240}
              note="Main stores only — dealers and consignment partners do not capture nationality."
              table={<OriginTable slices={mix} />}
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

          <ChartFrame
            title="Product performance"
            meta="Every size, set and tester counted separately"
            height={280}
            table={<SkuTable rows={skuRows} />}
          >
            <SkuBars rows={skuRows.slice(0, 12)} metric={metric} />
          </ChartFrame>

          <ChartFrame
            title="Trading pattern"
            meta={`Revenue per day · ${formatDate(filter.from)} to ${formatDate(filter.to)}`}
            height={160}
          >
            <HeatCalendar data={heat} format={rmCompact} />
          </ChartFrame>

          <Panel>
            <PanelHeader
              eyebrow="By store"
              title={`Ranked by ${METRIC_LABEL[metric].toLowerCase()}`}
              meta={`${rows.length} stores in view. Tap any row to open that store.`}
            />
            <Rule />
            <PanelBody>
              <div className="scroll-x">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      {['', 'Store', 'Channel', 'Trend', METRIC_LABEL[metric], 'vs previous'].map(
                        (h, i) => (
                          <th
                            key={h || i}
                            className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i >= 4 ? 'text-right' : 'text-left'}`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 25).map((r, i) => (
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
                        <td className="py-2.5 text-[12px] text-ink-2">
                          {CHANNEL_PLURAL[r.channel]}
                        </td>
                        <td className="py-2.5">
                          <Sparkline data={selectLocationSparkline(data, r.locationId)} />
                        </td>
                        <td className="readout py-2.5 text-right text-[13px] text-ink">
                          {format(metricValue(r, metric))}
                        </td>
                        <td className="py-2.5 text-right">
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
                </table>
              </div>
              {rows.length > 25 && (
                <p className="mt-3 text-[12px] text-ink-3">
                  Showing the top 25 of {rows.length}. Narrow the filter to see the rest.
                </p>
              )}
            </PanelBody>
          </Panel>
        </>
      )}
    </div>
  )
}
