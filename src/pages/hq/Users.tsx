import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { Field, Select, TextInput } from '../../components/ui/Field'
import { PasswordDialog } from '../../components/PasswordDialog'
import { Icon } from '../../components/ui/icons'
import { useCan, useCurrentUser } from '../../store/useAuth'
import { useData } from '../../store/useData'
import { useToasts } from '../../components/ui/Toast'
import {
  can,
  canResetPasswordOf,
  canSeeUser,
  emailFor,
  initialsOf,
  suggestPassword,
  suggestUsername,
  HOME_FOR_ROLE,
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
const blank = (defaultLocationId: string): Person => ({
  id: '',
  username: '',
  name: '',
  email: '',
  role: 'promoter',
  title: '',
  blurb: 'Record today’s sales, count the stock, ask HQ for more.',
  initials: '',
  home: HOME_FOR_ROLE.promoter,
  accent: 'teal',
  locationId: defaultLocationId,
  password: '',
  passwordHistory: [],
  passwordSetAt: new Date().toISOString(),
  passwordSetBy: '',
  mustChangePassword: true,
  active: true,
})

/**
 * Logins.
 *
 * Creating staff sits with the Managing Director, the Operational Manager, the
 * PA and IT. Who may reset whose password is narrower still, and the rules live
 * in `data/people.ts` so this screen and the store agree.
 *
 * There is no column showing a password and no way to reveal one. They are
 * stored so that they cannot be read back — by anyone, including the four
 * people on this screen — which is the point of the arrangement.
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
  const push = useToasts((s) => s.push)

  const [editing, setEditing] = useState<Person | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [firstPassword, setFirstPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<Person | null>(null)

  const mainStores = locationsInChannel('main').filter((l) => l.status === 'open')

  // IT is hidden from every other person's list.
  const users = useMemo(
    () => (me ? allUsers.filter((u) => canSeeUser(me, u)) : []),
    [allUsers, me],
  )

  const openNew = () => {
    setEditing(blank(mainStores[0]?.id ?? ''))
    setFirstPassword(suggestPassword())
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

    const username = (editing.username || suggestUsername(name, allUsers)).trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      return setError('A username is at least three characters, letters and numbers.')
    }
    if (allUsers.some((u) => u.username === username && u.id !== editing.id)) {
      return setError('Somebody already has that username.')
    }
    if (editing.role === 'promoter' && !editing.locationId) {
      return setError('A store promoter has to belong to a store.')
    }
    if (isNew && firstPassword.trim().length < 10) {
      return setError('Set a starting password of at least 10 characters.')
    }

    const person: Person = {
      ...editing,
      name,
      username,
      email: editing.email.trim() || emailFor(username),
      initials: editing.initials.trim() || initialsOf(name),
      title: editing.title.trim() || ROLE_LABEL[editing.role],
      id: isNew ? username : editing.id,
      password: isNew ? firstPassword.trim() : editing.password,
      passwordSetBy: isNew ? me.name : editing.passwordSetBy,
      mustChangePassword: isNew ? true : editing.mustChangePassword,
      placeholder: false,
    }

    if (isNew) {
      addUser(person)
      push(`${person.name} can sign in as ${person.username}`, 'good')
    } else {
      // The password is never changed from this form — it has its own flow.
      const { password, passwordHistory, passwordSetAt, passwordSetBy, ...rest } = person
      void password, passwordHistory, passwordSetAt, passwordSetBy
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
            <p className="readout text-[11px] text-ink-3">{p.username}</p>
          </div>
          {!p.active && <Badge tone="neutral">Disabled</Badge>}
          {p.hidden && <Badge tone="active">Hidden</Badge>}
          {p.placeholder && <Badge tone="warn">Store to confirm</Badge>}
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
      key: 'password',
      header: 'Password',
      width: '150px',
      render: (p) => (
        <div>
          <p className="text-[12px] text-ink-2">
            {p.mustChangePassword ? 'Not yet chosen' : 'Set by ' + p.passwordSetBy}
          </p>
          <p className="readout text-[10.5px] text-ink-3">{p.passwordSetAt.slice(0, 10)}</p>
        </div>
      ),
    },
    { key: 'edit', header: 'Can edit', align: 'right', width: '80px', render: (p) => tick(can(p.role).canEdit) },
    { key: 'approve', header: 'Approves', align: 'right', width: '92px', render: (p) => tick(can(p.role).approvePurchaseOrders) },
    { key: 'users', header: 'Adds staff', align: 'right', width: '96px', render: (p) => tick(can(p.role).manageUsers) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '230px',
      render: (p: Person) => (
        <div className="flex justify-end gap-1">
          {me && canResetPasswordOf(me, p) && (
            <Button size="sm" variant="ghost" onClick={() => setPasswordTarget(p)}>
              {p.id === me.id ? 'My password' : 'Reset'}
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

  const exportRows = () =>
    downloadCsv(
      'legendary-logins.csv',
      ['Name', 'Username', 'E-mail', 'Role', 'Access', 'Where', 'Active', 'Password set', 'Set by'],
      users.map((p) => [
        p.name,
        p.username,
        p.email,
        ROLE_LABEL[p.role],
        ROLE_ACCESS[p.role],
        p.locationId ? (locationById(p.locationId)?.name ?? '') : 'Head Office',
        p.active ? 'Yes' : 'No',
        p.passwordSetAt.slice(0, 10),
        p.passwordSetBy,
      ]),
    )

  const active = users.filter((u) => u.active)
  const awaiting = active.filter((u) => u.mustChangePassword).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">Logins</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Everyone signs in with a username and password, then a six-digit code sent to their
            work e-mail. Davy, Kelly, Chloe and Imran can add staff.
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
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-[12.5px] leading-relaxed text-ink-2">
          <b className="text-ink">No password can be looked up here, by anyone.</b> They are
          stored so that they cannot be read back — not by Davy, not by IT, and not by somebody
          holding a copy of the database. If a person forgets theirs, set them a new one.
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
          label="Yet to choose a password"
          value={awaiting}
          format={(n) => num(Math.round(n))}
          footnote={awaiting === 0 ? 'everybody has' : 'still on the one they were given'}
          tone={awaiting === 0 ? 'teal' : 'cyan'}
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
            ? 'They sign in with the username and starting password you set here.'
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
                onChange={(e) => {
                  const name = e.target.value
                  setEditing({
                    ...editing,
                    name,
                    username:
                      isNew && !editing.username ? '' : editing.username,
                  })
                }}
                placeholder="Nurul Aina"
                autoFocus
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Username" hint="Leave blank and we will make one.">
                <TextInput
                  value={editing.username}
                  onChange={(e) =>
                    setEditing({ ...editing, username: e.target.value.toLowerCase() })
                  }
                  placeholder={editing.name ? suggestUsername(editing.name, allUsers) : 'nurulaina'}
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Work e-mail" hint="Where their sign-in code goes.">
                <TextInput
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder={emailFor(editing.username || 'nurulaina')}
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </Field>
            </div>

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
                label="Starting password"
                hint="Hand this over in person. They will be asked to choose their own."
              >
                <div className="flex gap-2">
                  <TextInput
                    value={firstPassword}
                    onChange={(e) => setFirstPassword(e.target.value)}
                    className="readout"
                  />
                  <Button
                    variant="secondary"
                    icon="refresh"
                    onClick={() => setFirstPassword(suggestPassword())}
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

      <PasswordDialog
        open={passwordTarget !== null}
        target={passwordTarget}
        onClose={() => setPasswordTarget(null)}
      />
    </div>
  )
}
