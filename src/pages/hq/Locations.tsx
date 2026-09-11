import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Icon } from '../../components/ui/icons'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { SegmentedControl, TextInput } from '../../components/ui/Field'
import { StatTile } from '../../components/ui/StatTile'
import { ProgressBar } from '../../components/ui/Progress'
import { useData } from '../../store/useData'
import {
  emptyFilter,
  selectLocationRows,
  type LocationRow,
} from '../../store/selectors'
import { CHANNEL_PLURAL, locationsInChannel, tradingLocations, locations } from '../../data/locations'
import { addDays, monthKey, monthLabel, relativeDay } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm } from '../../lib/format'
import type { Channel } from '../../data/locations'

type View = Channel | 'all'

/**
 * The estate — all 74 places Legendary sells, in one list.
 *
 * The three channels report different things, so the table changes shape with
 * the tab rather than showing empty columns: only main stores carry a target,
 * and only consignment carries a margin.
 */
export function Locations() {
  const navigate = useNavigate()
  const data = useData()
  const [view, setView] = useState<View>('main')
  const [query, setQuery] = useState('')

  const filter = useMemo(() => emptyFilter(addDays(data.today, -29), data.today), [data.today])
  const allRows = useMemo(() => selectLocationRows(data, filter), [data, filter])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows
      .filter((r) => view === 'all' || r.channel === view)
      .filter((r) => !q || `${r.name} ${r.code} ${r.region}`.toLowerCase().includes(q))
  }, [allRows, view, query])

  const coming = locations.filter((l) => l.status === 'coming')
  const marginOf = (id: string) => locations.find((l) => l.id === id)?.marginPct

  const columns: Column<LocationRow>[] = [
    {
      key: 'name',
      header: 'Store',
      render: (r) => (
        <>
          <p className="flex items-center gap-1 text-[13px] leading-tight text-ink">
            {r.shortName}
            <Icon name="chevronRight" className="h-3 w-3 shrink-0 text-ink-3" />
          </p>
          <p className="readout text-[10.5px] text-ink-3">
            {r.code} · {r.region}
          </p>
        </>
      ),
    },
    {
      key: 'daily',
      header: 'Daily sales',
      align: 'right',
      width: '150px',
      render: (r) =>
        r.dailyPeriod === null ? (
          <span className="text-[11.5px] text-ink-3">nothing filed</span>
        ) : (
          <div>
            <span className="readout text-[13px] text-ink">{rm(r.dailyRevenue)}</span>
            <p className="readout text-[10.5px] text-ink-3">
              {relativeDay(r.dailyPeriod, data.today)}
            </p>
          </div>
        ),
    },
    {
      key: 'mtd',
      header: 'This month so far',
      align: 'right',
      width: '160px',
      render: (r) => (
        <div>
          <span className="readout text-[13px] font-semibold text-ink">{rm(r.monthToDate)}</span>
          <p className="readout text-[10.5px] text-ink-3">{monthLabel(monthKey(data.today))}</p>
        </div>
      ),
    },
    {
      key: 'units',
      header: 'Units · 30 days',
      align: 'right',
      width: '120px',
      render: (r) => <span className="readout text-[13px] text-ink-2">{num(r.units)}</span>,
    },
    ...(view === 'main'
      ? [
          {
            key: 'target',
            header: 'Target pace',
            align: 'right' as const,
            width: '150px',
            render: (r: LocationRow) =>
              r.targetPace === null ? (
                <span className="text-[11.5px] text-ink-3">—</span>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <div className="w-[86px]">
                    <ProgressBar value={r.targetPace} />
                  </div>
                  <span className="readout w-9 text-right text-[11px] text-ink-3">
                    {Math.round(r.targetPace * 100)}%
                  </span>
                </div>
              ),
          },
        ]
      : []),
    ...(view === 'consignment'
      ? [
          {
            key: 'margin',
            header: 'Margin',
            align: 'right' as const,
            width: '90px',
            render: (r: LocationRow) => (
              <span className="readout text-[12.5px] text-ink-2">
                {marginOf(r.locationId) ?? '—'}%
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'filed',
      header: 'Latest',
      align: 'right',
      width: '110px',
      render: (r) =>
        r.filedLatest ? (
          <Badge tone="good" icon="check">
            Filed
          </Badge>
        ) : (
          <Badge tone="warn" icon="clock">
            {r.cadence === 'daily' ? 'Missing' : 'Awaited'}
          </Badge>
        ),
    },
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-stores.csv',
      [
        'Store',
        'Code',
        'Channel',
        'Region',
        'Reports',
        'Daily sales MYR',
        'Day filed',
        'Month to date MYR',
        'Revenue 30d MYR',
        'Units 30d',
      ],
      rows.map((r) => [
        r.name,
        r.code,
        r.channel,
        r.region,
        r.cadence,
        r.dailyRevenue,
        r.dailyPeriod ?? '',
        r.monthToDate,
        r.revenue,
        r.units,
      ]),
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Legendary Group</p>
          <h1 className="page-title mt-1">
            Stores
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {tradingLocations.length} trading, {coming.length} opening soon.
          </p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportRows}>
          Export
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Main stores"
          value={locationsInChannel('main').length}
          format={(n) => num(Math.round(n))}
          footnote="daily · with country data"
          tone="violet"
          icon="globe"
        />
        <StatTile
          label="Dealers"
          value={locationsInChannel('dealer').length}
          format={(n) => num(Math.round(n))}
          footnote="daily · sales and products"
          tone="blue"
          icon="doc"
        />
        <StatTile
          label="Consignment"
          value={locationsInChannel('consignment').length}
          format={(n) => num(Math.round(n))}
          footnote="monthly · with margin"
          tone="cyan"
          icon="wallet"
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Estate"
          title={`${rows.length} ${view === 'all' ? 'stores' : CHANNEL_PLURAL[view].toLowerCase()}`}
          meta={
            view === 'consignment'
              ? 'Consignment partners report monthly. Margin rates are placeholders until you confirm them.'
              : view === 'dealer'
                ? 'Dealers report daily sales and products. Their towns are still to be confirmed.'
                  : undefined
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stores"
                className="h-8 w-[170px] text-[12.5px]"
              />
              <SegmentedControl<View>
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'main', label: 'Main' },
                  { value: 'dealer', label: 'Dealers' },
                  { value: 'consignment', label: 'Consignment' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
          }
        />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.locationId}
            onRowClick={(r) => navigate(`/stores/${r.locationId}`)}
            dense
            empty={
              <EmptyState
                icon="search"
                title="No stores match"
                body="Try a different channel, or clear the search box."
              />
            }
          />
        </PanelBody>
      </Panel>

      {coming.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Pipeline"
            title={`${coming.length} opening soon`}
            meta="Set up in the system, not yet trading."
          />
          <Rule />
          <PanelBody>
            <ul className="flex flex-wrap gap-2">
              {coming.map((l) => (
                <li
                  key={l.id}
                  className="rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-[12.5px] text-ink"
                >
                  {l.name}
                  <span className="ml-2 text-[11px] text-ink-3">{l.region}</span>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}
    </div>
  )
}
