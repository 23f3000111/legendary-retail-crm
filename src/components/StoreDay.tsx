import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { DataTable, type Column } from './ui/DataTable'
import { FiguresTable } from './ui/FiguresTable'
import { Flag } from './ui/Flag'
import { Icon } from './ui/icons'
import { Modal } from './ui/Modal'
import { Notice } from './ui/Notice'
import { useToasts } from './ui/Toast'
import { StockItemDetail } from './StockItemDetail'
import { useData } from '../store/useData'
import { emptyFilter, selectStock, selectStoreDay, type StoreDayRow } from '../store/selectors'
import { buildDetailReport, detailCsvBlocks, detailFilename, detailPrintSpec } from '../lib/detailReport'
import { downloadCsvSections } from '../lib/exportCsv'
import { openPrintReport } from '../lib/printReport'
import { countryByCode } from '../data/countries'
import { locationById } from '../data/locations'
import { TIER_LABEL } from '../data/products'
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
  const [item, setItem] = useState<StoreDayRow | null>(null)
  const stockRow = useMemo(
    () => (item ? selectStock(data, locationId).find((r) => r.skuId === item.skuId) : undefined),
    [data, locationId, item],
  )

  const filed = d.closing
  const counted = d.rows.some((r) => r.onHand !== null)
  const tender = d.tender
  const totals = {
    deducted: d.rows.reduce((a, r) => a + r.deducted, 0),
    revenue: d.rows.reduce((a, r) => a + r.revenue, 0),
    onHand: d.rows.reduce((a, r) => a + (r.onHand ?? 0), 0),
  }

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

  const columns: Column<StoreDayRow>[] = [
    {
      key: 'label',
      header: 'Product',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{r.label}</p>
          <p className="readout text-[11px] text-ink-3">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '150px',
      render: (r) => (
        <span className="inline-flex flex-col items-end gap-1">
          {r.prices.map((p) => (
            <span key={`${p.tier}:${p.unitPrice}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {/* Labelled the way the sale is, where it is not the store's own price. */}
              {p.tier !== store?.priceBasis && p.tier !== 'foc' && <Badge tone="neutral">{TIER_LABEL[p.tier]}</Badge>}
              <span className="readout text-[12.5px] text-ink-2">{p.tier === 'foc' ? 'FOC' : rm(p.unitPrice)}</span>
              {p.qty > 0 && <span className="readout text-[11px] text-ink-3">×{num(p.qty)}</span>}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'deducted',
      header: 'Deducted',
      align: 'right',
      width: '90px',
      render: (r) => (
        <span className={`readout text-[12.5px] ${r.deducted ? 'font-semibold text-ink' : 'text-ink-3'}`}>
          {r.deducted ? `−${num(r.deducted)}` : '0'}
        </span>
      ),
      total: totals.deducted ? `−${num(totals.deducted)}` : '0',
    },
    {
      key: 'sales',
      header: 'Sales',
      align: 'right',
      width: '100px',
      render: (r) => (
        <span className={`readout text-[12.5px] ${r.revenue ? 'text-ink' : 'text-ink-3'}`}>{r.units ? rm(r.revenue) : '—'}</span>
      ),
      total: rm(totals.revenue),
    },
    {
      key: 'onHand',
      header: d.live ? 'On hand' : 'On hand at close',
      align: 'right',
      width: '110px',
      render: (r) => (
        <span className="readout text-[13px] font-semibold text-ink">{r.onHand === null ? '—' : num(r.onHand)}</span>
      ),
      total: counted ? num(totals.onHand) : undefined,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: '36px',
      render: () => <Icon name="chevronRight" className="ml-auto h-3.5 w-3.5 text-ink-3" />,
    },
  ]

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
              }. Price is what each product went for that day. Deducted is what the day took off the shelf: sold, plus any tester, damage or sample. On hand is the count at that day's close. Tap a product to see what came in and what went out.`
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
          <DataTable
            columns={columns}
            rows={d.rows}
            rowKey={(r) => r.skuId}
            dense
            onRowClick={setItem}
            totalLabel={`Total · ${num(d.rows.length)} products`}
          />
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

      <Modal
        open={item !== null}
        onClose={() => setItem(null)}
        title={item?.label ?? ''}
        subtitle={item && stockRow ? `${item.code} · ${num(stockRow.onHand)} on the shelf at ${store?.shortName ?? ''} now` : undefined}
        width="max-w-lg"
      >
        {item && stockRow && <StockItemDetail locationId={locationId} skuId={item.skuId} row={stockRow} />}
      </Modal>
    </Panel>
  )
}
