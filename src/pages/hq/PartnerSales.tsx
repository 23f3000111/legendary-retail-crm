import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { NumberInput, Select } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { useData, PARTNER_KEYERS } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import {
  latestCompleteMonth,
  partnersIn,
  selectPartnerMonth,
  type PartnerChannel,
} from '../../store/selectors'
import { formatTimestamp, monthKey, monthLabel, shiftMonth } from '../../lib/dates'
import { moneyInput, rm } from '../../lib/format'
import type { CrmData } from '../../data/types'

/** The CRM went live in September 2026; nothing is keyed in before that. */
const FIRST_MONTH = '2026-09'

/**
 * Dealers' and consignment partners' sales, keyed in a month at a time.
 *
 * Partners have no logins and close no days: they report to Legendary, and
 * someone at head office types each one's monthly total here (client's fifth
 * revision, October). The overview's dealer chart and its dealer and
 * consignment rankings read these, using the latest month in which every
 * partner of that kind has a figure — so a dealer that sold nothing is keyed
 * in as 0 rather than left blank.
 *
 * Davy, Kelly, Chloe and Finance key in; the server holds the same list.
 */
export function PartnerSales() {
  const data = useData()
  const thisMonth = monthKey(data.today)

  // Last month first: that is the one being keyed in, most days.
  const months = useMemo(() => {
    const out: string[] = []
    for (let m = thisMonth; m >= FIRST_MONTH && out.length < 24; m = shiftMonth(m, -1)) out.push(m)
    return out
  }, [thisMonth])
  const [month, setMonth] = useState(() => {
    const last = shiftMonth(thisMonth, -1)
    return last >= FIRST_MONTH ? last : thisMonth
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">Dealer &amp; consignment sales</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            One figure per partner for the month. The overview shows a month once every dealer — and,
            separately, every consignment partner — has one; type 0 for a partner that sold nothing.
          </p>
        </div>
        <div className="w-[200px]">
          <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === thisMonth ? ' (this month)' : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Remounted per month, so what is typed always belongs to the month shown. */}
      <MonthForm key={month} data={data} month={month} />
    </div>
  )
}

function MonthForm({ data, month }: { data: CrmData; month: string }) {
  const user = useCurrentUser()
  const save = useData((s) => s.savePartnerSales)
  const push = useToasts((s) => s.push)
  const canKey = Boolean(user && PARTNER_KEYERS.includes(user.role))

  /** What is on record for each partner this month, keyed in at head office. */
  const recorded = useMemo(() => {
    const out = new Map<string, number>()
    for (const p of data.partnerSales) if (p.month === month) out.set(p.locationId, p.revenueMYR)
    return out
  }, [data.partnerSales, month])

  // The text in each box. Starts at what is on record; empty means none.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries([...recorded.entries()].map(([id, v]) => [id, moneyInput(v)])),
  )
  const [error, setError] = useState<string | null>(null)

  const valueOf = (id: string) => draft[id] ?? ''
  const changed = (id: string) => {
    const typed = valueOf(id).trim()
    const was = recorded.get(id)
    if (typed === '') return was !== undefined
    return was === undefined || Number(typed) !== was
  }
  const invalid = (id: string) => {
    const typed = valueOf(id).trim()
    return typed !== '' && !(Number(typed) >= 0)
  }

  const all = [...partnersIn('consignment'), ...partnersIn('dealer')]
  const pending = all.filter((l) => changed(l.id))

  const submit = () => {
    setError(null)
    const bad = pending.find((l) => invalid(l.id))
    if (bad) return setError(`${bad.shortName} needs a figure of 0 or more.`)
    const result = save({
      month,
      figures: pending.map((l) => {
        const typed = valueOf(l.id).trim()
        return { locationId: l.id, revenueMYR: typed === '' ? null : Number(typed) }
      }),
    })
    if (!result.ok) return setError(result.error ?? 'That could not be saved.')
    push(`${monthLabel(month)} saved — ${pending.length} ${pending.length === 1 ? 'figure' : 'figures'}`, 'good')
  }

  return (
    <>
      {/* Room at the end so the last dealer can scroll clear of the save bar. */}
      <div className={`grid gap-5 lg:grid-cols-2 ${canKey ? 'pb-28' : ''}`}>
        {(['consignment', 'dealer'] as PartnerChannel[]).map((channel) => (
          <ChannelPanel
            key={channel}
            data={data}
            channel={channel}
            month={month}
            canKey={canKey}
            value={valueOf}
            onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))}
            changed={changed}
            invalid={invalid}
          />
        ))}
      </div>

      {/* Pinned to the window rather than sticky: the page body clips sideways
          (index.css), which stops sticky from ever taking hold. Fifty boxes is
          a long scroll, and Save should never be at the other end of it. */}
      {canKey && (
        <div className="fixed inset-x-4 bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur sm:inset-x-6 sm:bottom-12">
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            {error ? (
              <span className="flex items-start gap-2 text-critical">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </span>
            ) : pending.length ? (
              `${pending.length} ${pending.length === 1 ? 'figure' : 'figures'} to save for ${monthLabel(month)}.`
            ) : (
              `Everything for ${monthLabel(month)} is saved.`
            )}
          </p>
          <Button variant="primary" icon="check" disabled={pending.length === 0} onClick={submit}>
            Save {monthLabel(month)}
          </Button>
        </div>
      )}
    </>
  )
}

function ChannelPanel({
  data,
  channel,
  month,
  canKey,
  value,
  onChange,
  changed,
  invalid,
}: {
  data: CrmData
  channel: PartnerChannel
  month: string
  canKey: boolean
  value: (id: string) => string
  onChange: (id: string, v: string) => void
  changed: (id: string) => boolean
  invalid: (id: string) => boolean
}) {
  const partners = partnersIn(channel)
  const rows = new Map(selectPartnerMonth(data, channel, month).map((r) => [r.locationId, r]))
  const done = partners.filter((l) => rows.get(l.id)?.has).length
  const total = [...rows.values()].reduce((a, r) => a + r.revenue, 0)
  const complete = latestCompleteMonth(data, channel) === month
  const title = channel === 'dealer' ? 'Dealers' : 'Consignment'

  return (
    <Panel className="h-fit min-w-0">
      <PanelHeader
        eyebrow={`${title} · ${monthLabel(month)}`}
        title={`${done} of ${partners.length} keyed in`}
        meta={`${rm(total)} so far.${complete ? ' This is the month the overview shows.' : ''}`}
        action={
          done === partners.length ? (
            <Badge tone="good" icon="check">
              Complete
            </Badge>
          ) : (
            <Badge tone="warn">{partners.length - done} to go</Badge>
          )
        }
      />
      <Rule />
      <PanelBody className="space-y-1.5">
        {partners.map((l) => {
          const row = rows.get(l.id)
          const isChanged = changed(l.id)
          const isInvalid = invalid(l.id)
          return (
            <div
              key={l.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                isInvalid
                  ? 'border-critical/40 bg-critical/5'
                  : isChanged
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-line bg-surface-2'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-tight text-ink">{l.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-3">
                  {isChanged
                    ? 'Not saved yet'
                    : row?.keyed
                      ? `Keyed in by ${row.keyed.enteredBy} · ${formatTimestamp(row.keyed.enteredAt)}`
                      : row?.has
                        ? `${rm(row.revenue)} from its closings`
                        : 'Nothing keyed in yet'}
                </p>
              </div>
              <div className="w-[132px] shrink-0">
                <NumberInput
                  aria-label={`${l.name}, ${monthLabel(month)} sales`}
                  prefix="RM"
                  min={0}
                  step="any"
                  className="text-right"
                  placeholder="—"
                  value={value(l.id)}
                  disabled={!canKey}
                  onChange={(e) => onChange(l.id, e.target.value)}
                />
              </div>
            </div>
          )
        })}
      </PanelBody>
    </Panel>
  )
}
