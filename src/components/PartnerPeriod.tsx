import { useMemo } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { FiguresTable } from './ui/FiguresTable'
import { PAGE } from './ui/LoadMore'
import { FromTo } from './FromTo'
import { OutletOrderControl } from './OutletOrderControl'
import { useData } from '../store/useData'
import { useOutletSort } from '../store/useOutletOrder'
import { selectPartnerPeriod, type PartnerChannel, type PartnerPeriodRow } from '../store/selectors'
import { locationById } from '../data/locations'
import { formatDate, monthLabel } from '../lib/dates'
import { num, rm } from '../lib/format'
import { MONTH_RULE } from '../lib/words'
import type { DateStr } from '../data/types'

/**
 * The consignment partners, or the dealers, for dates of their own (20
 * November: "put calenders to select start date and end date ... for both
 * Dealers and Consignment separately and for dealers, there should be a
 * sorting like top most is highest value"). Each partner's months whose 1st
 * is in the dates, added up; highest first, or in the person's own order.
 * Tap a partner for its pop-up.
 */
export function PartnerPeriodPanel({
  channel,
  from,
  to,
  onDates,
  onOpen,
}: {
  channel: PartnerChannel
  from: DateStr
  to: DateStr
  onDates: (from: DateStr, to: DateStr) => void
  onOpen: (locationId: string) => void
}) {
  const data = useData()
  const p = useMemo(() => selectPartnerPeriod(data, channel, from, to), [data, channel, from, to])
  const order = useOutletSort(`revenue-${channel}`, 'value')
  const rows = order.sort(p.rows, (r) => r.locationId)
  const title = channel === 'dealer' ? 'Dealers' : 'Consignment'
  const span = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`

  const sub = (r: PartnerPeriodRow) => {
    const l = locationById(r.locationId)
    const margin = channel === 'consignment' && l?.marginPct != null ? ` · margin ${l.marginPct}%` : ''
    if (!r.months.length) return `Nothing keyed in${margin}`
    if (r.months.length > 1) return `${num(r.months.length)} months${margin}`
    const m = r.months[0]
    return `${m.keyed ? `Keyed in by ${m.keyed.enteredBy}` : 'From its closings'}${margin}`
  }

  return (
    <Panel className="h-fit min-w-0">
      <PanelHeader
        eyebrow={`${title} · ${span}`}
        title={rm(p.total)}
        meta={
          p.months.length
            ? `${num(p.withFigure)} of ${num(p.rows.length)} with a figure for ${p.months.map(monthLabel).join(', ')}.`
            : `No month begins within these dates. Partners report once a month. ${MONTH_RULE}`
        }
        action={<OutletOrderControl sort={order} channels={[channel]} />}
      />
      <Rule />
      <PanelBody className="space-y-3">
        <FromTo from={from} to={to} today={data.today} onChange={onDates} label={title} />
        <FiguresTable
          rows={rows}
          rowKey={(r) => r.locationId}
          page={PAGE}
          pageKey={`${from}|${to}|${order.mode}`}
          onRowClick={(r) => onOpen(r.locationId)}
          columns={[
            {
              header: channel === 'dealer' ? 'Dealer' : 'Partner',
              render: (r) => (
                <span className="flex flex-col">
                  <span className="leading-tight">{locationById(r.locationId)?.name ?? r.locationId}</span>
                  <span className="text-[11px] text-ink-3">{sub(r)}</span>
                </span>
              ),
            },
            {
              header: 'Sales',
              align: 'right',
              render: (r) => (r.months.length ? rm(r.revenue) : <span className="text-ink-3">—</span>),
              total: rm(p.total),
            },
          ]}
        />
      </PanelBody>
    </Panel>
  )
}
