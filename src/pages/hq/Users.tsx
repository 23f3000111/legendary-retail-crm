import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { Field, Select, TextInput } from '../../components/ui/Field'
import { PinDialog } from '../../components/PinDialog'
import { Icon } from '../../components/ui/icons'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useData } from '../../store/useData'
import { useToasts } from '../../components/ui/Toast'
import {
  can,
  canChangePinOf,
  canSeePinOf,
  canSeeUser,
  initialsOf,
  suggestPin,
  HOME_FOR_ROLE,
  PIN_LENGTH,
  ROLE_ACCESS,
  ROLE_LABEL,
  ACCENT_GRADIENT,
  type Person,
  type Role,
} from '../../data/people'
import { locationById, locationsInChannel } from '../../data/locations'
import { downloadCsv } from '../../lib/exportCsv'
import { num } from '../../lib/format'

const ROLES: Role[] = ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it']
const ACCENTS: Person['accent'][] = ['violet', 'blue', 'cyan', 'teal']

/**
 * A new login starts as a promoter at the first store. The store must be a real
 * id from the outset: a select whose value is `undefined` still *renders* its
 * first option, so leaving it blank shows a store that was never chosen.
 */
const blank = (defaultLocationId: string, pin: string): Person => ({
  id: '',
  name: '',
  role: 'promoter',
  title: '',
  blurb: 'Record today’s sales, count the stock, ask HQ for more.',
  initials: '',
  home: HOME_FOR_ROLE.promoter,
  accent: 'teal',
  locationId: defaultLocationId,
  pin,
  pinHistory: [],
  pinSetAt: new Date().toISOString(),
  pinSetBy: '',
  active: true,
})

/**
 * Logins.
 *
 * Creating staff sits with the Managing Director, the Operational Manager, the
 * PA and IT. Who may change or see whose PIN is narrower still, and the rules
 * live in `data/people.ts` so this screen and the store agree.
 *
 * IT's own login is hidden from everyone else, so the list you see depends on
 * who you are.
 */
export function Users() {
  const capability = useCan()
  const me = useCurrentUser()
  const allUsers = useData((s) => s.users)
  const addUser = useData((s) => s.addUser)
  const updateUser = useData((s) => s.updateUser)
  const setUserActive = useData((s) => s.setUserActive)
  const revealPin = useData((s) => s.revealPin)
  const push = useToasts((s) => s.push)

  const [editing, setEditing] = useState<Person | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pinTarget, setPinTarget] = useState<Person | null>(null)
  /** id → the PIN, once it has been asked for. Cleared when it is hidden again. */
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const mainStores = locationsInChannel('main').filter((l) => l.status === 'open')

  // IT is hidden from every other person's list.
  const users = useMemo(
    () => (me ? allUsers.filter((u) => canSeeUser(me, u)) : []),
    [allUsers, me],
  )

  const openNew = () => {
    setEditing(blank(mainStores[0]?.id ?? '', suggestPin(allUsers)))
    setIsNew(true)
    setError(null)
  }

  const openEdit = (p: Person) => {
    setEditing({
      ...p,
      locationId: p.role === 'promoter' ? (p.locationId ?? mainStores[0]?.id) : p.locationId,
    })
    setIsNew(false)
    setError(null)
  }

  const changeRole = (role: Role) => {
    if (!editing) return
    setEditing({
      ...editing,
      role,
      home: HOME_FOR_ROLE[role],
      locationId: role === 'promoter' ? (editing.locationId ?? mainStores[0]?.id) : undefined,
      title: editing.title || ROLE_LABEL[role],
    })
  }

  const save = () => {
    if (!editing || !me) return
    const name = editing.name.trim()
    if (!name) return setError('Give the person a name.')
    if (editing.role === 'promoter' && !editing.locationId) {
      return setError('A store promoter has to belong to a store.')
    }
    if (isNew) {
      if (!/^\d{6}$/.test(editing.pin)) {
        return setError(`Set a ${PIN_LENGTH}-digit PIN for them.`)
      }
      if (allUsers.some((u) => u.pin === editing.pin)) {
        return setError('Another login already uses that PIN.')
      }
    }

    const person: Person = {
      ...editing,
      name,
      initials: editing.initials.trim() || initialsOf(name),
      title: editing.title.trim() || ROLE_LABEL[editing.role],
      id: isNew
        ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36).slice(-4)}`
        : editing.id,
      pinSetBy: isNew ? me.name : editing.pinSetBy,
      placeholder: false,
    }

    if (isNew) {
      addUser(person)
      push(`${person.name} can now sign in with PIN ${person.pin}`, 'good')
    } else {
      // The PIN is never changed from this form — it has its own guarded flow.
      const { pin, pinHistory, pinSetAt, pinSetBy, ...rest } = person
      void pin, pinHistory, pinSetAt, pinSetBy
      updateUser(person.id, rest)
      push(`${person.name} updated`, 'good')
    }
    setEditing(null)
  }

  const toggleActive = (p: Person) => {
    if (p.id === me?.id) {
      push('You cannot disable your own login.', 'critical')
      return
    }
    setUserActive(p.id, !p.active)
    push(p.active ? `${p.name} can no longer sign in` : `${p.name} can sign in again`, 'info')
  }

  /**
   * Showing a PIN goes through the store rather than reading `p.pin` off the
   * row, because that is what puts a line in the activity log. Four people can
   * read fifteen PINs; each time they do, it is written down.
   */
  const toggleReveal = (p: Person) => {
    if (revealed[p.id]) {
      setRevealed(({ [p.id]: _gone, ...rest }) => rest)
      return
    }
    if (!me) return
    const result = revealPin({ actor: me, targetId: p.id })
    if (!result.ok || !result.pin) {
      push(result.error ?? 'That PIN cannot be shown.', 'critical')
      return
    }
    setRevealed((r) => ({ ...r, [p.id]: result.pin! }))
  }

  const tick = (on: boolean) =>
    on ? (
      <Icon name="check" className="mx-auto h-3.5 w-3.5 text-good" strokeWidth={2.4} />
    ) : (
      <span className="text-ink-3">—</span>
    )

  const columns: Column<Person>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (p) => (
        <div className={`flex items-center gap-2.5 ${p.active ? '' : 'opacity-55'}`}>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white ${ACCENT_GRADIENT[p.accent]}`}
          >
            {p.initials}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-tight text-ink">{p.name}</p>
            <p className="text-[11px] text-ink-3">{ROLE_LABEL[p.role]}</p>
          </div>
          {!p.active && <Badge tone="neutral">Disabled</Badge>}
          {p.hidden && <Badge tone="active">Hidden</Badge>}
          {p.placeholder && <Badge tone="warn">Name to confirm</Badge>}
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      render: (p) => (
        <div>
          <p className="text-[12px] leading-snug text-ink-2">{ROLE_ACCESS[p.role]}</p>
          <p className="text-[11px] text-ink-3">
            {p.locationId ? locationById(p.locationId)?.shortName : 'Head Office'}
          </p>
        </div>
      ),
    },
    {
      key: 'pin',
      header: 'PIN',
      width: '150px',
      render: (p) => {
        if (!me || !canSeePinOf(me, p)) {
          return <span className="text-[12px] text-ink-3">••••••</span>
        }
        const shown = revealed[p.id]
        return (
          <div className="flex items-center gap-1.5">
            <span className="readout text-[13px] font-semibold text-ink">
              {shown ?? '••••••'}
            </span>
            <button
              onClick={() => toggleReveal(p)}
              aria-label={shown ? `Hide ${p.name}'s PIN` : `Show ${p.name}'s PIN`}
              className="text-ink-3 transition-colors hover:text-primary"
            >
              <Icon name={shown ? 'eyeOff' : 'eye'} className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      },
    },
    { key: 'edit', header: 'Can edit', align: 'right', width: '80px', render: (p) => tick(can(p.role).canEdit) },
    { key: 'approve', header: 'Approves', align: 'right', width: '92px', render: (p) => tick(can(p.role).approvePurchaseOrders) },
    { key: 'catalogue', header: 'Edits products', align: 'right', width: '112px', render: (p) => tick(can(p.role).manageCatalogue) },
    { key: 'users', header: 'Adds staff', align: 'right', width: '96px', render: (p) => tick(can(p.role).manageUsers) },
    ...(capability.manageUsers || me
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '210px',
            render: (p: Person) => (
              <div className="flex justify-end gap-1">
                {me && canChangePinOf(me, p) && (
                  <Button size="sm" variant="ghost" onClick={() => setPinTarget(p)}>
                    {p.id === me.id ? 'My PIN' : 'Set PIN'}
                  </Button>
                )}
                {capability.manageUsers && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                      {p.active ? 'Disable' : 'Enable'}
                    </Button>
                  </>
                )}
              </div>
            ),
          },
        ]
      : []),
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-logins.csv',
      ['Name', 'Role', 'Access', 'Where', 'Active', 'PIN last set', 'Set by'],
      users.map((p) => [
        p.name,
        ROLE_LABEL[p.role],
        ROLE_ACCESS[p.role],
        p.locationId ? (locationById(p.locationId)?.name ?? '') : 'Head Office',
        p.active ? 'Yes' : 'No',
        p.pinSetAt.slice(0, 10),
        p.pinSetBy,
      ]),
    )

  const active = users.filter((u) => u.active)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">
            Logins
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Everyone signs in with a six-digit PIN. Davy, Kelly, Chloe and Imran can add staff;
            who may change a PIN is narrower, and the buttons below show only what you can do.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="download" onClick={exportRows}>
            Export
          </Button>
          {capability.manageUsers && (
            <Button variant="primary" icon="plus" onClick={openNew}>
              Add staff
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-[12.5px] leading-relaxed text-ink-2">
          A PIN is six digits, is never shared with another login, and is never reissued to the
          same person twice. Store promoters use the PIN they are given and cannot change it
          themselves; Finance and the Warehouse can change their own. <b className="text-ink">
          Showing a PIN is recorded</b> — who looked, whose, and when.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Active logins" value={active.length} format={(n) => num(Math.round(n))} tone="violet" icon="users" />
        <StatTile
          label="Approve changes and orders"
          value={active.filter((p) => can(p.role).approvePurchaseOrders).length}
          format={(n) => num(Math.round(n))}
          footnote="Davy and Kelly"
          tone="blue"
          icon="doc"
        />
        <StatTile
          label="View only"
          value={active.filter((p) => !can(p.role).canEdit).length}
          format={(n) => num(Math.round(n))}
          footnote="sees everything, changes nothing"
          tone="cyan"
          icon="alert"
        />
      </div>

      <Panel>
        <PanelHeader eyebrow="Access" title={`${users.length} people`} />
        <Rule />
        <PanelBody>
          <DataTable columns={columns} rows={users} rowKey={(p) => p.id} dense />
        </PanelBody>
      </Panel>

      {/* ── Add / edit ────────────────────────────────────────────────── */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? 'Add staff' : `Edit ${editing?.name}`}
        subtitle={
          isNew
            ? 'They sign in with the PIN you set here.'
            : 'Changing the role changes what they can do straight away.'
        }
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              {isNew ? 'Add staff' : 'Save changes'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Full name">
              <TextInput
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Nurul Aina"
                autoFocus
              />
            </Field>

            <Field label="Job">
              <Select value={editing.role} onChange={(e) => changeRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            {editing.role === 'promoter' && (
              <Field label="Store" hint="A promoter only ever sees their own store.">
                <Select
                  value={editing.locationId ?? ''}
                  onChange={(e) => setEditing({ ...editing, locationId: e.target.value })}
                >
                  {mainStores.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {isNew && (
              <Field
                label="Their PIN"
                hint="Six digits. Give this to them in person — they will use it to sign in."
              >
                <div className="flex gap-2">
                  <TextInput
                    value={editing.pin}
                    inputMode="numeric"
                    maxLength={PIN_LENGTH}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        pin: e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH),
                      })
                    }
                    className="readout text-[16px] tracking-[0.3em]"
                  />
                  <Button
                    variant="secondary"
                    icon="refresh"
                    onClick={() => setEditing({ ...editing, pin: suggestPin(allUsers) })}
                  >
                    New
                  </Button>
                </div>
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Initials" hint="Leave blank and we will work it out.">
                <TextInput
                  value={editing.initials}
                  onChange={(e) =>
                    setEditing({ ...editing, initials: e.target.value.toUpperCase().slice(0, 3) })
                  }
                  placeholder={initialsOf(editing.name || 'A B')}
                />
              </Field>
              <Field label="Colour">
                <Select
                  value={editing.accent}
                  onChange={(e) =>
                    setEditing({ ...editing, accent: e.target.value as Person['accent'] })
                  }
                >
                  {ACCENTS.map((a) => (
                    <option key={a} value={a}>
                      {a[0].toUpperCase() + a.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {error && (
              <p className="flex items-start gap-2 text-[12.5px] text-critical">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <p className="eyebrow mb-1.5">What this role can do</p>
              <p className="text-[12.5px] text-ink-2">{ROLE_ACCESS[editing.role]}</p>
            </div>
          </div>
        )}
      </Modal>

      <PinDialog
        open={pinTarget !== null}
        target={pinTarget}
        onClose={() => setPinTarget(null)}
      />
    </div>
  )
}
