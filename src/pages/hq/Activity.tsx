import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { ChipToggle, SegmentedControl, Select, TextInput } from '../../components/ui/Field'
import { useData } from '../../store/useData'
import { AUDIT_OVERLAY_LIMIT } from '../../store/useData'
import { AUDIT_HISTORY_DAYS } from '../../data/seed'
import {
  AUDIT_KIND_LABEL,
  AUDIT_KIND_TONE,
  type AuditEntry,
  type AuditKind,
} from '../../lib/audit'
import { ACCENT_GRADIENT, ROLE_LABEL, initialsOf, type Person } from '../../data/people'
import { locationName } from '../../data/locations'
import { addDays, formatDate, formatTimestamp } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num } from '../../lib/format'

/**
 * The kinds a reader is normally looking for.
 *
 * Alerts and sign-ins are on by default too — the client asked for *every*
 * action, and hiding a category by default is a quiet way of deciding for them
 * what counts. The chips are there so a busy day can be narrowed down, not so
 * that anything is left out.
 */
const KINDS: AuditKind[] = [
  'closing',
  'order',
  'sale',
  'correction',
  'pin',
  'login',
  'promotion',
  'target',
  'alert',
  'session',
]

type RangeKey = '1' | '7' | '30' | 'all'

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'Everything' },
]

const PAGE = 60

/**
 * Activity.
 *
 * Every action anyone has taken, newest first: what it was, who did it, and
 * when. Q67 said the accounting side would handle the audit trail; the client
 * has since asked for it here, which is the right call — three people can edit
 * everything, and "who changed this?" should not depend on anyone's memory.
 *
 * The screen is deliberately plain. An audit log is read when something has
 * gone wrong or somebody is being asked to account for a change, and at that
 * moment what matters is that the rows are legible and complete, not that they
 * are pretty.
 */
export function Activity() {
  const data = useData()
  const audit = useData((s) => s.audit)

  const [range, setRange] = useState<RangeKey>('7')
  const [kinds, setKinds] = useState<AuditKind[]>([])
  const [actorId, setActorId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const since = range === 'all' ? '' : addDays(data.today, -(Number(range) - 1))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return audit.filter((e) => {
      if (since && e.at.slice(0, 10) < since) return false
      if (kinds.length && !kinds.includes(e.kind)) return false
      if (actorId && e.actorId !== actorId) return false
      if (q && !`${e.summary} ${e.detail ?? ''} ${e.actorName}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [audit, since, kinds, actorId, query])

  const toggleKind = (k: AuditKind) => {
    setShown(PAGE)
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  }

  const clear = () => {
    setKinds([])
    setActorId('')
    setQuery('')
    setRange('7')
    setShown(PAGE)
  }

  // The demo's "today" is fixed, but anything done during a walkthrough carries
  // the real clock — so this counts from the demo day onward rather than on it,
  // and a change made now shows up here straight away.
  const todayCount = audit.filter((e) => e.at.slice(0, 10) >= data.today).length
  const pinCount = audit.filter((e) => e.kind === 'pin').length
  const people = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of audit) if (!seen.has(e.actorId)) seen.set(e.actorId, e.actorName)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [audit])

  const userById = (id: string): Person | undefined => data.users.find((u) => u.id === id)

  const exportRows = () =>
    downloadCsv(
      'legendary-activity.csv',
      ['When', 'Who', 'Their job', 'Category', 'Action', 'What happened', 'Detail', 'Where'],
      filtered.map((e) => [
        e.at,
        e.actorName,
        ROLE_LABEL[e.actorRole],
        AUDIT_KIND_LABEL[e.kind],
        e.action,
        e.summary,
        e.detail ?? '',
        e.locationId ? locationName(e.locationId) : '',
      ]),
    )

  const filtering = kinds.length > 0 || actorId !== '' || query !== '' || range !== '7'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">
            Activity
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Everything anyone has done, newest first — what it was, who did it, and when. Nothing
            here can be edited or deleted from inside the system.
          </p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportRows}>
          Export {filtering ? 'these' : 'all'}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Actions today"
          value={todayCount}
          format={(n) => num(Math.round(n))}
          footnote={formatDate(data.today)}
          tone="violet"
          icon="clock"
        />
        <StatTile
          label="On record"
          value={audit.length}
          format={(n) => num(Math.round(n))}
          footnote={`last ${AUDIT_HISTORY_DAYS} days`}
          tone="blue"
          icon="doc"
        />
        <StatTile
          label="PIN changes and look-ups"
          value={pinCount}
          format={(n) => num(Math.round(n))}
          footnote="every one is recorded"
          tone="cyan"
          icon="alert"
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Filter"
          title={
            filtered.length === audit.length
              ? `${num(audit.length)} entries`
              : `${num(filtered.length)} of ${num(audit.length)} entries`
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setShown(PAGE)
                }}
                placeholder="Search what happened"
                className="h-8 w-[190px] text-[12.5px]"
              />
              <Select
                value={actorId}
                onChange={(e) => {
                  setActorId(e.target.value)
                  setShown(PAGE)
                }}
                className="h-8 w-[170px] text-[12.5px]"
              >
                <option value="">Anyone</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
              <SegmentedControl<RangeKey>
                size="sm"
                value={range}
                onChange={(v) => {
                  setRange(v)
                  setShown(PAGE)
                }}
                options={RANGES}
              />
            </div>
          }
        />
        <Rule />
        <PanelBody>
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((k) => (
              <ChipToggle
                key={k}
                label={AUDIT_KIND_LABEL[k]}
                active={kinds.includes(k)}
                onClick={() => toggleKind(k)}
              />
            ))}
            {filtering && (
              <button
                onClick={clear}
                className="ml-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          eyebrow="Log"
          title="What has happened"
          meta={`This wireframe seeds the last ${AUDIT_HISTORY_DAYS} days and keeps the newest ${AUDIT_OVERLAY_LIMIT} of your own actions across a refresh. The real system keeps every row for ten years.`}
        />
        <Rule />
        <PanelBody>
          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing matches"
              body="No action fits these filters. Widen the dates, or clear them."
              action={
                filtering ? (
                  <Button variant="secondary" onClick={clear}>
                    Clear the filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ol className="space-y-0">
                {filtered.slice(0, shown).map((e, i) => (
                  <Row
                    key={e.id}
                    entry={e}
                    person={userById(e.actorId)}
                    first={i === 0}
                    newDay={i === 0 || filtered[i - 1].at.slice(0, 10) !== e.at.slice(0, 10)}
                  />
                ))}
              </ol>

              {shown < filtered.length && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                    Show {Math.min(PAGE, filtered.length - shown)} more
                  </Button>
                </div>
              )}
            </>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}

/** One line of the log. */
function Row({
  entry,
  person,
  first,
  newDay,
}: {
  entry: AuditEntry
  person?: Person
  first: boolean
  newDay: boolean
}) {
  return (
    <li>
      {newDay && (
        <p
          className={`readout ${first ? '' : 'mt-4'} mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide2 text-ink-3`}
        >
          {formatDate(entry.at.slice(0, 10))}
        </p>
      )}
      <div className="flex items-start gap-3 border-t border-line py-2.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white ${
            person ? ACCENT_GRADIENT[person.accent] : 'bg-ink-3'
          }`}
          title={entry.actorName}
        >
          {person?.initials ?? initialsOf(entry.actorName)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-ink">{entry.summary}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-3">
            <span className="text-ink-2">{entry.actorName}</span>
            <span>· {ROLE_LABEL[entry.actorRole]}</span>
            {entry.locationId && <span>· {locationName(entry.locationId)}</span>}
            {entry.detail && <span>· {entry.detail}</span>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Badge tone={AUDIT_KIND_TONE[entry.kind]}>{AUDIT_KIND_LABEL[entry.kind]}</Badge>
          <span className="readout w-[124px] text-right text-[11px] text-ink-3">
            {formatTimestamp(entry.at)}
          </span>
        </div>
      </div>
    </li>
  )
}
