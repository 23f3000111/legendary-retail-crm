import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Badge } from './ui/Badge'
import { Button, IconButton } from './ui/Button'
import { Flag } from './ui/Flag'
import { Modal } from './ui/Modal'
import { FiguresTable } from './ui/FiguresTable'
import { useData } from '../store/useData'
import { useCan } from '../store/useAuth'
import { selectDailySales, selectDayDetail } from '../store/selectors'
import { locationById } from '../data/locations'
import { countryByCode } from '../data/countries'
import { addDays, dayOfWeek, formatDate, monthKey, monthLabel, shiftMonth } from '../lib/dates'
import { num, rm, rmCompact } from '../lib/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The first month anything was filed: nothing before it to page back to. */
const firstMonth = (closings: { period: string }[], fallback: string) =>
  closings.reduce((a, c) => (monthKey(c.period) < a ? monthKey(c.period) : a), fallback)

/**
 * A month of daily sales, laid out as a calendar (client, 1 November): every
 * day shows what it sold, and opens to show the day in full — each store's
 * sales, each product, and where the customers came from. With `locationId`,
 * one store's own days.
 */
export function SalesCalendar({ locationId }: { locationId?: string }) {
  const data = useData()
  const thisMonth = monthKey(data.today)
  const [month, setMonth] = useState(thisMonth)
  const [open, setOpen] = useState<string | null>(null)

  const days = useMemo(() => selectDailySales(data, month, locationId), [data, month, locationId])
  const earliest = useMemo(
    () => firstMonth(data.closings.filter((c) => !locationId || c.locationId === locationId), thisMonth),
    [data.closings, locationId, thisMonth],
  )
  const total = [...days.values()].reduce((a, d) => a + d.revenue, 0)
  const customers = [...days.values()].reduce((a, d) => a + d.customers, 0)

  // Monday to Sunday, from the week the 1st falls in to the week the month ends in.
  const first = `${month}-01`
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1)
  const start = addDays(first, -((dayOfWeek(first) + 6) % 7))
  const end = addDays(last, (7 - dayOfWeek(last)) % 7)
  const cells: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d)

  return (
    <Panel>
      <PanelHeader
        eyebrow="Calendar"
        title={`${monthLabel(month)} · ${rm(total)}`}
        meta={`${num(customers)} customers. Tap a day to open it: ${
          locationId ? 'each product' : 'each store, each product'
        }, and where the customers came from.`}
        action={
          <div className="flex items-center gap-1">
            <IconButton
              name="chevronLeft"
              label="The month before"
              disabled={month <= earliest}
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="disabled:opacity-30"
            />
            <Button size="sm" variant="ghost" onClick={() => setMonth(thisMonth)} disabled={month === thisMonth}>
              This month
            </Button>
            <IconButton
              name="chevronRight"
              label="The month after"
              disabled={month >= thisMonth}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="disabled:opacity-30"
            />
          </div>
        }
      />
      <Rule />
      <PanelBody>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <p key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
              {w}
            </p>
          ))}
          {cells.map((d) => {
            const inMonth = monthKey(d) === month
            const sales = days.get(d)
            const future = d > data.today
            const isToday = d === data.today
            if (!inMonth) return <div key={d} aria-hidden="true" />
            return (
              <button
                key={d}
                onClick={() => setOpen(d)}
                disabled={future || !sales}
                title={sales ? `${formatDate(d)} · ${rm(sales.revenue)} · ${num(sales.customers)} customers` : formatDate(d)}
                className={`flex min-h-[58px] flex-col items-start rounded-lg border px-1.5 py-1 text-left transition-colors sm:min-h-[76px] sm:px-2 sm:py-1.5 ${
                  isToday
                    ? 'border-primary/60 bg-primary/8'
                    : sales
                      ? 'border-line bg-surface-2 hover:border-primary/45 hover:bg-primary/5'
                      : 'border-line/60 bg-surface'
                } disabled:cursor-default`}
              >
                <span className={`readout text-[11px] ${isToday ? 'font-semibold text-primary' : 'text-ink-3'}`}>
                  {Number(d.slice(8))}
                </span>
                {sales ? (
                  <>
                    <span className="readout mt-auto text-[10.5px] font-semibold text-ink sm:hidden">
                      {rmCompact(sales.revenue).replace('RM ', '')}
                    </span>
                    <span className="readout mt-auto hidden text-[12px] font-semibold text-ink sm:block">
                      {rm(sales.revenue)}
                    </span>
                    <span className="hidden text-[10.5px] text-ink-3 sm:block">
                      {num(sales.customers)} {sales.customers === 1 ? 'customer' : 'customers'}
                      {isToday ? ' · live' : ''}
                    </span>
                  </>
                ) : (
                  !future && <span className="mt-auto text-[10.5px] text-ink-3">—</span>
                )}
              </button>
            )
          })}
        </div>
      </PanelBody>
      {open && <DayDetailModal day={open} locationId={locationId} onClose={() => setOpen(null)} />}
    </Panel>
  )
}

/**
 * One day in full (client, 1 November): "a detailed overview of the day per
 * store, how much sales, how many SKU sold, which country buyer" — and, for
 * one store, every product it sold and which countries bought it.
 */
export function DayDetailModal({ day, locationId, onClose }: { day: string; locationId?: string; onClose: () => void }) {
  const data = useData()
  const capability = useCan()
  const d = useMemo(() => selectDayDetail(data, day, locationId), [data, day, locationId])
  const store = locationId ? locationById(locationId) : undefined
  const live = day === data.today
  const filed = locationId && data.closings.some((c) => c.locationId === locationId && c.period === day)

  return (
    <Modal
      open
      onClose={onClose}
      title={`${formatDate(day)}${store ? ` · ${store.shortName}` : ''}`}
      subtitle={`${rm(d.revenue)} · ${num(d.units)} units · ${num(d.customers)} customers${live ? ' · today, as it stands' : ''}`}
      width="max-w-3xl"
      footer={
        <>
          {store && filed && capability.approveCorrections && (
            <Link to={`/close?store=${store.id}&day=${day}`} className="mr-auto">
              <Button size="sm" variant="secondary" icon="clipboard">
                Open the closing
              </Button>
            </Link>
          )}
          <Button size="sm" variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!store && (
          <section>
            <p className="eyebrow mb-2">Each store</p>
            <FiguresTable
              rows={d.stores}
              rowKey={(s) => s.locationId}
              columns={[
                {
                  header: 'Store',
                  render: (s) => (
                    <span className="flex items-center gap-2">
                      <Link to={`/stores/${s.locationId}`} className="hover:text-primary hover:underline">
                        {locationById(s.locationId)?.shortName ?? s.locationId}
                      </Link>
                      {!s.filed && !live && <Badge tone="warn">Not filed</Badge>}
                    </span>
                  ),
                },
                { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(d.revenue) },
                { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(d.units) },
                { header: 'Customers', align: 'right', render: (s) => num(s.customers), total: num(d.customers) },
              ]}
              empty="No store sold anything that day."
            />
          </section>
        )}

        <section>
          <p className="eyebrow mb-2">Each product</p>
          <FiguresTable
            rows={d.skus}
            rowKey={(s) => s.skuId}
            columns={[
              {
                // Who bought it sits under the name, so a phone needs no fourth column.
                header: 'Product · bought by',
                render: (s) => (
                  <span className="flex flex-col gap-0.5">
                    <span>{s.label}</span>
                    {s.countries.length > 0 && (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {s.countries.map((c) => {
                          const name = countryByCode(c.countryCode)?.name ?? c.countryCode
                          return (
                            <span
                              key={c.countryCode}
                              title={`${name}: ${num(c.units)} ${c.units === 1 ? 'unit' : 'units'}`}
                              className="inline-flex items-center gap-1 text-[11px] text-ink-3"
                            >
                              <Flag code={c.countryCode} size={13} alt={name} />
                              {num(c.units)}
                            </span>
                          )
                        })}
                      </span>
                    )}
                  </span>
                ),
              },
              { header: 'Units', align: 'right', render: (s) => num(s.units), total: num(d.units) },
              { header: 'Sales', align: 'right', render: (s) => rm(s.revenue), total: rm(d.revenue) },
            ]}
            empty="Nothing sold that day."
          />
        </section>

        <section>
          <p className="eyebrow mb-2">Where the customers came from</p>
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
            empty="No country recorded that day."
          />
        </section>
      </div>
    </Modal>
  )
}
