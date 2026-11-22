import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { EmptyState } from './ui/DataTable'
import { FiguresTable } from './ui/FiguresTable'
import { PAGE } from './ui/LoadMore'
import { useToasts } from './ui/Toast'
import { Select, TextInput } from './ui/Field'
import { Flag } from './ui/Flag'
import { StoreSalesModal, datesChoice } from './StoreSales'
import { useData } from '../store/useData'
import { useViews } from '../store/useViews'
import { selectSalesReport, type ReportRow, type ReportRule } from '../store/selectors'
import { CHANNEL_PLURAL, CHANNELS, locationById, tradingLocations } from '../data/locations'
import { openPrintReport } from '../lib/printReport'
import { countriesAlphabetical, countryByCode } from '../data/countries'
import { skuLabel, skus } from '../data/products'
import { pickerGroups } from '../lib/range'
import { addDays, formatDate, spanLabel } from '../lib/dates'
import { chooseDates } from '../lib/periods'
import { restoreRules } from '../lib/views'
import { downloadCsvSections } from '../lib/exportCsv'
import { newId } from '../lib/ids'
import { num, rm } from '../lib/format'
import type { DateStr } from '../data/types'

const FIELD_LABEL: Record<ReportRule['field'], string> = {
  date: 'Business date',
  store: 'Store',
  item: 'Item',
  nationality: 'Nationality',
}

const FIELDS: ReportRule['field'][] = ['date', 'store', 'item', 'nationality']

const blankRule = (field: ReportRule['field'], yesterday: DateStr): ReportRule =>
  field === 'date'
    ? { id: newId(), field, span: { op: 'between', from: yesterday, to: yesterday } }
    : field === 'store'
      ? { id: newId(), field, op: 'equal', locationIds: [] }
      : field === 'item'
        ? { id: newId(), field, op: 'equal', skuIds: [] }
        : { id: newId(), field, op: 'equal', countryCodes: [] }

/** A rule in words, for the PDF report: "Store is KLIA T2, BSAS". */
const ruleInWords = (r: ReportRule): string | null => {
  const list = (names: string[]) => (names.length ? `${FIELD_LABEL[r.field]} is ${names.join(', ')}` : null)
  if (r.field === 'store') return list(r.locationIds.map((id) => locationById(id)?.shortName ?? id))
  if (r.field === 'item') return list(r.skuIds.map((id) => skuLabel(id)))
  if (r.field === 'nationality') return list(r.countryCodes.map((c) => countryByCode(c)?.name ?? c))
  return null
}

/**
 * Finance's sales report: every store, day by day, on Revenue.
 *
 * The client's sixth revision asked for rules like Zeoniq's; on 20 November
 * the developer asked to keep it on Revenue without "equal": **the business
 * date is between two dates**, from and to, and Store, Item and Nationality
 * wait folded under **Add rule** until one is wanted — then each is "one of
 * these". The rules stay as they were left when Finance comes back.
 *
 * "Unit should be in detailed": every row opens that store's day in a pop-up
 * — what sold, at what price, who bought — and **What sold** lists the units
 * of the whole report, product by product. The exports carry both.
 */
export function SalesReport() {
  const data = useData()
  const push = useToasts((s) => s.push)
  const kept = useViews((s) => s.revenue)
  const keep = useViews((s) => s.keep)
  const yesterday = addDays(data.today, -1)
  const [rules, setRules] = useState<ReportRule[]>(
    () => restoreRules(kept?.rules, data.today) ?? [blankRule('date', yesterday)],
  )
  // Kept for the tab, so the report is as it was left when Finance comes back.
  useEffect(() => keep('revenue', { ...useViews.getState().revenue, rules }), [rules, keep])
  /** A row opened: one store's day. */
  const [opened, setOpened] = useState<ReportRow | null>(null)

  const report = useMemo(() => selectSalesReport(data, rules), [data, rules])
  const missing = FIELDS.filter((f) => !rules.some((r) => r.field === f))

  const update = (id: string, next: ReportRule) => setRules((rs) => rs.map((r) => (r.id === id ? next : r)))
  const remove = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id))
  const add = (field: ReportRule['field']) =>
    setRules((rs) => [...rs, blankRule(field, yesterday)].sort((a, b) => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field)))

  // The rules a store's day opens with: the same items and nationalities.
  const items = rules.find((r): r is Extract<ReportRule, { field: 'item' }> => r.field === 'item')?.skuIds ?? []
  const nations = rules.find((r): r is Extract<ReportRule, { field: 'nationality' }> => r.field === 'nationality')?.countryCodes ?? []

  const when = report.days ? spanLabel(report.days) : 'Every day on record'
  const tag = report.days
    ? report.days.from === report.days.to
      ? report.days.from
      : `${report.days.from}-to-${report.days.to}`
    : 'all-dates'
  const words = rules.map(ruleInWords).filter((r): r is string => Boolean(r))

  // The same report, designed, for printing or saving as a PDF (1 November).
  const printReport = () => {
    const byDay = new Map<string, number>()
    for (const r of report.rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenue)
    const byStore = new Map<string, number>()
    for (const r of report.rows) byStore.set(r.locationId, (byStore.get(r.locationId) ?? 0) + r.revenue)
    // Several days: by day. One day: by store.
    const bars =
      byDay.size > 1
        ? [...byDay.entries()].map(([day, value]) => ({ label: formatDate(day), value, display: rm(value) }))
        : [...byStore.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, value]) => ({ label: locationById(id)?.shortName ?? id, value, display: rm(value) }))
    const days = new Set(report.rows.map((r) => r.day)).size
    const ok = openPrintReport({
      title: 'Sales report',
      subtitle: when,
      boxes: [
        { label: 'Sales', value: rm(report.revenue) },
        { label: 'Units', value: num(report.units) },
        { label: 'Stores', value: num(byStore.size) },
        { label: 'Per day', value: rm(days ? report.revenue / days : 0), note: `${num(days)} ${days === 1 ? 'day' : 'days'}` },
      ],
      rules: words,
      chart: { title: byDay.size > 1 ? 'Sales by day' : 'Sales by store', bars },
      table: {
        headers: ['Business date', 'Store', 'Units', 'Sales'],
        right: [false, false, true, true],
        rows: report.rows.map((r) => [formatDate(r.day), locationById(r.locationId)?.name ?? r.locationId, num(r.units), rm(r.revenue)]),
        total: ['Total', '', num(report.units), rm(report.revenue)],
      },
      sections: [
        {
          title: 'What sold',
          note: when,
          headers: ['Product', 'Units', 'Sales'],
          right: [false, true, true],
          rows: report.skus.map((s) => [s.label, num(s.units), rm(s.revenue)]),
          total: ['Total', num(report.units), rm(report.revenue)],
        },
      ],
    })
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  const exportReport = () =>
    downloadCsvSections(`legendary-sales-report-${tag}.csv`, [
      { rows: [['Sales report', when], ...words.map((w) => ['Rule', w])] },
      {
        title: 'Store by store, day by day',
        headers: ['Business date', 'Store', 'Store code', 'Units', 'Sales MYR'],
        rows: [
          ...report.rows.map((r) => [
            r.day,
            locationById(r.locationId)?.name ?? r.locationId,
            locationById(r.locationId)?.code ?? '',
            r.units,
            r.revenue,
          ]),
          ['Total', '', '', report.units, report.revenue],
        ],
      },
      {
        title: 'What sold',
        headers: ['Product', 'Units', 'Sales MYR'],
        rows: [...report.skus.map((s) => [s.label, s.units, s.revenue]), ['Total', report.units, report.revenue]],
      },
    ])

  return (
    <Panel>
      <PanelHeader
        eyebrow="Sales report"
        title="Every store, day by day"
        meta={`${when}. Days that have ended are as filed; today is as it stands. Tap a row to see that store's day: what sold, at what price, and who bought. Dealers and consignment report a month at a time, below.`}
        action={
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" icon="download" onClick={exportReport} disabled={!report.rows.length}>
              CSV
            </Button>
            <Button size="sm" variant="primary" icon="printer" onClick={printReport} disabled={!report.rows.length}>
              PDF report
            </Button>
          </div>
        }
      />
      <Rule />
      <PanelBody className="space-y-4">
        <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-2.5 sm:p-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <span className="order-1 w-[112px] shrink-0 text-[12.5px] font-semibold text-ink">{FIELD_LABEL[rule.field]}</span>
              {/* On a phone the rule's controls take a line of their own, under its name and Delete. */}
              <div className="order-3 min-w-0 basis-full sm:order-2 sm:basis-0 sm:flex-1">
                {rule.field === 'date' ? (
                  <BetweenDates
                    from={rule.span.from}
                    to={rule.span.to}
                    today={data.today}
                    onChange={(from, to) => update(rule.id, { ...rule, span: { op: 'between', from, to } })}
                  />
                ) : rule.field === 'store' ? (
                  <ChoiceRule
                    chosen={rule.locationIds}
                    onChosen={(locationIds) => update(rule.id, { ...rule, locationIds })}
                    noun="store"
                    label={(id) => locationById(id)?.shortName ?? id}
                    options={
                      <>
                        {CHANNELS.map((channel) => (
                          <optgroup key={channel} label={CHANNEL_PLURAL[channel]}>
                            {tradingLocations
                              .filter((l) => l.channel === channel)
                              .map((l) => (
                                <option key={l.id} value={l.id} disabled={rule.locationIds.includes(l.id)}>
                                  {l.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </>
                    }
                  />
                ) : rule.field === 'item' ? (
                  <ChoiceRule
                    chosen={rule.skuIds}
                    onChosen={(skuIds) => update(rule.id, { ...rule, skuIds })}
                    noun="item"
                    label={(id) => skuLabel(id)}
                    options={
                      <>
                        {/* Taken-off products too: their sales are still in the report. */}
                        {pickerGroups(skus.filter((s) => s.sellable)).map((g) => (
                          <optgroup key={g.key} label={g.label}>
                            {g.skus.map((s) => (
                              <option key={s.id} value={s.id} disabled={rule.skuIds.includes(s.id)}>
                                {s.label}
                                {s.removed ? ' (taken off)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </>
                    }
                  />
                ) : (
                  <ChoiceRule
                    chosen={rule.countryCodes}
                    onChosen={(countryCodes) => update(rule.id, { ...rule, countryCodes })}
                    noun="nationality"
                    label={(code) => countryByCode(code)?.name ?? code}
                    flag
                    options={
                      <>
                        {countriesAlphabetical.map((c) => (
                          <option key={c.code} value={c.code} disabled={rule.countryCodes.includes(c.code)}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    }
                  />
                )}
              </div>
              {/* On the right of the rule, as in Zeoniq. */}
              <Button
                size="sm"
                variant="danger"
                icon="minus"
                onClick={() => remove(rule.id)}
                className="order-2 ml-auto sm:order-3"
              >
                Delete
              </Button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="px-1 py-2 text-[12.5px] text-ink-3">No rules: every day, every store, every item, every nationality.</p>
          )}
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
              <span className="text-[12px] text-ink-3">Add rule:</span>
              {missing.map((f) => (
                <Button key={f} size="sm" variant="ghost" icon="plus" onClick={() => add(f)}>
                  {FIELD_LABEL[f]}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12.5px] text-ink-2">
            {report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'} · {num(report.units)} units
          </p>
          <p className="readout text-[15px] font-semibold text-ink">{rm(report.revenue)}</p>
        </div>

        {/* A month of every store is a long list: ten rows at a time, the total
            at its foot counting them all, and the export has it all. */}
        {report.rows.length ? (
          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <section className="min-w-0 sm:rounded-xl sm:border sm:border-line sm:px-4 sm:py-2">
              <p className="eyebrow mb-1.5 mt-1">Store by store, day by day · tap one</p>
              <FiguresTable
                rows={report.rows}
                rowKey={(r) => `${r.day}::${r.locationId}`}
                page={PAGE}
                pageKey={JSON.stringify(rules)}
                onRowClick={setOpened}
                columns={[
                  {
                    header: 'Business date',
                    render: (r) => (
                      <span className="flex flex-col">
                        <span className="readout">{formatDate(r.day)}</span>
                        {/* On a phone the store sits under its day, so the figures fit. */}
                        <span className="flex items-center gap-1 leading-tight sm:hidden">
                          {locationById(r.locationId)?.shortName ?? r.locationId}
                          <Icon name="chevronRight" className="h-3 w-3 shrink-0 text-ink-3" />
                        </span>
                      </span>
                    ),
                  },
                  {
                    header: 'Store',
                    hideOnPhone: true,
                    render: (r: ReportRow) => {
                      const l = locationById(r.locationId)
                      return (
                        <span className="flex items-center gap-1">
                          <span className="flex flex-col">
                            <span className="leading-tight">{l?.name ?? r.locationId}</span>
                            <span className="readout text-[10.5px] text-ink-3">{l?.code}</span>
                          </span>
                          <Icon name="chevronRight" className="h-3 w-3 shrink-0 text-ink-3" />
                        </span>
                      )
                    },
                  },
                  { header: 'Units', align: 'right', render: (r) => num(r.units), total: num(report.units) },
                  { header: 'Sales', align: 'right', render: (r) => rm(r.revenue), total: rm(report.revenue) },
                ]}
              />
            </section>
            <section className="min-w-0 sm:rounded-xl sm:border sm:border-line sm:px-4 sm:py-2">
              <p className="eyebrow mb-1.5 mt-1">What sold · {num(report.units)} units</p>
              <FiguresTable
                rows={report.skus}
                rowKey={(s) => s.skuId}
                page={PAGE}
                pageKey={JSON.stringify(rules)}
                columns={[
                  { header: 'Product', render: (s) => s.label },
                  { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(report.units) },
                  { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(report.revenue) },
                ]}
              />
            </section>
          </div>
        ) : (
          <EmptyState
            icon="filter"
            title="Nothing for these rules"
            body="No store sold anything the rules allow on these dates. Widen the dates, or delete a rule."
          />
        )}
      </PanelBody>

      {opened && (
        <StoreSalesModal
          locationId={opened.locationId}
          periods={[datesChoice(opened.day, opened.day)]}
          base={{ skuIds: items, countryCodes: nations }}
          onClose={() => setOpened(null)}
        />
      )}
    </Panel>
  )
}

/** The business date, between two days (20 November: "only keep between, from start date to end date"). */
function BetweenDates({
  from,
  to,
  today,
  onChange,
}: {
  from: DateStr
  to: DateStr
  today: DateStr
  onChange: (from: DateStr, to: DateStr) => void
}) {
  const set = (a: DateStr, b: DateStr) => {
    const next = chooseDates(a, b, today)
    onChange(next.from, next.to)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-ink-3">between</span>
      <div className="w-[156px]">
        <TextInput
          type="date"
          aria-label="Business date from"
          value={from}
          max={today}
          onChange={(e) => set(e.target.value, to)}
          className="h-9 text-[12.5px]"
        />
      </div>
      <span className="text-[12px] text-ink-3">and</span>
      <div className="w-[156px]">
        <TextInput
          type="date"
          aria-label="Business date to"
          value={to}
          max={today}
          onChange={(e) => set(from, e.target.value)}
          className="h-9 text-[12.5px]"
        />
      </div>
    </div>
  )
}

/** Any of the stores, items or nationalities chosen. */
function ChoiceRule({
  chosen,
  onChosen,
  noun,
  label,
  options,
  flag = false,
}: {
  chosen: string[]
  onChosen: (next: string[]) => void
  noun: string
  label: (value: string) => string
  options: React.ReactNode
  flag?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chosen.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/8 py-1 pl-2 pr-1 text-[12px] text-ink"
        >
          {flag && <Flag code={v} size={16} />}
          {label(v)}
          <button
            aria-label={`Take ${label(v)} off`}
            title={`Take ${label(v)} off`}
            onClick={() => onChosen(chosen.filter((x) => x !== v))}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
          >
            <Icon name="x" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="w-[236px] max-w-full">
        <Select
          aria-label={`Add a ${noun}`}
          value=""
          onChange={(e) => e.target.value && onChosen([...chosen, e.target.value])}
          className="h-9 text-[12.5px]"
        >
          <option value="">{chosen.length ? `Or another ${noun}…` : `Any ${noun} — choose…`}</option>
          {options}
        </Select>
      </div>
    </div>
  )
}
