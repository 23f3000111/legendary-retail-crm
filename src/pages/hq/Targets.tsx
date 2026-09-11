import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { NumberInput, SegmentedControl } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { useToasts } from '../../components/ui/Toast'
import { useCan } from '../../store/useAuth'
import { useData } from '../../store/useData'
import { emptyFilter, totalsFor } from '../../store/selectors'
import { CHANNEL_LABEL, tradingLocations, type Channel } from '../../data/locations'
import { addDays, monthKey, monthLabel, startOfMonth } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { rm, num } from '../../lib/format'

/** The month before `key`, as `YYYY-MM`. */
const previousMonth = (key: string): string => {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const lastDayOf = (key: string): string => {
  const [y, m] = key.split('-').map(Number)
  return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

interface Row {
  locationId: string
  name: string
  code: string
  channel: Channel
  /** What the target is now, or null if none has been set for this month. */
  target: number | null
  /** What this location actually took in the same month last time round. */
  lastMonth: number
  /** Sales so far this month — only meaningful when the month is the current one. */
  monthToDate: number
}

/**
 * Setting targets.
 *
 * Davy sets them (Q68). Nobody else can, so for everyone else this screen is a
 * read-out — the numbers are the same, the inputs are not there.
 *
 * The client said to ignore mid-month changes for now (Q69), so a target is a
 * single figure per location per month with no history behind it. Last month's
 * actual sits beside the box because setting a number against nothing is how
 * targets end up wrong; that was the fault in the first build of this screen's
 * data, and it is why the figure is shown rather than assumed.
 */
export function Targets() {
  const capability = useCan()
  const data = useData()
  const setTarget = useData((s) => s.setTarget)
  const push = useToasts((s) => s.push)

  const thisMonth = monthKey(data.today)
  const nextMonth = monthKey(addDays(lastDayOf(thisMonth), 1))

  const [month, setMonth] = useState<string>(thisMonth)
  const [drafts, setDrafts] = useState<Record<string, number>>({})

  const canSet = capability.setTargets

  const rows = useMemo<Row[]>(() => {
    const prev = previousMonth(month)
    const prevFrom = `${prev}-01`
    const prevTo = lastDayOf(prev)
    const mtdFrom = startOfMonth(data.today)

    return tradingLocations
      .map((l) => {
        const scoped = { ...emptyFilter(prevFrom, prevTo), locationIds: [l.id] }
        const mtd =
          month === thisMonth
            ? totalsFor(data, { ...emptyFilter(mtdFrom, data.today), locationIds: [l.id] }).revenue
            : 0
        return {
          locationId: l.id,
          name: l.shortName,
          code: l.code,
          channel: l.channel,
          target:
            data.targets.find((t) => t.locationId === l.id && t.month === month)?.amountMYR ?? null,
          lastMonth: totalsFor(data, scoped).revenue,
          monthToDate: mtd,
        }
      })
      // A target only means something where somebody is accountable for it, so
      // this is the main stores — not the dealers, who buy from us rather than
      // sell for us.
      .filter((r) => r.channel === 'main')
      .sort((a, b) => b.lastMonth - a.lastMonth)
  }, [data, month, thisMonth])

  const valueFor = (r: Row) => drafts[r.locationId] ?? r.target ?? 0
  const dirty = Object.keys(drafts).length > 0

  const saveAll = () => {
    const entries = Object.entries(drafts)
    for (const [locationId, amount] of entries) {
      setTarget(locationId, month, Math.max(0, Math.round(amount)))
    }
    setDrafts({})
    push(
      `${entries.length} ${entries.length === 1 ? 'target' : 'targets'} set for ${monthLabel(month)}`,
      'good',
    )
  }

  /** Copies last month's actual into every empty box, as a starting point. */
  const seedFromLastMonth = () => {
    const next: Record<string, number> = { ...drafts }
    for (const r of rows) {
      if (r.target === null && r.lastMonth > 0) next[r.locationId] = Math.round(r.lastMonth / 100) * 100
    }
    setDrafts(next)
    push('Last month’s takings copied in. Adjust, then save.', 'info')
  }

  const totalTarget = rows.reduce((a, r) => a + valueFor(r), 0)
  const totalLast = rows.reduce((a, r) => a + r.lastMonth, 0)
  const unset = rows.filter((r) => r.target === null && !(r.locationId in drafts)).length

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Store',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{r.name}</p>
          <p className="text-[11px] text-ink-3">{CHANNEL_LABEL[r.channel]}</p>
        </div>
      ),
    },
    {
      key: 'last',
      header: `${monthLabel(previousMonth(month))} actual`,
      align: 'right',
      width: '160px',
      render: (r) => <span className="readout text-[12.5px] text-ink-2">{rm(r.lastMonth)}</span>,
    },
    ...(month === thisMonth
      ? [
          {
            key: 'mtd',
            header: 'So far this month',
            align: 'right' as const,
            width: '150px',
            render: (r: Row) => (
              <span className="readout text-[12.5px] text-ink-2">{rm(r.monthToDate)}</span>
            ),
          },
        ]
      : []),
    {
      key: 'target',
      header: 'Target',
      align: 'right',
      width: canSet ? '190px' : '150px',
      render: (r) =>
        canSet ? (
          <div className="flex justify-end">
            <NumberInput
              prefix="RM"
              value={valueFor(r) || ''}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [r.locationId]: Number(e.target.value) || 0 }))
              }
              className="h-8 w-[150px] text-right text-[12.5px]"
            />
          </div>
        ) : r.target === null ? (
          <span className="text-[12.5px] text-ink-3">Not set</span>
        ) : (
          <span className="readout text-[13px] font-semibold text-ink">{rm(r.target)}</span>
        ),
    },
    {
      key: 'vs',
      header: 'vs last month',
      align: 'right',
      width: '130px',
      render: (r) => {
        const target = valueFor(r)
        if (!target || !r.lastMonth) return <span className="text-[12px] text-ink-3">—</span>
        const pct = ((target - r.lastMonth) / r.lastMonth) * 100
        const tone = pct > 25 ? 'warn' : pct < -10 ? 'neutral' : 'good'
        return (
          <Badge tone={tone}>
            {pct >= 0 ? '+' : ''}
            {pct.toFixed(0)}%
          </Badge>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">
            Targets
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            {canSet
              ? 'One figure per store per month. Last month’s takings sit beside each box so the number is set against something real.'
              : 'Targets are set by Davy. This is what they are.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl<string>
            size="sm"
            value={month}
            onChange={(m) => {
              setMonth(m)
              setDrafts({})
            }}
            options={[
              { value: previousMonth(thisMonth), label: monthLabel(previousMonth(thisMonth)) },
              { value: thisMonth, label: monthLabel(thisMonth) },
              { value: nextMonth, label: monthLabel(nextMonth) },
            ]}
          />
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              downloadCsv(
                `legendary-targets-${month}.csv`,
                ['Store', 'Channel', 'Month', 'Target RM', `${monthLabel(previousMonth(month))} actual RM`],
                rows.map((r) => [r.name, CHANNEL_LABEL[r.channel], month, valueFor(r), r.lastMonth]),
              )
            }
          >
            Export
          </Button>
          {canSet && (
            <Button variant="secondary" icon="refresh" onClick={seedFromLastMonth}>
              Copy last month
            </Button>
          )}
          {canSet && (
            <Button variant="primary" icon="check" onClick={saveAll} disabled={!dirty}>
              Save targets
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={`${monthLabel(month)} target`}
          value={totalTarget}
          format={rm}
          footnote={`${rows.length} stores`}
          tone="violet"
          icon="trophy"
        />
        <StatTile
          label={`${monthLabel(previousMonth(month))} actual`}
          value={totalLast}
          format={rm}
          footnote="what they really took"
          tone="blue"
          icon="chart"
        />
        <StatTile
          label="Without a target"
          value={unset}
          format={(n) => num(Math.round(n))}
          footnote={unset === 0 ? 'every store covered' : 'no figure set yet'}
          tone={unset === 0 ? 'teal' : 'cyan'}
          icon="alert"
        />
      </div>

      {dirty && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/6 px-4 py-3">
          <Icon name="alert" className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 text-[12.5px] text-ink-2">
            {Object.keys(drafts).length}{' '}
            {Object.keys(drafts).length === 1 ? 'target has' : 'targets have'} been changed and not
            saved.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setDrafts({})}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={saveAll}>
            Save
          </Button>
        </div>
      )}

      <Panel>
        <PanelHeader
          eyebrow={monthLabel(month)}
          title="Where the targets sit"
          meta="Dealers are left out — they buy from Legendary rather than sell on its behalf, so a sales target does not belong to them."
        />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.locationId}
            dense
            empty={<EmptyState icon="trophy" title="No stores" body="Nothing to target yet." />}
          />
        </PanelBody>
      </Panel>
    </div>
  )
}
