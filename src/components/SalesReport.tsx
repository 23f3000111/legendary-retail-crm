import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { EmptyState } from './ui/DataTable'
import { FiguresTable } from './ui/FiguresTable'
import { useToasts } from './ui/Toast'
import { Select } from './ui/Field'
import { Flag } from './ui/Flag'
import { DateSpanInput } from './DateSpanInput'
import { useData } from '../store/useData'
import { selectSalesReport, type ReportRow, type ReportRule } from '../store/selectors'
import { CHANNEL_PLURAL, locationById, tradingLocations } from '../data/locations'
import { openPrintReport } from '../lib/printReport'
import { countriesAlphabetical, countryByCode } from '../data/countries'
import { products, skuLabel, skus } from '../data/products'
import { addDays, formatDate, spanLabel } from '../lib/dates'
import { downloadCsv } from '../lib/exportCsv'
import { newId } from '../lib/ids'
import { num, rm } from '../lib/format'

const FIELD_LABEL: Record<ReportRule['field'], string> = {
  date: 'Business date',
  store: 'Store',
  item: 'Item',
  nationality: 'Nationality',
}

const ALL_FIELDS: ReportRule['field'][] = ['date', 'store', 'item', 'nationality']

const blankRule = (field: ReportRule['field'], yesterday: string): ReportRule =>
  field === 'date'
    ? { id: newId(), field, span: { op: 'equal', from: yesterday, to: yesterday } }
    : field === 'store'
      ? { id: newId(), field, op: 'equal', locationIds: [] }
      : field === 'item'
        ? { id: newId(), field, op: 'equal', skuIds: [] }
        : { id: newId(), field, op: 'equal', countryCodes: [] }

/** A rule in words, for the PDF report: "Store equal KLIA T2, BSAS". */
const ruleInWords = (r: ReportRule): string | null => {
  const list = (op: 'equal' | 'not_equal', names: string[]) =>
    names.length ? `${FIELD_LABEL[r.field]} ${op === 'equal' ? 'is' : 'is not'} ${names.join(', ')}` : null
  if (r.field === 'store') return list(r.op, r.locationIds.map((id) => locationById(id)?.shortName ?? id))
  if (r.field === 'item') return list(r.op, r.skuIds.map((id) => skuLabel(id)))
  if (r.field === 'nationality') return list(r.op, r.countryCodes.map((c) => countryByCode(c)?.name ?? c))
  return null
}

/**
 * The sales report: every store, day by day — or, on a store's own page, that
 * store alone (both 20 October).
 *
 * The client's sixth revision asked for filters like the ones in Zeoniq's
 * reports: a business date, equal to one day or between two; the items; the
 * nationalities; each rule with its own Delete on the right. The report keeps
 * only what every rule allows, one row per store per business date, and the
 * export carries the date on every row.
 */
export function SalesReport({ locationId }: { locationId?: string } = {}) {
  const data = useData()
  const push = useToasts((s) => s.push)
  const yesterday = addDays(data.today, -1)
  // On one store's own page there is no store to choose.
  const FIELDS = locationId ? ALL_FIELDS.filter((f) => f !== 'store') : ALL_FIELDS
  const [rules, setRules] = useState<ReportRule[]>(() => FIELDS.map((f) => blankRule(f, yesterday)))
  const store = locationId ? locationById(locationId) : undefined

  const report = useMemo(() => selectSalesReport(data, rules, locationId), [data, rules, locationId])
  const missing = FIELDS.filter((f) => !rules.some((r) => r.field === f))

  const update = (id: string, next: ReportRule) => setRules((rs) => rs.map((r) => (r.id === id ? next : r)))
  const remove = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id))
  const add = (field: ReportRule['field']) =>
    setRules((rs) => [...rs, blankRule(field, yesterday)].sort((a, b) => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field)))

  const when = report.days ? spanLabel(report.days) : 'Every day on record'

  const tag = report.days
    ? report.days.from === report.days.to
      ? report.days.from
      : `${report.days.from}-to-${report.days.to}`
    : 'all-dates'

  // The same report, designed, for printing or saving as a PDF (1 November).
  const printReport = () => {
    const byDay = new Map<string, number>()
    for (const r of report.rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenue)
    const byStore = new Map<string, number>()
    for (const r of report.rows) byStore.set(r.locationId, (byStore.get(r.locationId) ?? 0) + r.revenue)
    // One store, or one day: the bars go the other way.
    const bars =
      store || byDay.size > 1
        ? [...byDay.entries()].map(([day, value]) => ({ label: formatDate(day), value, display: rm(value) }))
        : [...byStore.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, value]) => ({ label: locationById(id)?.shortName ?? id, value, display: rm(value) }))
    const days = new Set(report.rows.map((r) => r.day)).size
    const ok = openPrintReport({
      title: `Sales report${store ? ` · ${store.name}` : ''}`,
      subtitle: report.days ? spanLabel(report.days) : 'Every day on record',
      boxes: [
        { label: 'Sales', value: rm(report.revenue) },
        { label: 'Units', value: num(report.units) },
        { label: store ? 'Days' : 'Stores', value: num(store ? days : byStore.size) },
        { label: 'Per day', value: rm(days ? report.revenue / days : 0), note: `${num(days)} ${days === 1 ? 'day' : 'days'}` },
      ],
      rules: rules.map(ruleInWords).filter((r): r is string => Boolean(r)),
      chart: { title: byDay.size > 1 || store ? 'Sales by day' : 'Sales by store', bars },
      table: {
        headers: store ? ['Business date', 'Units', 'Revenue'] : ['Business date', 'Store', 'Units', 'Revenue'],
        right: store ? [false, true, true] : [false, false, true, true],
        rows: report.rows.map((r) =>
          store
            ? [formatDate(r.day), num(r.units), rm(r.revenue)]
            : [formatDate(r.day), locationById(r.locationId)?.name ?? r.locationId, num(r.units), rm(r.revenue)],
        ),
        total: store ? ['Total', num(report.units), rm(report.revenue)] : ['Total', '', num(report.units), rm(report.revenue)],
      },
    })
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  const exportReport = () => {
    downloadCsv(
      `legendary-sales-report-${store ? `${store.code}-` : ''}${tag}.csv`,
      ['Business date', 'Store', 'Store code', 'Units', 'Revenue MYR'],
      [
        ...report.rows.map((r) => [
          r.day,
          locationById(r.locationId)?.name ?? r.locationId,
          locationById(r.locationId)?.code ?? '',
          r.units,
          r.revenue,
        ]),
        [report.days ? spanLabel(report.days) : 'All dates', 'Total', '', report.units, report.revenue],
      ],
    )
  }

  return (
    <Panel>
      <PanelHeader
        eyebrow="Sales report"
        title={store ? 'This store, day by day' : 'Every store, day by day'}
        meta={`${when}. Days that have ended are as filed; today is as it stands.${
          !store
            ? ' Dealers and consignment report a month at a time, on Dealer sales.'
            : store.channel !== 'main'
              ? ' A dealer or consignment partner reports a monthly total, on Dealer sales, so it may have no days here.'
              : ''
        }`}
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
                  <DateSpanInput
                    value={rule.span}
                    onChange={(span) => update(rule.id, { ...rule, span })}
                    max={data.today}
                  />
                ) : rule.field === 'store' ? (
                  <ChoiceRule
                    op={rule.op}
                    onOp={(op) => update(rule.id, { ...rule, op })}
                    chosen={rule.locationIds}
                    onChosen={(locationIds) => update(rule.id, { ...rule, locationIds })}
                    noun="store"
                    label={(id) => locationById(id)?.shortName ?? id}
                    options={
                      <>
                        {(['main', 'dealer', 'consignment'] as const).map((channel) => (
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
                    op={rule.op}
                    onOp={(op) => update(rule.id, { ...rule, op })}
                    chosen={rule.skuIds}
                    onChosen={(skuIds) => update(rule.id, { ...rule, skuIds })}
                    noun="item"
                    label={(id) => skuLabel(id)}
                    options={
                      <>
                        {products.map((p) => {
                          // Taken-off products too: their sales are still in the report.
                          const variants = skus.filter((s) => s.sellable && s.productId === p.id)
                          if (!variants.length) return null
                          return (
                            <optgroup key={p.id} label={p.name}>
                              {variants.map((s) => (
                                <option key={s.id} value={s.id} disabled={rule.skuIds.includes(s.id)}>
                                  {s.label}
                                  {s.removed ? ' (taken off)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </>
                    }
                  />
                ) : (
                  <ChoiceRule
                    op={rule.op}
                    onOp={(op) => update(rule.id, { ...rule, op })}
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
            <p className="px-1 py-2 text-[12.5px] text-ink-3">
              No rules: every day, {store ? '' : 'every store, '}every item, every nationality.
            </p>
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

        {/* A month of every store is a long list: it scrolls in its own box, the
            total at its foot, and the export has it all. */}
        {report.rows.length ? (
          <div className="max-h-[560px] overflow-y-auto rounded-xl border border-line px-3 py-2 sm:px-4">
            <FiguresTable
              rows={report.rows}
              rowKey={(r) => `${r.day}::${r.locationId}`}
              columns={[
                { header: 'Business date', render: (r) => <span className="readout">{formatDate(r.day)}</span> },
                ...(locationId
                  ? []
                  : [
                      {
                        header: 'Store',
                        render: (r: ReportRow) => {
                          const l = locationById(r.locationId)
                          return (
                            <span className="flex flex-col">
                              <span className="leading-tight">{l?.name ?? r.locationId}</span>
                              <span className="readout text-[10.5px] text-ink-3">{l?.code}</span>
                            </span>
                          )
                        },
                      },
                    ]),
                { header: 'Units', align: 'right', render: (r) => num(r.units), total: num(report.units) },
                { header: 'Revenue', align: 'right', render: (r) => rm(r.revenue), total: rm(report.revenue) },
              ]}
            />
          </div>
        ) : (
          <EmptyState
            icon="filter"
            title="Nothing for these rules"
            body={`${store ? 'This store' : 'No store'} sold ${store ? 'nothing' : 'anything'} the rules allow on these dates. Widen the dates, or delete a rule.`}
          />
        )}
      </PanelBody>
    </Panel>
  )
}

/** "Equal" or "not equal" to any of the chosen items or nationalities. */
function ChoiceRule({
  op,
  onOp,
  chosen,
  onChosen,
  noun,
  label,
  options,
  flag = false,
}: {
  op: 'equal' | 'not_equal'
  onOp: (op: 'equal' | 'not_equal') => void
  chosen: string[]
  onChosen: (next: string[]) => void
  noun: string
  label: (value: string) => string
  options: React.ReactNode
  flag?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[118px]">
        <Select
          aria-label={`${noun}: equal or not equal`}
          value={op}
          onChange={(e) => onOp(e.target.value as 'equal' | 'not_equal')}
          className="h-9 text-[12.5px]"
        >
          <option value="equal">equal</option>
          <option value="not_equal">not equal</option>
        </Select>
      </div>
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
