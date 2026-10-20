import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { DataTable, EmptyState, type Column } from './ui/DataTable'
import { Select } from './ui/Field'
import { Flag } from './ui/Flag'
import { DateSpanInput } from './DateSpanInput'
import { useData } from '../store/useData'
import { selectSalesReport, type ReportRow, type ReportRule } from '../store/selectors'
import { locationById } from '../data/locations'
import { countriesAlphabetical, countryByCode } from '../data/countries'
import { products, skuLabel, skus } from '../data/products'
import { addDays, formatDate, spanLabel } from '../lib/dates'
import { downloadCsv } from '../lib/exportCsv'
import { newId } from '../lib/ids'
import { num, rm } from '../lib/format'

const FIELD_LABEL: Record<ReportRule['field'], string> = {
  date: 'Business date',
  item: 'Item',
  nationality: 'Nationality',
}

const FIELDS: ReportRule['field'][] = ['date', 'item', 'nationality']

const blankRule = (field: ReportRule['field'], yesterday: string): ReportRule =>
  field === 'date'
    ? { id: newId(), field, span: { op: 'equal', from: yesterday, to: yesterday } }
    : field === 'item'
      ? { id: newId(), field, op: 'equal', skuIds: [] }
      : { id: newId(), field, op: 'equal', countryCodes: [] }

/**
 * Finance's sales report: every store, day by day.
 *
 * The client's fifth-revision follow-up (20 October) asked for filters like
 * the ones in Zeoniq's reports: a business date, equal to one day or between
 * two; the items; the nationalities; each rule with its own Delete on the
 * right. The report keeps only what every rule allows, one row per store per
 * business date, and the export carries the date on every row.
 */
export function SalesReport() {
  const data = useData()
  const yesterday = addDays(data.today, -1)
  const [rules, setRules] = useState<ReportRule[]>(() => FIELDS.map((f) => blankRule(f, yesterday)))

  const report = useMemo(() => selectSalesReport(data, rules), [data, rules])
  const missing = FIELDS.filter((f) => !rules.some((r) => r.field === f))

  const update = (id: string, next: ReportRule) => setRules((rs) => rs.map((r) => (r.id === id ? next : r)))
  const remove = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id))
  const add = (field: ReportRule['field']) =>
    setRules((rs) => [...rs, blankRule(field, yesterday)].sort((a, b) => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field)))

  const when = report.days ? spanLabel(report.days) : 'Every day on record'

  const columns: Column<ReportRow>[] = [
    {
      key: 'day',
      header: 'Business date',
      width: '140px',
      render: (r) => <span className="readout text-[12.5px] text-ink">{formatDate(r.day)}</span>,
    },
    {
      key: 'store',
      header: 'Store',
      render: (r) => {
        const l = locationById(r.locationId)
        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-tight text-ink">{l?.name ?? r.locationId}</p>
            <p className="readout text-[10.5px] text-ink-3">{l?.code}</p>
          </div>
        )
      },
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      width: '90px',
      render: (r) => <span className="readout text-[12.5px] text-ink-2">{num(r.units)}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      width: '130px',
      render: (r) => <span className="readout text-[12.5px] font-semibold text-ink">{rm(r.revenue)}</span>,
    },
  ]

  const exportReport = () => {
    const tag = report.days
      ? report.days.from === report.days.to
        ? report.days.from
        : `${report.days.from}-to-${report.days.to}`
      : 'all-dates'
    downloadCsv(
      `legendary-sales-report-${tag}.csv`,
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
        title="Every store, day by day"
        meta={`${when}. Days that have ended are as filed; today is as it stands. Dealers and consignment report a month at a time, on Dealer sales.`}
        action={
          <Button size="sm" variant="secondary" icon="download" onClick={exportReport} disabled={!report.rows.length}>
            Export
          </Button>
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
            <p className="px-1 py-2 text-[12.5px] text-ink-3">No rules: every day, every item, every nationality.</p>
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

        {/* A month of every store is a long list: it scrolls in its own box, and the export has it all. */}
        <div className="max-h-[560px] overflow-y-auto rounded-xl border border-line px-3 sm:px-4">
        <DataTable
          columns={columns}
          rows={report.rows}
          rowKey={(r) => `${r.day}::${r.locationId}`}
          dense
          empty={
            <EmptyState
              icon="filter"
              title="Nothing for these rules"
              body="No store sold anything the rules allow on these dates. Widen the dates, or delete a rule."
            />
          }
        />
        </div>
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
