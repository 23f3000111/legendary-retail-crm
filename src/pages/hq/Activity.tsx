import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { EmptyState } from '../../components/ui/DataTable'
import { ChipToggle, SegmentedControl, Select, TextInput } from '../../components/ui/Field'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { Modal } from '../../components/ui/Modal'
import { Field } from '../../components/ui/Field'
import { isShared } from '../../api'
import {
  actionLabel,
  actionsOfKind,
  AUDIT_KIND_LABEL,
  AUDIT_KIND_TONE,
  type AuditEntry,
  type AuditKind,
} from '../../lib/audit'
import { ACCENT_GRADIENT, ROLE_LABEL, initialsOf, type Person } from '../../data/people'
import { locationName, tradingLocations } from '../../data/locations'
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
  'password',
  'login',
  'promotion',
  'target',
  'alert',
  'session',
]

type RangeKey = '1' | '7' | '30' | 'all' | 'custom'

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Dates' },
]

type Order = 'newest' | 'oldest'

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
  const clearAllData = useData((s) => s.clearAllData)
  const me = useCurrentUser()
  const push = useToasts((s) => s.push)

  // "Please clear all the current data, and we will start over again." Davy
  // and Imran can, from here, with the phrase typed out — it takes every sale,
  // closing and order from every device at once.
  const canStartOver = me?.role === 'md' || me?.role === 'it'
  const [startOver, setStartOver] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [wiping, setWiping] = useState(false)

  const [range, setRange] = useState<RangeKey>('7')
  const [from, setFrom] = useState(addDays(data.today, -6))
  const [to, setTo] = useState(data.today)
  const [kinds, setKinds] = useState<AuditKind[]>([])
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState<string>('')
  const [locationId, setLocationId] = useState('')
  const [order, setOrder] = useState<Order>('newest')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<AuditEntry | null>(null)

  // Any change to what is being looked for starts the list again from the top.
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setShown(PAGE)
  }

  const since = range === 'all' ? '' : range === 'custom' ? from : addDays(data.today, -(Number(range) - 1))
  const until = range === 'custom' ? to : ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = audit.filter((e) => {
      const day = e.at.slice(0, 10)
      if (since && day < since) return false
      if (until && day > until) return false
      if (kinds.length && !kinds.includes(e.kind)) return false
      if (action && e.action !== action) return false
      if (actorId && e.actorId !== actorId) return false
      if (locationId && e.locationId !== locationId) return false
      if (
        q &&
        !`${e.summary} ${e.detail ?? ''} ${e.actorName} ${actionLabel(e.action)} ${e.entityId ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        return false
      }
      return true
    })
    // The store keeps the log newest first; reading a sequence forward wants
    // the other way round.
    return order === 'newest' ? rows : [...rows].reverse()
  }, [audit, since, until, kinds, action, actorId, locationId, query, order])

  const toggleKind = (k: AuditKind) => {
    setShown(PAGE)
    setAction('')
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  }

  /** The actions worth offering: those in the chosen categories, or all. */
  const actionChoices = useMemo(() => {
    const kindsToUse = kinds.length ? kinds : KINDS
    const known = new Set(kindsToUse.flatMap(actionsOfKind))
    // Anything actually in the log that the label table does not know about.
    for (const e of audit) if (!kinds.length || kinds.includes(e.kind)) known.add(e.action)
    return [...known].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)))
  }, [kinds, audit])

  const clear = () => {
    setKinds([])
    setAction('')
    setActorId('')
    setLocationId('')
    setQuery('')
    setRange('7')
    setOrder('newest')
    setShown(PAGE)
  }

  const todayCount = audit.filter((e) => e.at.slice(0, 10) >= data.today).length
  const passwordCount = audit.filter((e) => e.kind === 'password').length
  const people = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of audit) if (!seen.has(e.actorId)) seen.set(e.actorId, e.actorName)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [audit])

  const userById = (id: string): Person | undefined => data.users.find((u) => u.id === id)

  const exportRows = () =>
    downloadCsv(
      'legendary-activity.csv',
      ['When', 'Who', 'Their job', 'Category', 'Action', 'Action code', 'What happened', 'Detail', 'Where', 'Touched', 'Reference'],
      filtered.map((e) => [
        e.at,
        e.actorName,
        ROLE_LABEL[e.actorRole],
        AUDIT_KIND_LABEL[e.kind],
        actionLabel(e.action),
        e.action,
        e.summary,
        e.detail ?? '',
        e.locationId ? locationName(e.locationId) : '',
        e.entityId ?? '',
        e.id,
      ]),
    )

  const filtering =
    kinds.length > 0 ||
    action !== '' ||
    actorId !== '' ||
    locationId !== '' ||
    query !== '' ||
    range !== '7' ||
    order !== 'newest'

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
          footnote={audit.length ? `since ${formatDate(audit[audit.length - 1].at.slice(0, 10))}` : 'nothing yet'}
          tone="blue"
          icon="doc"
        />
        <StatTile
          label="Password resets"
          value={passwordCount}
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
                onChange={(e) => reset(setQuery)(e.target.value)}
                placeholder="Search what happened"
                className="h-8 w-[190px] text-[12.5px]"
              />
              <SegmentedControl<RangeKey>
                size="sm"
                value={range}
                onChange={reset(setRange)}
                options={RANGES}
              />
            </div>
          }
        />
        <Rule />
        <PanelBody className="space-y-3">
          {range === 'custom' && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="From" className="w-[170px]">
                <TextInput
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => reset(setFrom)(e.target.value)}
                  className="h-9 text-[12.5px]"
                />
              </Field>
              <Field label="To" className="w-[170px]">
                <TextInput
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => reset(setTo)(e.target.value)}
                  className="h-9 text-[12.5px]"
                />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((k) => (
              <ChipToggle
                key={k}
                label={AUDIT_KIND_LABEL[k]}
                active={kinds.includes(k)}
                onClick={() => toggleKind(k)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Each in its own box: the control is full-width by design, and
                a width on the select itself loses to that. */}
            <div className="w-full sm:w-[220px]">
              <Select
                value={action}
                onChange={(e) => reset(setAction)(e.target.value)}
                className="h-8 text-[12.5px]"
                aria-label="Action"
              >
                <option value="">Any action</option>
                {actionChoices.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select
                value={actorId}
                onChange={(e) => reset(setActorId)(e.target.value)}
                className="h-8 text-[12.5px]"
                aria-label="Who"
              >
                <option value="">Anyone</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-[190px]">
              <Select
                value={locationId}
                onChange={(e) => reset(setLocationId)(e.target.value)}
                className="h-8 text-[12.5px]"
                aria-label="Where"
              >
                <option value="">Anywhere</option>
                {tradingLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.shortName}
                  </option>
                ))}
              </Select>
            </div>
            <SegmentedControl<Order>
              size="sm"
              value={order}
              onChange={reset(setOrder)}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
              ]}
            />
            {filtering && (
              <button
                onClick={clear}
                className="text-[12px] text-ink-3 transition-colors hover:text-ink"
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
          meta={
            isShared()
              ? 'Every action from every device, kept for ten years. Nothing here can be edited or removed.'
              : 'This build runs on one browser. Its log starts when the sample data was loaded.'
          }
          action={
            canStartOver ? (
              <Button
                size="sm"
                variant="danger"
                icon="alert"
                onClick={() => {
                  setPhrase('')
                  setStartOver(true)
                }}
              >
                Start over
              </Button>
            ) : undefined
          }
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
                    onOpen={() => setOpen(e)}
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
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? actionLabel(open.action) : ''}
        subtitle={open ? formatTimestamp(open.at) : undefined}
        footer={
          <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-ink">{open.summary}</p>
            {open.detail && (
              <p className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                {open.detail}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Who', `${open.actorName} · ${ROLE_LABEL[open.actorRole]}`],
                ['When', formatTimestamp(open.at)],
                ['Category', AUDIT_KIND_LABEL[open.kind]],
                ['Action', open.action],
                ['Where', open.locationId ? locationName(open.locationId) : '—'],
                ['What it touched', open.entityId ?? '—'],
                ['Reference', open.id],
              ].map(([label, value]) => {
                // Where the thing it touched is a screen, go there.
                const to =
                  label === 'What it touched' && open.entityId?.startsWith('PO-')
                    ? `/orders/${open.entityId}`
                    : label === 'Where' && open.locationId
                      ? `/stores/${open.locationId}`
                      : null
                return (
                  <div key={label} className={label === 'Reference' ? 'col-span-2' : ''}>
                    <dt className="eyebrow">{label}</dt>
                    <dd
                      className={`readout mt-1 text-[12.5px] text-ink ${
                        label === 'Reference' ? 'break-all' : 'break-words'
                      }`}
                    >
                      {to ? (
                        <Link to={to} className="text-primary hover:underline" onClick={() => setOpen(null)}>
                          {value}
                        </Link>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              The reference is unique to this line. Paste it into the search box to come straight
              back to it, or quote it when asking somebody about this action.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={startOver}
        onClose={() => setStartOver(false)}
        title="Start over"
        subtitle="Every sale, closing, order, target and promotion, on every device. Logins stay."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setStartOver(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={phrase.trim().toUpperCase() !== 'START OVER' || wiping}
              onClick={async () => {
                setWiping(true)
                const r = await clearAllData()
                setWiping(false)
                if (!r.ok) return push(r.error ?? 'That did not work.', 'critical')
                setStartOver(false)
                push('Everything has been cleared. The promoters can begin.', 'good')
              }}
            >
              Clear everything
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-2">
          This cannot be undone. It is for the moment the client asked for — clearing the trial
          so the promoters begin with nothing on record. Type <b className="text-ink">START OVER</b>{' '}
          to confirm.
        </p>
        <Field label="Confirm">
          <TextInput value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="START OVER" autoFocus />
        </Field>
      </Modal>
    </div>
  )
}

/** One line of the log. Opens the full detail when tapped. */
function Row({
  entry,
  person,
  first,
  newDay,
  onOpen,
}: {
  entry: AuditEntry
  person?: Person
  first: boolean
  newDay: boolean
  onOpen: () => void
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
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-3 border-t border-line py-2.5 text-left transition-colors hover:bg-sunken/60"
      >
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
            <span className="sm:hidden">· {formatTimestamp(entry.at)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Badge tone={AUDIT_KIND_TONE[entry.kind]}>{AUDIT_KIND_LABEL[entry.kind]}</Badge>
          <span className="readout hidden w-[124px] text-right text-[11px] text-ink-3 sm:block">
            {formatTimestamp(entry.at)}
          </span>
        </div>
      </button>
    </li>
  )
}
