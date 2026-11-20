import { Button } from './ui/Button'
import { useToasts } from './ui/Toast'
import { useData } from '../store/useData'
import { emptyFilter } from '../store/selectors'
import { buildDetailReport, detailCsvBlocks, detailFilename, detailPrintSpec } from '../lib/detailReport'
import { downloadCsvSections } from '../lib/exportCsv'
import { openPrintReport } from '../lib/printReport'
import { locationById } from '../data/locations'
import { formatDate, monthLabel } from '../lib/dates'
import { monthDates } from '../lib/periods'

/**
 * A store's month in full, as CSV or PDF, from its calendar — the same
 * detailed report as a day's (16 November: "they can export the specific
 * months or specific date and then with all the detail ... for them to key
 * into system").
 */
export function MonthExport({ locationId, month }: { locationId: string; month: string }) {
  const data = useData()
  const push = useToasts((s) => s.push)
  const store = locationById(locationId)
  const { from, to } = monthDates(month, data.today)
  const report = () => buildDetailReport(data, { ...emptyFilter(from, to), locationIds: [locationId] })

  const csv = () => {
    const r = report()
    downloadCsvSections(detailFilename(r, store?.code), detailCsvBlocks(r, [['Store', store?.name ?? locationId, store?.code ?? '']]))
  }
  const pdf = () => {
    const ok = openPrintReport(
      detailPrintSpec(report(), {
        title: `${store?.name ?? locationId} · ${monthLabel(month)}`,
        subtitle: from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`,
        rules: [],
      }),
    )
    if (!ok) push('The report could not open: allow pop-ups for this site, then try again.', 'critical')
  }

  return (
    <>
      <Button size="sm" variant="secondary" icon="download" onClick={csv} title={`${monthLabel(month)} in full, as a CSV`}>
        CSV · {monthLabel(month)}
      </Button>
      <Button size="sm" variant="secondary" icon="printer" onClick={pdf} title={`${monthLabel(month)} in full, as a PDF`}>
        PDF · {monthLabel(month)}
      </Button>
    </>
  )
}
