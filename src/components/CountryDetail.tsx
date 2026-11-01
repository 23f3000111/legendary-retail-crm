import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Flag } from './ui/Flag'
import { FiguresTable } from './ui/FiguresTable'
import { useData } from '../store/useData'
import { selectCountryDetail, type Filter } from '../store/selectors'
import { locationById } from '../data/locations'
import { countryByCode } from '../data/countries'
import { num, rm } from '../lib/format'

/**
 * One nationality, opened from "Which countries bought" (client, 1 November):
 * which stores had the most customers from it, and which products they bought
 * the most. Over the same days and filters as the table it was opened from.
 */
export function CountryDetailModal({
  countryCode,
  filter,
  when,
  onClose,
}: {
  countryCode: string
  filter: Filter
  /** The days it covers, in words: "Last 30 days". */
  when: string
  onClose: () => void
}) {
  const data = useData()
  const d = useMemo(() => selectCountryDetail(data, filter, countryCode), [data, filter, countryCode])
  const country = countryByCode(countryCode)

  return (
    <Modal
      open
      onClose={onClose}
      title={country?.name ?? countryCode}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Flag code={countryCode} size={18} />
          {when}: {num(d.customers)} {d.customers === 1 ? 'customer' : 'customers'} · {num(d.units)} units · {rm(d.revenue)}
        </span>
      }
      width="max-w-2xl"
      footer={
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="eyebrow mb-2">Stores, most customers first</p>
          <FiguresTable
            rows={d.stores}
            rowKey={(s) => s.locationId}
            columns={[
              {
                header: 'Store',
                render: (s) => (
                  <Link to={`/stores/${s.locationId}`} className="hover:text-primary hover:underline">
                    {locationById(s.locationId)?.shortName ?? s.locationId}
                  </Link>
                ),
              },
              { header: 'Customers', align: 'right', render: (s) => num(s.customers), total: num(d.customers) },
              { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(d.units) },
              { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(d.revenue) },
            ]}
            empty="No store recorded a customer from here in these days."
          />
        </section>
        <section>
          <p className="eyebrow mb-2">Products, most bought first</p>
          <FiguresTable
            rows={d.skus}
            rowKey={(s) => s.skuId}
            columns={[
              { header: 'Product', render: (s) => s.label },
              { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(d.units) },
              { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(d.revenue) },
            ]}
            empty="Nothing bought in these days."
          />
        </section>
      </div>
    </Modal>
  )
}
