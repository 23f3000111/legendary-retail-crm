import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { SegmentedControl } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { selectLocationSparkline, selectNotFiled } from '../../store/selectors'
import { locationById, locationsInChannel, type Channel } from '../../data/locations'
import { addDays, formatDate, formatDateShort, formatTimestamp } from '../../lib/dates'
import { rm } from '../../lib/format'

const TRAIL = 12

/**
 * Who has filed and who has not.
 *
 * This is Kelly's working screen: the deadline is 11pm, and when a store misses
 * it Davy, Kelly and Chloe are told (Q18). Pending corrections sit at the top,
 * because they are the only thing here that needs a decision.
 */
export function Closings() {
  const data = useData()
  const user = useCurrentUser()
  const capability = useCan()
  const resolveCorrection = useData((s) => s.resolveCorrection)
  const push = useToasts((s) => s.push)
  const [channel, setChannel] = useState<Channel>('main')

  const days = useMemo(
    () => Array.from({ length: TRAIL }, (_, i) => addDays(data.today, -(TRAIL - 1 - i))),
    [data.today],
  )

  const stores = locationsInChannel(channel).filter((l) => l.status === 'open')
  const filed = (locationId: string, period: string) =>
    data.closings.find((c) => c.locationId === locationId && c.period === period)

  const yesterday = addDays(data.today, -1)
  const notFiled = selectNotFiled(data, yesterday)
  const pending = data.closings.filter((c) => c.correction?.status === 'pending')

  const filedYesterday = stores.filter((s) => filed(s.id, yesterday)).length
  const revenueYesterday = stores.reduce(
    (a, s) => a + (filed(s.id, yesterday)?.revenueMYR ?? 0),
    0,
  )
  const gaps = stores.reduce((a, s) => a + days.filter((d) => !filed(s.id, d)).length, 0)

  const decide = (closingId: string, approve: boolean) => {
    if (!user) return
    const result = resolveCorrection({
      closingId,
      approvedBy: user.name,
      role: user.role,
      approve,
    })
    if (!result.ok) {
      push(result.error ?? 'That could not be decided.', 'critical')
      return
    }
    push(approve ? 'Correction approved' : 'Correction rejected', approve ? 'good' : 'info')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office · Operations</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">
            Closings
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Last {TRAIL} days to {formatDate(data.today)}. A gap means nothing was filed.
          </p>
        </div>
        <SegmentedControl<Channel>
          size="sm"
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'main', label: 'Main stores' },
            { value: 'dealer', label: 'Dealers' },
            { value: 'consignment', label: 'Consignment' },
            { value: 'online', label: 'Online' },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Filed yesterday"
          value={filedYesterday}
          format={(n) => `${Math.round(n)} of ${stores.length}`}
          footnote={
            filedYesterday === stores.length ? 'all in' : `${stores.length - filedYesterday} missing`
          }
          tone="violet"
          icon="clipboard"
        />
        <StatTile
          label="Revenue filed yesterday"
          value={revenueYesterday}
          format={rm}
          tone="blue"
          icon="wallet"
        />
        <StatTile
          label={`Gaps in ${TRAIL} days`}
          value={gaps}
          format={(n) => String(Math.round(n))}
          footnote={gaps ? 'chase these stores' : 'no gaps'}
          tone="cyan"
          icon="alert"
        />
      </div>

      {pending.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Needs a decision"
            title={`${pending.length} correction${pending.length === 1 ? '' : 's'} pending`}
            meta="A store has asked to change a filed figure inside the three-day window."
          />
          <Rule />
          <PanelBody className="space-y-2">
            {pending.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn/8 px-3.5 py-3"
              >
                <div className="min-w-[220px] flex-1">
                  <p className="text-[13px] text-ink">
                    {locationById(c.locationId)?.shortName} · {formatDateShort(c.period)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-2">{c.correction?.reason}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {c.correction?.requestedBy} ·{' '}
                    {c.correction && formatTimestamp(c.correction.requestedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="readout text-[12px] text-ink-3 line-through">
                    {rm(c.correction?.previousRevenueMYR ?? 0)}
                  </p>
                  <p className="readout text-[15px] font-semibold text-ink">{rm(c.revenueMYR)}</p>
                </div>
                {capability.approveCorrections ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => decide(c.id, false)}>
                      Reject
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => decide(c.id, true)}>
                      Approve
                    </Button>
                  </div>
                ) : (
                  <Badge tone="warn">Kelly decides</Badge>
                )}
              </div>
            ))}
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHeader eyebrow="Filing grid" title="Who has filed" />
        <Rule />
        <PanelBody>
          {channel === 'consignment' ? (
            <EmptyState
              icon="clock"
              title="Consignment reports monthly"
              body="These partners send one figure a month, so there is no daily grid. Their latest month is on the Stores screen."
            />
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
                      Store
                    </th>
                    {days.map((d) => (
                      <th
                        key={d}
                        className="pb-2 text-center text-[9.5px] font-normal text-ink-3"
                        style={{ width: 34 }}
                      >
                        {formatDateShort(d)}
                      </th>
                    ))}
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
                      Trend
                    </th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
                      Yesterday
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => {
                    const y = filed(s.id, yesterday)
                    return (
                      <tr key={s.id} className="border-b border-line/70 last:border-0">
                        <td className="py-2 pr-3">
                          <p className="text-[13px] leading-tight text-ink">{s.shortName}</p>
                          <p className="text-[11px] text-ink-3">{s.region}</p>
                        </td>
                        {days.map((d) => {
                          const c = filed(s.id, d)
                          return (
                            <td key={d} className="py-2 text-center">
                              <span
                                title={
                                  c
                                    ? `${formatDateShort(d)} · ${rm(c.revenueMYR)} · filed ${formatTimestamp(c.submittedAt)}`
                                    : `${formatDateShort(d)} · nothing filed`
                                }
                                className={`mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] ${
                                  c
                                    ? 'bg-primary/18 text-primary'
                                    : 'border border-critical/40 bg-critical/10 text-critical'
                                }`}
                              >
                                <Icon
                                  name={c ? 'check' : 'x'}
                                  className="h-2.5 w-2.5"
                                  strokeWidth={2.6}
                                />
                              </span>
                            </td>
                          )
                        })}
                        <td className="py-2">
                          <Sparkline data={selectLocationSparkline(data, s.id, TRAIL)} width={72} />
                        </td>
                        <td className="py-2 text-right">
                          {y ? (
                            <span className="readout text-[12.5px] text-ink">
                              {rm(y.revenueMYR)}
                            </span>
                          ) : (
                            <Badge tone="warn" icon="clock">
                              Missing
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>

      {notFiled.length > 0 && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <Icon name="bell" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-ink">
            <b>{notFiled.length}</b> stores missed {formatDate(yesterday)}:{' '}
            {notFiled.map((id) => locationById(id)?.shortName).join(', ')}. Davy, Kelly and Chloe
            were notified.
          </p>
        </div>
      )}
    </div>
  )
}
