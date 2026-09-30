import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { Field, SegmentedControl, TextArea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ChangeList } from '../../components/ui/Notice'
import { Icon } from '../../components/ui/icons'
import { Sparkline } from '../../components/charts/Sparkline'
import { useData } from '../../store/useData'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { selectLocationSparkline, selectNotFiled } from '../../store/selectors'
import { locationById, locationsInChannel, type Channel } from '../../data/locations'
import { addDays, formatDate, formatDateShort, formatTimestamp } from '../../lib/dates'
import { rm } from '../../lib/format'
import type { Closing } from '../../data/types'

const TRAIL = 12

/**
 * Who has filed and who has not.
 *
 * This is Kelly's working screen: the deadline is 11pm, and when a store misses
 * it Davy, Kelly and Chloe are told (Q18). Pending corrections sit at the top,
 * because they are the only thing here that needs a decision — each one says,
 * line by line, what approving it would change.
 *
 * Every filed day in the grid opens, and Kelly or Davy can change it there
 * directly: they are the ones who would approve it anyway.
 */
export function Closings() {
  const navigate = useNavigate()
  const data = useData()
  const user = useCurrentUser()
  const capability = useCan()
  const resolveCorrection = useData((s) => s.resolveCorrection)
  const push = useToasts((s) => s.push)
  const [channel, setChannel] = useState<Channel>('main')
  /** The correction being turned down, and what to tell the store. */
  const [rejecting, setRejecting] = useState<Closing | null>(null)
  const [note, setNote] = useState('')
  // Head office opens a store's day on the closing page itself.
  const openDay = (locationId: string, day: string) => navigate(`/close?store=${locationId}&day=${day}`)

  const days = useMemo(
    () => Array.from({ length: TRAIL }, (_, i) => addDays(data.today, -(TRAIL - 1 - i))),
    [data.today],
  )

  const stores = locationsInChannel(channel).filter((l) => l.status === 'open')
  const filed = (locationId: string, period: string) =>
    data.closings.find((c) => c.locationId === locationId && c.period === period)

  /**
   * The first day this store ever filed, or undefined if it never has.
   *
   * A store that has not started has not *missed* anything, and counting the
   * days before it opened as gaps to chase would bury the days that really
   * were missed. The same rule is in `selectNotFiled`, which drives the alerts.
   */
  const startedOn = (locationId: string) =>
    data.closings
      .filter((c) => c.locationId === locationId)
      .reduce<string | undefined>((first, c) => (!first || c.period < first ? c.period : first), undefined)

  const expected = (locationId: string, period: string) => {
    const start = startedOn(locationId)
    return start !== undefined && period >= start
  }

  const yesterday = addDays(data.today, -1)
  const notFiled = selectNotFiled(data, yesterday)
  const pending = data.closings.filter((c) => c.correction?.status === 'pending')

  const trading = stores.filter((s) => startedOn(s.id) !== undefined)
  const filedYesterday = stores.filter((s) => filed(s.id, yesterday)).length
  const expectedYesterday = stores.filter((s) => expected(s.id, yesterday)).length
  const revenueYesterday = stores.reduce(
    (a, s) => a + (filed(s.id, yesterday)?.revenueMYR ?? 0),
    0,
  )
  const gaps = stores.reduce(
    (a, s) => a + days.filter((d) => expected(s.id, d) && !filed(s.id, d)).length,
    0,
  )

  const decide = (closingId: string, approve: boolean, why?: string) => {
    if (!user) return
    const result = resolveCorrection({
      closingId,
      approvedBy: user.name,
      role: user.role,
      approve,
      note: why,
    })
    if (!result.ok) {
      push(result.error ?? 'That could not be decided.', 'critical')
      return
    }
    push(approve ? 'Correction approved — the closing now reads as corrected' : 'Correction turned down', approve ? 'good' : 'info')
    setRejecting(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office · Operations</p>
          <h1 className="page-title mt-1">
            Closings
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Last {TRAIL} days to {formatDate(data.today)}. A gap means nothing was filed on a day
            the store was expected to.
            {trading.length < stores.length && (
              <>
                {' '}
                <span className="text-ink-3">
                  {stores.length - trading.length} of {stores.length} have not filed anything yet.
                </span>
              </>
            )}
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
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Filed yesterday"
          value={filedYesterday}
          format={(n) => `${Math.round(n)} of ${expectedYesterday}`}
          footnote={
            expectedYesterday === 0
              ? 'no store has started yet'
              : filedYesterday === expectedYesterday
                ? 'all in'
                : `${expectedYesterday - filedYesterday} missing`
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
          footnote={
            gaps ? 'chase these stores' : trading.length === 0 ? 'nothing filed yet' : 'no gaps'
          }
          tone="cyan"
          icon="alert"
        />
      </div>

      {pending.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Needs a decision"
            title={`${pending.length} correction${pending.length === 1 ? '' : 's'} pending`}
            meta="A store has asked to change a filed day inside the three-day window. Nothing on it changes until you approve."
          />
          <Rule />
          <PanelBody className="space-y-2">
            {pending.map((c) => {
              const asked = c.correction!
              const after = asked.proposed?.revenueMYR ?? c.revenueMYR
              return (
                <div key={c.id} className="rounded-xl border border-warn/30 bg-warn/8 px-3.5 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <p className="text-[13px] text-ink">
                        {locationById(c.locationId)?.shortName} · {formatDateShort(c.period)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-2">“{asked.reason}”</p>
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {asked.requestedBy} · {formatTimestamp(asked.requestedAt)} · filed by {c.submittedBy}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="readout text-[12px] text-ink-3 line-through">
                        {rm(asked.previousRevenueMYR)}
                      </p>
                      <p className="readout text-[15px] font-semibold text-ink">{rm(after)}</p>
                    </div>
                  </div>
                  {asked.changes?.length ? (
                    <div className="mt-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">
                      <p className="eyebrow mb-1.5">Approving changes</p>
                      <ChangeList changes={asked.changes} />
                    </div>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openDay(c.locationId, c.period)}>
                      See the day
                    </Button>
                    {capability.approveCorrections ? (
                      <div className="ml-auto flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejecting(c)
                            setNote('')
                          }}
                        >
                          Turn down
                        </Button>
                        <Button size="sm" variant="primary" icon="check" onClick={() => decide(c.id, true)}>
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <Badge tone="warn" className="ml-auto">
                        Kelly decides
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
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
            <div className="scroll-x">
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
                          // Before a store's first closing there is nothing to
                          // chase: it had not started.
                          const due = expected(s.id, d)
                          const Cell = c && capability.approveCorrections ? 'button' : 'span'
                          return (
                            <td key={d} className="py-2 text-center">
                              <Cell
                                {...(Cell === 'button'
                                  ? { onClick: () => openDay(s.id, d), 'aria-label': `Open ${s.shortName}, ${formatDateShort(d)}` }
                                  : {})}
                                title={
                                  c
                                    ? `${formatDateShort(d)} · ${rm(c.revenueMYR)} · filed by ${c.submittedBy} at ${formatTimestamp(c.submittedAt)}${
                                        c.editedBy ? ` · changed by ${c.editedBy}` : ''
                                      }${capability.approveCorrections ? ' · click to open' : ''}`
                                    : due
                                      ? `${formatDateShort(d)} · nothing filed`
                                      : `${formatDateShort(d)} · before this store started`
                                }
                                className={`mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[5px] ${Cell === 'button' ? 'transition-transform hover:scale-125' : ''} ${
                                  c
                                    ? 'bg-primary/18 text-primary'
                                    : due
                                      ? 'border border-critical/40 bg-critical/10 text-critical'
                                      : 'border border-line bg-sunken text-ink-3'
                                }`}
                              >
                                {c ? (
                                  <Icon name="check" className="h-2.5 w-2.5" strokeWidth={2.6} />
                                ) : due ? (
                                  <Icon name="x" className="h-2.5 w-2.5" strokeWidth={2.6} />
                                ) : (
                                  <span className="h-1 w-1 rounded-full bg-current" />
                                )}
                              </Cell>
                            </td>
                          )
                        })}
                        <td className="py-2">
                          <Sparkline data={selectLocationSparkline(data, s.id, TRAIL)} width={72} />
                        </td>
                        <td className="py-2 text-right">
                          {y ? (
                            capability.approveCorrections ? (
                              <Link to={`/close?store=${s.id}&day=${yesterday}`} className="block hover:underline">
                                <span className="readout block text-[12.5px] text-ink">{rm(y.revenueMYR)}</span>
                                <span className="block truncate text-[10.5px] text-ink-3">{y.submittedBy}</span>
                              </Link>
                            ) : (
                              <>
                                <span className="readout block text-[12.5px] text-ink">{rm(y.revenueMYR)}</span>
                                <span className="block truncate text-[10.5px] text-ink-3">{y.submittedBy}</span>
                              </>
                            )
                          ) : expected(s.id, yesterday) ? (
                            <Badge tone="warn" icon="clock">
                              Missing
                            </Badge>
                          ) : (
                            <span className="text-[11.5px] text-ink-3">Not started</span>
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

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Turn this correction down?"
        subtitle={
          rejecting
            ? `${locationById(rejecting.locationId)?.shortName} · ${formatDateShort(rejecting.period)} · the closing stays as it was filed`
            : undefined
        }
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => rejecting && decide(rejecting.id, false, note.trim() || undefined)}
            >
              Turn it down
            </Button>
          </>
        }
      >
        <Field label="Tell the store why (optional)" hint="They see this on their closing history.">
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="The card slip total says RM 688 — please check it again."
          />
        </Field>
      </Modal>

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
