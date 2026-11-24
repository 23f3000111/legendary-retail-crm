import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Icon } from '../../components/ui/icons'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/DataTable'
import { FiguresTable } from '../../components/ui/FiguresTable'
import { Flag } from '../../components/ui/Flag'
import { PAGE, totalOf, usePaged } from '../../components/ui/LoadMore'
import { StatTile } from '../../components/ui/StatTile'
import { useToasts } from '../../components/ui/Toast'
import { FilterBar, filterInWords } from '../../components/FilterBar'
import { CountryDetailModal } from '../../components/CountryDetail'
import { StoreSalesModal, datesChoice } from '../../components/StoreSales'
import { OutletOrderControl } from '../../components/OutletOrderControl'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { TrendChart } from '../../components/charts/TrendChart'
import { Donut, DonutTable, type DonutSlice } from '../../components/charts/Donut'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { SkuBars } from '../../components/charts/SkuBars'
import { HeatCalendar } from '../../components/charts/HeatCalendar'
import { useData } from '../../store/useData'
import { useViews } from '../../store/useViews'
import { useOutletSort } from '../../store/useOutletOrder'
import { restoreFilter } from '../../lib/views'
import {
  activeFilterCount,
  countryCoverage,
  emptyFilter,
  foldOrigins,
  METRIC_LABEL,
  selectChannelTotals,
  selectCountryDetail,
  selectCountryTotals,
  selectDailySeries,
  selectPeriodTotals,
  selectSkuTotals,
  selectStoreTotals,
  type Filter,
  type Metric,
} from '../../store/selectors'
import { CHANNELS, CHANNEL_PLURAL, locationById } from '../../data/locations'
import { oneChannelNote } from '../../lib/words'
import { countryByCode } from '../../data/countries'
import { addDays, formatDate } from '../../lib/dates'
import { buildDetailReport, detailCsvBlocks, detailFilename, detailPrintSpec } from '../../lib/detailReport'
import { downloadCsvSections } from '../../lib/exportCsv'
import { openPrintReport } from '../../lib/printReport'
import { num, rm, rmCompact } from '../../lib/format'

/**
 * The screen for digging — the dates chosen and nothing else (16 November).
 *
 * "If I chose one week, from 1st to 7th of November, of course I want to see
 * the total", and "when I click on the date, we only want to see the date":
 * one filter at the top — a period, or any dates, then stores, channels,
 * products and countries — and every panel reads exactly those days. Each
 * store's total and each product's units for the period, every country in
 * full, the period's own figures in the boxes; no today, yesterday or month
 * windows, which are the overview's. The sales report came here from the
 * store pages, and the filter does its work: the exports are the detailed
 * report, product by product and day by day, for the dates and filter set.
 *
 * Figures first, graphs at the foot (client, 1 November).
 *
 * 20 November: the filter and the measure are kept when you leave the page and
 * come back ("then comeback to analytics then the filter I put gone"), and a
 * store opens in a pop-up first — its figures for these dates, what is behind
 * them — with **Open full detail** for its page.
 *
 * 24 November, Davy's Analytics: "by store section first then which country
 * bought then products section". The graphs stay at the foot.
 */
/** One line of what would otherwise be a section of one; a country or a store opens. */
function Single({ label, value, note, onOpen }: { label: string; value: React.ReactNode; note: string; onOpen?: () => void }) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-[14px] font-medium leading-tight text-ink">
        {value}
        {onOpen && <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{note}</p>
    </>
  )
  const box = 'rounded-xl border border-line bg-surface px-4 py-3 shadow-glass'
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${box} text-left transition-colors hover:border-primary/45`}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  )
}

export function Analytics() {
  const data = useData()
  const push = useToasts((s) => s.push)
  const keep = useViews((s) => s.keep)
  // As it was left, for this tab: another page and back keeps the filter.
  const [filter, setFilter] = useState<Filter>(
    () => restoreFilter(useViews.getState().analytics?.filter, data.today) ?? emptyFilter(addDays(data.today, -29), data.today),
  )
  const [metric, setMetric] = useState<Metric>(() => (useViews.getState().analytics?.metric === 'units' ? 'units' : 'revenue'))
  useEffect(() => keep('analytics', { filter, metric }), [filter, metric, keep])
  /** A country opened from "Which countries bought". */
  const [country, setCountry] = useState<string | null>(null)
  /** A store opened from "By store", or from a country's window for that country. */
  const [store, setStore] = useState<{ id: string; countryCodes?: string[] } | null>(null)

  const totals = useMemo(() => selectPeriodTotals(data, filter), [data, filter])
  const stores = useMemo(() => selectStoreTotals(data, filter), [data, filter])
  const skus = useMemo(() => selectSkuTotals(data, filter), [data, filter])
  const countries = useMemo(() => selectCountryTotals(data, filter), [data, filter])
  const channels = useMemo(() => selectChannelTotals(data, filter), [data, filter])
  const trend = useMemo(() => selectDailySeries(data, filter, metric), [data, filter, metric])
  const heat = useMemo(() => selectDailySeries(data, filter, 'revenue'), [data, filter])
  const coverage = useMemo(() => countryCoverage(data, filter), [data, filter])

  const format = (n: number) => (metric === 'revenue' ? rm(n) : num(Math.round(n)))
  const formatCompact = (n: number) => (metric === 'revenue' ? rmCompact(n) : num(Math.round(n)))
  const value = (r: { revenue: number; units: number }) => (metric === 'revenue' ? r.revenue : r.units)

  const period = filter.from === filter.to ? formatDate(filter.from) : `${formatDate(filter.from)} to ${formatDate(filter.to)}`
  const rules = activeFilterCount(filter) ? filterInWords(filter) : ['Every store, every product']
  const empty = totals.revenue === 0 && totals.units === 0

  const focusCountry = filter.countryCodes.length === 1 ? filter.countryCodes[0] : null
  const countryBasket = useMemo(
    () => (focusCountry ? selectCountryDetail(data, filter, focusCountry, true).skus : []),
    [data, filter, focusCountry],
  )

  const channelSlices: DonutSlice[] = channels.map((c) => ({
    key: c.channel,
    label: CHANNEL_PLURAL[c.channel],
    value: metric === 'revenue' ? c.revenue : c.units,
  }))

  // Every store in view, ranked by the measure or in the person's own order,
  // ten at a time; the total counts them all.
  const order = useOutletSort('analytics-stores', 'value')
  const ranked = useMemo(
    () => order.sort([...stores].sort((a, b) => value(b) - value(a) || b.revenue - a.revenue), (r) => r.locationId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, metric, order.mode, order.order],
  )
  const storePage = usePaged(ranked, { page: PAGE, resetOn: JSON.stringify([filter, metric, order.mode]) })
  const storeChannels = CHANNELS.filter((c) => stores.some((s) => locationById(s.locationId)?.channel === c))
  const sum = (k: 'revenue' | 'units' | 'customers') => stores.reduce((a, s) => a + s[k], 0)

  // The chart draws the best twelve by the measure; the table keeps the range's order.
  const bars = useMemo(
    () => [...skus].sort((a, b) => value(b) - value(a)).slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skus, metric],
  )

  // The detailed report, for the dates and the filter (16 November).
  const report = () => buildDetailReport(data, filter)
  const oneStore = filter.locationIds.length === 1 ? locationById(filter.locationIds[0]) : undefined
  const exportCsv = () => {
    const r = report()
    downloadCsvSections(detailFilename(r, oneStore?.code), detailCsvBlocks(r, [['Rules', ...rules]]))
  }
  const printAnalytics = () => {
    const ok = openPrintReport(
      detailPrintSpec(report(), { title: oneStore ? `Analytics · ${oneStore.name}` : 'Analytics', subtitle: period, rules }),
    )
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  const delta = totals.previous ? ((totals.revenue - totals.previous) / totals.previous) * 100 : null

  // A section with one line is no section (20 November: "Revenue by channel in
  // analytics page has only one Main stores detail so we do not need an entire
  // section for this"): its line goes under the boxes instead.
  const oneChannel = channels.length === 1 ? channels[0] : null
  const oneCountry = countries.length === 1 ? countries[0] : null
  const oneProduct = skus.length === 1 ? skus[0] : null
  const singleStore = stores.length === 1 ? stores[0] : null
  const singles = [oneChannel, oneCountry, oneProduct, singleStore].filter(Boolean).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Legendary Group</p>
          <h1 className="page-title mt-1">Analytics</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Choose the dates, pick a measure, then filter by store, channel, product or country. Everything below is
            for those dates only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" onClick={exportCsv} disabled={empty}>
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

      {/* ── The period's own figures (16 November) ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Sales"
          value={totals.revenue}
          format={rm}
          fit
          delta={delta}
          footnote={period}
          tone="violet"
          icon="chart"
        />
        <StatTile label="Units sold" value={totals.units} format={(n) => num(Math.round(n))} footnote={period} tone="blue" icon="box" />
        <StatTile
          label="Customers"
          value={totals.customers}
          format={(n) => num(Math.round(n))}
          footnote="one sale is one customer"
          tone="cyan"
          icon="users"
        />
        <StatTile
          label="Stores that sold"
          value={totals.stores}
          format={(n) => num(Math.round(n))}
          footnote={`of ${num(stores.length)} in view`}
          tone="teal"
          icon="globe"
        />
      </div>

      {/* The single lines, where a whole section would hold only one. */}
      {!empty && singles > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {singleStore && (
            <Single
              label="Store"
              value={locationById(singleStore.locationId)?.shortName ?? singleStore.locationId}
              note={`${rm(singleStore.revenue)} · ${num(singleStore.customers)} ${singleStore.customers === 1 ? 'customer' : 'customers'}`}
              onOpen={() => setStore({ id: singleStore.locationId })}
            />
          )}
          {oneCountry && (
            <Single
              label="Country"
              value={
                <span className="inline-flex items-center gap-2">
                  <Flag code={oneCountry.countryCode} size={16} fallback={oneCountry.flag} />
                  {oneCountry.name}
                </span>
              }
              note={`${num(oneCountry.customers)} ${oneCountry.customers === 1 ? 'customer' : 'customers'} · ${num(oneCountry.units)} units · ${rm(oneCountry.revenue)}`}
              onOpen={() => setCountry(oneCountry.countryCode)}
            />
          )}
          {oneChannel && (
            <Single
              label="Channel"
              value={`${CHANNEL_PLURAL[oneChannel.channel]} only`}
              note={oneChannelNote(
                oneChannel.channel,
                metric === 'units' ? `${format(value(oneChannel))} units` : format(value(oneChannel)),
              )}
            />
          )}
          {oneProduct && (
            <Single
              label="Product"
              value={oneProduct.label}
              note={`${num(oneProduct.units)} units · ${rm(oneProduct.revenue)}`}
            />
          )}
        </div>
      )}

      {empty ? (
        <Panel>
          <EmptyState
            icon="filter"
            title="Nothing matches these dates and this filter"
            body="No store sold anything the filter allows on these dates. Widen the dates or clear a filter."
            action={<Button onClick={() => setFilter(emptyFilter(addDays(data.today, -29), data.today))}>Reset to the last 30 days</Button>}
          />
        </Panel>
      ) : (
        <>
          {/* ── Every store, first (24 November): its total for the dates ──── */}
          {!singleStore && (
          <Panel>
            <PanelHeader
              eyebrow="By store"
              title={order.mode === 'mine' ? `In your order, ${period}` : `Ranked by ${METRIC_LABEL[metric].toLowerCase()}, ${period}`}
              action={<OutletOrderControl sort={order} channels={storeChannels} />}
              meta={`${stores.length} stores in view, ${PAGE} at a time: each one's total for the period, and against the same number of days before. Tap a store to see what is behind its figures for these dates; Open full detail there goes to its page.`}
            />
            <Rule />
            <PanelBody>
              <div className="scroll-x">
                {/* On a phone the channel steps aside, so the figures fit. */}
                <table className="w-full border-collapse sm:min-w-[640px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['', 'Store', 'Channel', 'Customers', METRIC_LABEL[metric], 'vs before'].map((h, i) => (
                        <th
                          key={h || i}
                          className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i >= 3 ? 'text-right' : 'text-left'} ${
                            i === 2 || i === 3 ? 'hidden sm:table-cell' : ''
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {storePage.visible.map((r, i) => {
                      const l = locationById(r.locationId)
                      const before = metric === 'revenue' ? r.previous : r.previousUnits
                      const change = before ? ((value(r) - before) / before) * 100 : null
                      return (
                        <tr
                          key={r.locationId}
                          // 20 November: "instead of directly going to pavilion KL detailed
                          // page, pop-up should open first with detailed details then a
                          // button at bottom (open full detail)". The filter stays as it is.
                          onClick={() => setStore({ id: r.locationId })}
                          title={`What is behind ${l?.shortName ?? r.locationId}'s figures, ${period}`}
                          className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-sunken"
                        >
                          <td className="w-8 py-2.5">
                            <span className="readout text-[11px] text-ink-3">{i + 1}</span>
                          </td>
                          <td className="py-2.5">
                            <p className="flex items-center gap-1 text-[13px] leading-tight text-ink group-hover:text-primary">
                              {l?.shortName ?? r.locationId}
                              <Icon name="chevronRight" className="h-3 w-3 shrink-0 text-ink-3 group-hover:text-primary" />
                            </p>
                            <p className="text-[11px] text-ink-3">{l?.region}</p>
                          </td>
                          <td className="hidden py-2.5 text-[12px] text-ink-2 sm:table-cell">{l ? CHANNEL_PLURAL[l.channel] : ''}</td>
                          <td className="readout hidden py-2.5 pl-3 text-right text-[12.5px] text-ink-2 sm:table-cell">{num(r.customers)}</td>
                          <td className="readout whitespace-nowrap py-2.5 pl-3 text-right text-[13px] text-ink">{format(value(r))}</td>
                          <td className="py-2.5 pl-3 text-right">
                            {change === null ? (
                              <span className="text-[11.5px] text-ink-3">—</span>
                            ) : (
                              <span className={`readout text-[12px] ${change >= 0 ? 'text-good' : 'text-critical'}`}>
                                {change >= 0 ? '+' : '−'}
                                {Math.abs(change).toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line">
                      <td />
                      <td className="py-2.5 text-[12.5px] font-semibold text-ink-2">{totalOf(storePage.partial, stores.length)}</td>
                      <td className="hidden sm:table-cell" />
                      <td className="readout hidden py-2.5 pl-3 text-right text-[12.5px] font-semibold text-ink sm:table-cell">
                        {num(sum('customers'))}
                      </td>
                      <td className="readout whitespace-nowrap py-2.5 pl-3 text-right text-[13px] font-semibold text-ink">
                        {format(metric === 'revenue' ? sum('revenue') : sum('units'))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {storePage.more}
            </PanelBody>
          </Panel>
          )}

          {/* ── Then the countries: which bought, beside the channels ────── */}
          {focusCountry && countryBasket.length > 0 && (
            <Panel>
              <PanelHeader
                eyebrow="Country basket"
                title={`What ${countryByCode(focusCountry)?.name} bought`}
                meta={`${period}. Taken from the country recorded against each sale in the main stores.`}
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
                    { header: 'Units', align: 'right', render: (r) => num(r.units), total: num(countryBasket.reduce((a, r) => a + r.units, 0)) },
                    { header: 'Sales', align: 'right', render: (r) => rm(r.revenue), total: rm(countryBasket.reduce((a, r) => a + r.revenue, 0)) },
                  ]}
                />
              </PanelBody>
            </Panel>
          )}

          <div className={`grid gap-5 ${!oneCountry && !oneChannel ? 'lg:grid-cols-2' : ''}`}>
            {!oneCountry && (
            <ChartFrame
              title="Which countries bought"
              meta={`${num(countries.reduce((a, c) => a + c.customers, 0))} customers with a country recorded, ${period}. Every country, ${PAGE} at a time. Tap one to open it.`}
              height={240}
              note="Counted by customer: one sale is one customer. Main stores only: consignment partners and dealers do not capture nationality."
              table={
                <FiguresTable
                  rows={countries}
                  rowKey={(c) => c.countryCode}
                  page={PAGE}
                  pageKey={JSON.stringify(filter)}
                  onRowClick={(c) => setCountry(c.countryCode)}
                  empty="No country recorded on these dates."
                  columns={[
                    {
                      header: 'Country',
                      render: (c) => (
                        <span className="flex items-center gap-2">
                          <Flag code={c.countryCode} size={16} fallback={c.flag} />
                          {c.name}
                          <Icon name="chevronRight" className="h-3 w-3 text-ink-3" />
                        </span>
                      ),
                    },
                    { header: 'Customers', align: 'right', render: (c) => num(c.customers), total: num(countries.reduce((a, c) => a + c.customers, 0)) },
                    { header: 'Units', align: 'right', render: (c) => num(c.units), total: num(countries.reduce((a, c) => a + c.units, 0)) },
                    { header: 'Sales', align: 'right', render: (c) => rm(c.revenue), total: rm(countries.reduce((a, c) => a + c.revenue, 0)) },
                    { header: 'Share', align: 'right', render: (c) => `${c.share.toFixed(1)}%`, total: '100.0%' },
                  ]}
                />
              }
            >
              <div className="flex h-full items-center">
                <div className="w-full">
                  <OriginRibbon slices={foldOrigins(countries, 6)} height={58} />
                </div>
              </div>
            </ChartFrame>
            )}

            {!oneChannel && (
            <ChartFrame
              title={`${METRIC_LABEL[metric]} by channel`}
              meta={period}
              height={240}
              table={<DonutTable slices={channelSlices} format={format} unitHeader={METRIC_LABEL[metric]} />}
            >
              <div className="flex h-full items-center justify-center">
                <Donut
                  slices={channelSlices}
                  centreLabel={METRIC_LABEL[metric]}
                  centreValue={formatCompact(value(totals))}
                  format={format}
                  size={176}
                />
              </div>
            </ChartFrame>
            )}
          </div>

          {/* ── Then every product: its total for the dates, in the range's order ── */}
          {!oneProduct && (
          <ChartFrame
            title="Products"
            meta={`Every product sold, ${period}: its units and sales for the whole period, in the range's order, ${PAGE} at a time. The chart ranks the best twelve.`}
            height={280}
            note="Narrowed by the filter's stores, products and countries. A consignment partner's or dealer's month keyed in at head office has no products behind it, so it is not in this table."
            table={
              <FiguresTable
                rows={skus}
                rowKey={(r) => r.skuId}
                page={PAGE}
                pageKey={JSON.stringify([filter, metric])}
                empty="No product sold on these dates."
                columns={[
                  { header: 'Product', render: (r) => r.label },
                  ...(metric === 'units'
                    ? [
                        { header: 'Units', align: 'right' as const, render: (r: (typeof skus)[number]) => num(r.units), total: num(skus.reduce((a, r) => a + r.units, 0)) },
                        { header: 'Sales', align: 'right' as const, render: (r: (typeof skus)[number]) => rm(r.revenue), total: rm(skus.reduce((a, r) => a + r.revenue, 0)) },
                      ]
                    : [
                        { header: 'Sales', align: 'right' as const, render: (r: (typeof skus)[number]) => rm(r.revenue), total: rm(skus.reduce((a, r) => a + r.revenue, 0)) },
                        { header: 'Units', align: 'right' as const, render: (r: (typeof skus)[number]) => num(r.units), total: num(skus.reduce((a, r) => a + r.units, 0)) },
                      ]),
                ]}
              />
            }
          >
            <SkuBars rows={bars} metric={metric} />
          </ChartFrame>
          )}

          {/* ── The graphs, at the foot of the page ──────────────────────── */}
          <ChartFrame
            title={`${METRIC_LABEL[metric]}, day by day`}
            meta={`${format(value(totals))} across ${period}${totals.previous && metric === 'revenue' ? ` · the same days before: ${rm(totals.previous)}` : ''}`}
            height={260}
          >
            <TrendChart data={trend} format={formatCompact} label={METRIC_LABEL[metric]} />
          </ChartFrame>

          <ChartFrame title="Trading pattern" meta={`Sales per day · ${period}`} height={160}>
            <HeatCalendar data={heat} format={rmCompact} />
          </ChartFrame>
        </>
      )}

      {country && (
        <CountryDetailModal
          countryCode={country}
          filter={filter}
          when={period}
          live
          onClose={() => setCountry(null)}
          onStore={(id) => {
            setCountry(null)
            setStore({ id, countryCodes: [country] })
          }}
        />
      )}

      {store && (
        <StoreSalesModal
          locationId={store.id}
          periods={[datesChoice(filter.from, filter.to)]}
          base={{
            collectionIds: filter.collectionIds,
            skuIds: filter.skuIds,
            variants: filter.variants,
            countryCodes: store.countryCodes ?? filter.countryCodes,
          }}
          onClose={() => setStore(null)}
        />
      )}
    </div>
  )
}
