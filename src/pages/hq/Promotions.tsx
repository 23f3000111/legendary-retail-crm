import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, EmptyState, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { ChipToggle, Field, SegmentedControl, Select, TextArea, TextInput } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { useToasts } from '../../components/ui/Toast'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useData } from '../../store/useData'
import {
  MECHANIC_LABEL,
  PROMOTION_STATE_LABEL,
  promotionState,
  type Promotion,
  type PromotionMechanic,
  type PromotionState,
} from '../../data/promotions'
import { CHANNEL_PLURAL, locations, locationById, type Channel } from '../../data/locations'
import { addDays, formatDate } from '../../lib/dates'
import { downloadCsv } from '../../lib/exportCsv'
import { num } from '../../lib/format'

const MECHANICS: PromotionMechanic[] = ['discount', 'bundle', 'gift', 'member', 'other']
const CHANNELS: Channel[] = ['main', 'dealer', 'consignment', 'online']

const STATE_TONE: Record<PromotionState, 'good' | 'active' | 'neutral'> = {
  running: 'good',
  planned: 'active',
  finished: 'neutral',
}

const blank = (today: string, recordedBy: string): Promotion => ({
  id: '',
  name: '',
  mechanic: 'discount',
  detail: '',
  from: today,
  to: addDays(today, 6),
  skuIds: [],
  locationIds: [],
  plannedBy: 'Lim Davy',
  recordedBy,
  recordedAt: new Date().toISOString(),
  informedIt: false,
})

/**
 * Promotions.
 *
 * The client's own process is three steps — *"Davy plan in advance, Chloe
 * record in system, and inform Imran"* (Q59) — so the screen is built around
 * those three and chases the last one, which is the step most easily forgotten.
 *
 * Nothing here changes a revenue figure. The client records only revenue (Q58)
 * and does not want the system minding what each shop charges (Q60), so a
 * promotion is context sitting beside the numbers, not arithmetic applied to
 * them.
 */
export function Promotions() {
  const capability = useCan()
  const me = useCurrentUser()
  const today = useData((s) => s.today)
  const promotions = useData((s) => s.promotions)
  const addPromotion = useData((s) => s.addPromotion)
  const updatePromotion = useData((s) => s.updatePromotion)
  const push = useToasts((s) => s.push)

  const [view, setView] = useState<PromotionState | 'all'>('all')
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = capability.manageCatalogue

  const rows = useMemo(() => {
    const withState = promotions.map((p) => ({ ...p, state: promotionState(p, today) }))
    return withState
      .filter((p) => view === 'all' || p.state === view)
      .sort((a, b) => (a.from > b.from ? -1 : 1))
  }, [promotions, today, view])

  const running = promotions.filter((p) => promotionState(p, today) === 'running')
  const planned = promotions.filter((p) => promotionState(p, today) === 'planned')
  const awaitingIt = promotions.filter(
    (p) => !p.informedIt && promotionState(p, today) !== 'finished',
  )

  const openNew = () => {
    setEditing(blank(today, me?.name ?? ''))
    setIsNew(true)
    setError(null)
  }

  const openEdit = (p: Promotion) => {
    setEditing(p)
    setIsNew(false)
    setError(null)
  }

  const toggleLocation = (id: string) => {
    if (!editing) return
    const has = editing.locationIds.includes(id)
    setEditing({
      ...editing,
      locationIds: has
        ? editing.locationIds.filter((l) => l !== id)
        : [...editing.locationIds, id],
    })
  }

  const pickChannel = (channel: Channel) => {
    if (!editing) return
    const ids = locations.filter((l) => l.channel === channel && l.status === 'open').map((l) => l.id)
    const all = ids.every((id) => editing.locationIds.includes(id))
    setEditing({
      ...editing,
      locationIds: all
        ? editing.locationIds.filter((id) => !ids.includes(id))
        : [...new Set([...editing.locationIds, ...ids])],
    })
  }

  const save = () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) return setError('Give the promotion a name.')
    if (!editing.detail.trim()) return setError('Say what the customer actually gets.')
    if (editing.to < editing.from) return setError('The end date is before the start date.')

    const promotion: Promotion = {
      ...editing,
      name,
      detail: editing.detail.trim(),
      notes: editing.notes?.trim() || undefined,
      id: isNew
        ? `promo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36).slice(-4)}`
        : editing.id,
      recordedBy: isNew ? (me?.name ?? editing.recordedBy) : editing.recordedBy,
      recordedAt: isNew ? new Date().toISOString() : editing.recordedAt,
    }

    if (isNew) {
      addPromotion(promotion)
      push(`${promotion.name} recorded`, 'good')
    } else {
      updatePromotion(promotion.id, promotion)
      push(`${promotion.name} updated`, 'good')
    }
    setEditing(null)
  }

  const markInformed = (p: Promotion) => {
    updatePromotion(p.id, { informedIt: true })
    push(`Imran marked as told about ${p.name}`, 'good')
  }

  const where = (p: Promotion): string => {
    if (p.locationIds.length === 0) return 'Everywhere'
    const channels = [...new Set(p.locationIds.map((id) => locationById(id)?.channel))]
    if (channels.length === 1 && channels[0]) {
      const all = locations.filter((l) => l.channel === channels[0] && l.status === 'open')
      if (all.every((l) => p.locationIds.includes(l.id))) return `All ${CHANNEL_PLURAL[channels[0]].toLowerCase()}`
    }
    if (p.locationIds.length <= 2) {
      return p.locationIds.map((id) => locationById(id)?.shortName ?? id).join(', ')
    }
    return `${p.locationIds.length} places`
  }

  type Row = Promotion & { state: PromotionState }

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Promotion',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight text-ink">{p.name}</p>
          <p className="truncate text-[11.5px] text-ink-3">{p.detail}</p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: '116px',
      render: (p) => <Badge tone={STATE_TONE[p.state]}>{PROMOTION_STATE_LABEL[p.state]}</Badge>,
    },
    {
      key: 'when',
      header: 'When',
      width: '190px',
      render: (p) => (
        <span className="readout text-[12px] text-ink-2">
          {formatDate(p.from)} → {formatDate(p.to)}
        </span>
      ),
    },
    { key: 'mech', header: 'Type', width: '150px', render: (p) => <span className="text-[12.5px] text-ink-2">{MECHANIC_LABEL[p.mechanic]}</span> },
    { key: 'where', header: 'Where', width: '150px', render: (p) => <span className="text-[12.5px] text-ink-2">{where(p)}</span> },
    {
      key: 'it',
      header: 'IT told',
      align: 'right',
      width: '120px',
      render: (p) =>
        p.informedIt ? (
          <Icon name="check" className="ml-auto h-3.5 w-3.5 text-good" strokeWidth={2.4} />
        ) : canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => markInformed(p)}>
            Mark told
          </Button>
        ) : (
          <Badge tone="warn">Not yet</Badge>
        ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '70px',
            render: (p: Row) => (
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-promotions.csv',
      ['Promotion', 'Type', 'What the customer gets', 'From', 'To', 'Where', 'Planned by', 'Recorded by', 'IT told'],
      rows.map((p) => [
        p.name,
        MECHANIC_LABEL[p.mechanic],
        p.detail,
        p.from,
        p.to,
        where(p),
        p.plannedBy,
        p.recordedBy,
        p.informedIt ? 'Yes' : 'No',
      ]),
    )

  const mainStores = locations.filter((l) => l.status === 'open')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">
            Promotions
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Davy plans them, Chloe records them here, and Imran is told. Recording a promotion
            does not change any figure — it puts the reason for an unusual week next to the week
            itself.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="download" onClick={exportRows}>
            Export
          </Button>
          {canEdit && (
            <Button variant="primary" icon="plus" onClick={openNew}>
              Record a promotion
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Running today"
          value={running.length}
          format={(n) => num(Math.round(n))}
          footnote={formatDate(today)}
          tone="violet"
          icon="sparkle"
        />
        <StatTile
          label="Planned"
          value={planned.length}
          format={(n) => num(Math.round(n))}
          footnote="starting later"
          tone="blue"
          icon="clock"
        />
        <StatTile
          label="Imran not told yet"
          value={awaitingIt.length}
          format={(n) => num(Math.round(n))}
          footnote={awaitingIt.length === 0 ? 'all clear' : 'last step of the process'}
          tone={awaitingIt.length === 0 ? 'teal' : 'cyan'}
          icon="alert"
        />
      </div>

      {awaitingIt.length > 0 && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-ink-2">
            {awaitingIt.length === 1 ? 'One promotion has' : `${awaitingIt.length} promotions have`}{' '}
            not been passed to Imran yet: {awaitingIt.map((p) => p.name).join(', ')}.
          </p>
        </div>
      )}

      <Panel>
        <PanelHeader
          eyebrow="Calendar"
          title={`${rows.length} ${rows.length === 1 ? 'promotion' : 'promotions'}`}
          action={
            <SegmentedControl<PromotionState | 'all'>
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: 'All' },
                { value: 'running', label: 'Running' },
                { value: 'planned', label: 'Planned' },
                { value: 'finished', label: 'Finished' },
              ]}
            />
          }
        />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            dense
            empty={
              <EmptyState
                icon="sparkle"
                title="Nothing here"
                body="No promotion matches this filter. Try All, or record the next campaign."
              />
            }
          />
        </PanelBody>
      </Panel>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? 'Record a promotion' : `Edit ${editing?.name}`}
        subtitle="Dates are inclusive. Leave the places empty to mean everywhere it is sold."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              {isNew ? 'Record it' : 'Save changes'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <TextInput
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Merdeka weekend"
                  autoFocus
                />
              </Field>
              <Field label="Type">
                <Select
                  value={editing.mechanic}
                  onChange={(e) =>
                    setEditing({ ...editing, mechanic: e.target.value as PromotionMechanic })
                  }
                >
                  {MECHANICS.map((m) => (
                    <option key={m} value={m}>
                      {MECHANIC_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="What the customer gets" hint="In the words your staff would use.">
              <TextInput
                value={editing.detail}
                onChange={(e) => setEditing({ ...editing, detail: e.target.value })}
                placeholder="15% off the Oud collection"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First day">
                <TextInput
                  type="date"
                  value={editing.from}
                  onChange={(e) => setEditing({ ...editing, from: e.target.value })}
                />
              </Field>
              <Field label="Last day">
                <TextInput
                  type="date"
                  value={editing.to}
                  onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Where it runs"
              hint={
                editing.locationIds.length === 0
                  ? 'Nothing picked — this counts as everywhere.'
                  : `${editing.locationIds.length} picked.`
              }
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((c) => (
                    <ChipToggle
                      key={c}
                      label={`All ${CHANNEL_PLURAL[c].toLowerCase()}`}
                      active={locations
                        .filter((l) => l.channel === c && l.status === 'open')
                        .every((l) => editing.locationIds.includes(l.id))}
                      onClick={() => pickChannel(c)}
                    />
                  ))}
                  {editing.locationIds.length > 0 && (
                    <ChipToggle
                      label="Clear"
                      active={false}
                      onClick={() => setEditing({ ...editing, locationIds: [] })}
                    />
                  )}
                </div>
                <div className="max-h-[168px] overflow-y-auto rounded-xl border border-line bg-surface-2 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {mainStores.map((l) => (
                      <ChipToggle
                        key={l.id}
                        label={l.shortName}
                        active={editing.locationIds.includes(l.id)}
                        onClick={() => toggleLocation(l.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Planned by">
                <TextInput
                  value={editing.plannedBy}
                  onChange={(e) => setEditing({ ...editing, plannedBy: e.target.value })}
                />
              </Field>
              <Field label="Imran told?" hint="The last step of the process.">
                <SegmentedControl<'yes' | 'no'>
                  value={editing.informedIt ? 'yes' : 'no'}
                  onChange={(v) => setEditing({ ...editing, informedIt: v === 'yes' })}
                  options={[
                    { value: 'no', label: 'Not yet' },
                    { value: 'yes', label: 'Told' },
                  ]}
                />
              </Field>
            </div>

            <Field label="Notes" hint="Anything the shops need to know. Optional.">
              <TextArea
                value={editing.notes ?? ''}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Malls only. Airports run the building owner’s own campaign."
              />
            </Field>

            {error && (
              <p className="flex items-start gap-2 text-[12.5px] text-critical">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
