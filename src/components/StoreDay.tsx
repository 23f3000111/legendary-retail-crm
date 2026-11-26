import { useMemo } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { FiguresTable } from './ui/FiguresTable'
import { Flag } from './ui/Flag'
import { Notice } from './ui/Notice'
import { useToasts } from './ui/Toast'
import { DayStockTable } from './DayStockTable'
import { useData } from '../store/useData'
import { emptyFilter, selectStoreDay } from '../store/selectors'
import { buildDetailReport, detailCsvBlocks, detailFilename, detailPrintSpec } from '../lib/detailReport'
import { downloadCsvSections } from '../lib/exportCsv'
import { openPrintReport } from '../lib/printReport'
import { countryByCode } from '../data/countries'
import { locationById } from '../data/locations'
import { formatDate, formatDayShort, formatTimestamp } from '../lib/dates'
import { num, rm } from '../lib/format'

/**
 * One store's day, chosen on its calendar (Revision 10, the client's
 * eighth): "click on the date, then only appear" that day — every product
 * with the price it went for, what the day took off the shelf, what it sold,
 * and the count at that day's close; how it was paid, cash and card; and,
 * right under the products, where the customers came from (16 November).
 * Days left and Status are gone. The CSV and PDF are that day in full.
 */
export function StoreDay({ locationId, day }: { locationId: string; day: string }) {
  const data = useData()
  const push = useToasts((s) => s.push)
  const store = locationById(locationId)
  const d = useMemo(() => selectStoreDay(data, locationId, day), [data, locationId, day])

  const filed = d.closing
  const tender = d.tender

  const report = () => buildDetailReport(data, { ...emptyFilter(day, day), locationIds: [locationId] })
  const exportCsv = () => {
    const r = report()
    downloadCsvSections(
      detailFilename(r, store?.code),
      detailCsvBlocks(r, [
        ['Store', store?.name ?? locationId, store?.code ?? ''],
        ['Filed', filed ? `${filed.submittedBy} at ${formatTimestamp(filed.submittedAt)}` : d.live ? 'Today, as it stands' : 'Not filed'],
      ]),
    )
  }
  const printDay = () => {
    const ok = openPrintReport(
      detailPrintSpec(report(), {
        title: `${store?.name ?? locationId} · ${formatDate(day)}`,
        subtitle: filed
          ? `Filed by ${filed.submittedBy} at ${formatTimestamp(filed.submittedAt)}`
          : d.live
            ? 'Today, as it stands — the shelf is counted at closing'
            : 'Not filed',
        rules: [],
      }),
    )
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  const box = (label: string, value: string, note?: string, strong = false) => (
    <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className={`readout mt-1 text-[16px] ${strong ? 'font-semibold text-primary' : 'text-ink'}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-ink-3">{note}</p>}
    </div>
  )

  return (
    <Panel>
      <PanelHeader
        eyebrow="The day"
        title={`${formatDayShort(day)} ${day.slice(0, 4)} · ${rm(d.revenue)}`}
        meta={
          filed
            ? `Filed by ${filed.submittedBy} at ${formatTimestamp(filed.submittedAt)}${
                filed.editedBy && filed.editedAt ? ` · changed by ${filed.editedBy} at ${formatTimestamp(filed.editedAt)}` : ''
              }. Price is what each product went for that day. Deducted is what the day took off the shelf: sold, plus any tester, damage or sample — and for a vial, what its count says went, where that is more than was rung up. On hand is the count at that day's close. Tap a product to see what came in and what went out.`
            : d.live
              ? 'Today, as it stands. The shelf is counted when the day is closed.'
              : 'Nothing was filed for this day.'
        }
        action={
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" icon="download" onClick={exportCsv} disabled={!filed && !d.units}>
              CSV
            </Button>
            <Button size="sm" variant="primary" icon="printer" onClick={printDay} disabled={!filed && !d.units}>
              PDF report
            </Button>
          </div>
        }
      />
      <Rule />
      <PanelBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {box('Sales', rm(d.revenue), `${num(d.units)} ${d.units === 1 ? 'unit' : 'units'}`, true)}
          {box('Cash', tender ? rm(tender.cash) : '—', tender ? 'as filed' : d.live ? 'at closing' : 'not filed')}
          {box(
            'Card',
            tender ? rm(tender.card) : '—',
            tender?.ewallet ? `and ${rm(tender.ewallet)} e-wallet` : tender ? 'as filed' : d.live ? 'at closing' : 'not filed',
          )}
          {box('Customers', num(d.customers), d.live ? 'so far today' : undefined)}
        </div>

        {!filed && !d.live && (
          <Notice tone="warn" icon="clock">
            {store?.shortName ?? 'This store'} did not file {formatDate(day)}, so nothing was counted that day.
          </Notice>
        )}

        <section>
          <p className="eyebrow mb-2">Stock</p>
          <DayStockTable locationId={locationId} rows={d.rows} onHandHeader={d.live ? 'On hand' : 'On hand at close'} />
        </section>

        <section>
          <p className="eyebrow mb-2">Where the customers came from</p>
          {store?.recordsCountries ? (
            <FiguresTable
              rows={d.countries}
              rowKey={(c) => c.countryCode}
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
                {
                  header: 'Customers',
                  align: 'right',
                  render: (c) => num(c.customers),
                  total: num(d.countries.reduce((a, c) => a + c.customers, 0)),
                },
                { header: 'Units', align: 'right', render: (c) => num(c.units), total: num(d.countries.reduce((a, c) => a + c.units, 0)) },
                {
                  header: 'Sales',
                  align: 'right',
                  render: (c) => rm(c.revenue),
                  total: rm(d.countries.reduce((a, c) => a + c.revenue, 0)),
                },
              ]}
              empty="No customer's country was recorded that day."
            />
          ) : (
            <p className="py-3 text-[12.5px] text-ink-3">Only main stores record where the customers came from.</p>
          )}
        </section>
      </PanelBody>
    </Panel>
  )
}
