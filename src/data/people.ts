/**
 * The organisation, taken from "Legendary CRM Company Hierarchy".
 *
 * Access levels come straight from the chart:
 *
 *   Director (Vins Lim) ............ sees all data, cannot edit anything
 *   Managing Director (Lim Davy) ... sees and edits all, approves changes and orders
 *   PA to the MD (Chloe Chock) ..... sees and edits all
 *   Operational Manager (Kelly Tew)  sees and edits all, approves changes and orders
 *   Finance (4 people) ............. sees and edits all
 *   Warehouse (4 people) ........... stock data only
 *   Store Promoter ................. inputs data for their own store
 *
 * Only the Managing Director and the Operational Manager approve. That is what
 * the chart says, and it is the line the rest of the system is built on:
 * approving an order, approving a closing correction and writing off stock are
 * all "approvals" and all sit with those two.
 *
 * IT (Imran) sits outside the chart. He is a technical administrator, and his
 * own login is hidden from everyone else.
 */

export type Role =
  | 'director'
  | 'md'
  | 'ops'
  | 'pa'
  | 'finance'
  | 'warehouse'
  | 'promoter'
  | 'it'

export interface Capability {
  /** Sees every store, or only their own. */
  viewAll: boolean
  /** Read-only roles get no action anywhere. */
  canEdit: boolean
  /** Stock screens only — the warehouse team's remit. */
  stockOnly: boolean
  /** Approving an order. Managing Director and Operational Manager only. */
  approvePurchaseOrders: boolean
  /** Approving a closing correction inside the 3-day window. */
  approveCorrections: boolean
  /** Writing off testers, damages and missing stock. */
  writeOffStock: boolean
  /** Adding and editing products, and recording promotions. */
  manageCatalogue: boolean
  /** Setting monthly targets. */
  setTargets: boolean
  /** Opening the Logins screen and creating new staff. */
  manageUsers: boolean
  /**
   * Reading the activity log — every action, who did it and when.
   *
   * Deliberately narrower than "can access all data". The log records who
   * revealed whose PIN and who changed whose login, so it goes to the people
   * who are accountable for the system rather than to everyone who can read a
   * sales figure. If the client wants Finance included, it is one line here.
   */
  viewAudit: boolean
}

const capabilities: Record<Role, Capability> = {
  // Sees everything, changes nothing.
  director: {
    viewAll: true, canEdit: false, stockOnly: false,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: false, setTargets: false, manageUsers: false, viewAudit: true,
  },
  md: {
    viewAll: true, canEdit: true, stockOnly: false,
    approvePurchaseOrders: true, approveCorrections: true, writeOffStock: true,
    manageCatalogue: true, setTargets: true, manageUsers: true, viewAudit: true,
  },
  ops: {
    viewAll: true, canEdit: true, stockOnly: false,
    approvePurchaseOrders: true, approveCorrections: true, writeOffStock: true,
    manageCatalogue: true, setTargets: false, manageUsers: true, viewAudit: true,
  },
  // Edits all data, but the chart does not give the PA approval rights.
  pa: {
    viewAll: true, canEdit: true, stockOnly: false,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: true, setTargets: false, manageUsers: true, viewAudit: true,
  },
  // Edits all data. Finance clears an approved order for picking, which is a
  // step in the chain rather than an approval.
  finance: {
    viewAll: true, canEdit: true, stockOnly: false,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: false, setTargets: false, manageUsers: false, viewAudit: false,
  },
  warehouse: {
    viewAll: true, canEdit: true, stockOnly: true,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: false, setTargets: false, manageUsers: false, viewAudit: false,
  },
  promoter: {
    viewAll: false, canEdit: true, stockOnly: false,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: false, setTargets: false, manageUsers: false, viewAudit: false,
  },
  it: {
    viewAll: true, canEdit: true, stockOnly: false,
    approvePurchaseOrders: false, approveCorrections: false, writeOffStock: false,
    manageCatalogue: false, setTargets: false, manageUsers: true, viewAudit: true,
  },
}

export const ROLE_LABEL: Record<Role, string> = {
  director: 'Director (Founder)',
  md: 'Managing Director',
  ops: 'Operational Manager',
  pa: 'PA to the MD',
  finance: 'Finance Department',
  warehouse: 'Warehouse Team',
  promoter: 'Store Promoter',
  it: 'IT',
}

/** One line describing the access level, straight from the chart. */
export const ROLE_ACCESS: Record<Role, string> = {
  director: 'Can access all data, but cannot edit',
  md: 'Can access and edit all data · Approves changes and orders',
  ops: 'Can access and edit all data · Approves changes and orders',
  pa: 'Can access and edit all data',
  finance: 'Can access and edit all data',
  warehouse: 'Can access stock data',
  promoter: 'Inputs data for their own store',
  it: 'Technical administrator',
}

export const PIN_LENGTH = 6

export interface Person {
  id: string
  name: string
  role: Role
  title: string
  /** Promoters are tied to one store; everyone else is head office. */
  locationId?: string
  blurb: string
  initials: string
  home: string
  accent: 'violet' | 'blue' | 'cyan' | 'teal'
  /**
   * The six-digit sign-in PIN.
   *
   * Held in readable form because the client requires senior staff to be able
   * to look up a person's current PIN. That is a deliberate trade-off — see the
   * security note in `docs/spec/pin-security.md` — and it is why only four
   * people can see it and every look-up is recorded.
   */
  pin: string
  /** PINs this person has used before. A PIN is never reissued to them. */
  pinHistory: string[]
  pinSetAt: string
  pinSetBy: string
  active: boolean
  /** Hidden from every other person's Logins screen. IT only. */
  hidden?: boolean
  /** Shown where the person's name is not yet confirmed. */
  placeholder?: boolean
}

export const HOME_FOR_ROLE: Record<Role, string> = {
  director: '/overview',
  md: '/overview',
  ops: '/operations',
  pa: '/overview',
  finance: '/finance',
  warehouse: '/warehouse',
  promoter: '/today',
  it: '/users',
}

// ── Who may change whose PIN ────────────────────────────────────────────────
//
// The client set this out precisely, so it is expressed as a table rather than
// as scattered conditions:
//
//   IT ................. anyone, including the Managing Director and itself
//   Managing Director .. anyone visible to him, including the Director and himself
//   Ops / PA ........... themselves, Finance, Warehouse and Store Promoters —
//                        but not each other, and not the Managing Director
//   Finance ............ themselves only
//   Warehouse .......... themselves only
//   Store Promoter ..... nobody; they use the PIN they are given
//   Director ........... nobody; the role cannot edit anything

const PIN_TARGETS: Record<Role, Role[]> = {
  it: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'],
  md: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter'],
  ops: ['ops', 'finance', 'warehouse', 'promoter'],
  pa: ['pa', 'finance', 'warehouse', 'promoter'],
  finance: ['finance'],
  warehouse: ['warehouse'],
  promoter: [],
  director: [],
}

/** Whether `actor` may see `target` at all. IT is hidden from everyone else. */
export const canSeeUser = (actor: Person, target: Person): boolean =>
  !target.hidden || target.id === actor.id

/**
 * Whether `actor` may change `target`'s PIN.
 *
 * Ops and the PA may change their *own* PIN but not each other's, which the
 * role table alone cannot express — hence the same-role guard below.
 */
export const canChangePinOf = (actor: Person, target: Person): boolean => {
  if (!canSeeUser(actor, target)) return false
  if (!PIN_TARGETS[actor.role].includes(target.role)) return false

  // Ops and the PA reach their own role only for themselves, never a colleague.
  if ((actor.role === 'ops' || actor.role === 'pa') && actor.role === target.role) {
    return actor.id === target.id
  }
  // Finance and Warehouse change their own PIN only.
  if (actor.role === 'finance' || actor.role === 'warehouse') {
    return actor.id === target.id
  }
  return true
}

/**
 * Whether `actor` may read `target`'s current PIN. The client asked for this
 * to follow the same authority as changing it.
 */
export const canSeePinOf = (actor: Person, target: Person): boolean =>
  canChangePinOf(actor, target)

/** Whether this person can change their own PIN. */
export const canChangeOwnPin = (person: Person): boolean =>
  canChangePinOf(person, person)

export const can = (role: Role): Capability => capabilities[role]

/** Everyone notified when something needs attention (Q76). */
export const NOTIFY_IDS = ['davy', 'kelly', 'chloe']

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '??'

// ── The seeded organisation ─────────────────────────────────────────────────

type PersonSeed = Omit<Person, 'pinHistory' | 'pinSetAt' | 'pinSetBy' | 'active'>

const SEEDED_AT = '2026-08-01T09:00:00+08:00'

const rawPeople: PersonSeed[] = [
  {
    id: 'vins',
    name: 'Vins Lim',
    role: 'director',
    title: 'Director & Founder',
    blurb: 'See everything across the group. I do not change anything.',
    initials: 'VL',
    home: '/overview',
    accent: 'violet',
    pin: '481902',
  },
  {
    id: 'davy',
    name: 'Lim Davy',
    role: 'md',
    title: 'Managing Director',
    blurb: 'The whole group on one screen, and whatever needs me first.',
    initials: 'LD',
    home: '/overview',
    accent: 'violet',
    pin: '730514',
  },
  {
    id: 'chloe',
    name: 'Chloe Chock',
    role: 'pa',
    title: 'PA to the Managing Director',
    blurb: 'Keep the product list and promotions right, and set up new staff.',
    initials: 'CC',
    home: '/overview',
    accent: 'cyan',
    pin: '294761',
  },
  {
    id: 'kelly',
    name: 'Kelly Tew',
    role: 'ops',
    title: 'Operational Manager',
    blurb: 'Chase the closings, approve every order, keep stock honest.',
    initials: 'KT',
    home: '/operations',
    accent: 'blue',
    pin: '615238',
  },

  { id: 'siew-fang', name: 'Siew Fang', role: 'finance', title: 'Finance Department', blurb: 'Check what the stores reported against what we expect.', initials: 'SF', home: '/finance', accent: 'blue', pin: '508346' },
  { id: 'ivvi', name: 'Ivvi', role: 'finance', title: 'Finance Department', blurb: 'Check what the stores reported against what we expect.', initials: 'IV', home: '/finance', accent: 'blue', pin: '172095' },
  { id: 'eunice', name: 'Eunice', role: 'finance', title: 'Finance Department', blurb: 'Check what the stores reported against what we expect.', initials: 'EU', home: '/finance', accent: 'blue', pin: '936482' },
  { id: 'apple', name: 'Apple', role: 'finance', title: 'Finance Department', blurb: 'Check what the stores reported against what we expect.', initials: 'AP', home: '/finance', accent: 'blue', pin: '421873' },

  { id: 'an', name: 'An', role: 'warehouse', title: 'Warehouse Team', blurb: 'Pick, pack and send stock out to the stores.', initials: 'AN', home: '/warehouse', accent: 'teal', pin: '650129' },
  { id: 'loong', name: 'Loong', role: 'warehouse', title: 'Warehouse Team', blurb: 'Pick, pack and send stock out to the stores.', initials: 'LO', home: '/warehouse', accent: 'teal', pin: '385274' },
  { id: 'low', name: 'Low', role: 'warehouse', title: 'Warehouse Team', blurb: 'Pick, pack and send stock out to the stores.', initials: 'LW', home: '/warehouse', accent: 'teal', pin: '719046' },
  { id: 'kim', name: 'Kim', role: 'warehouse', title: 'Warehouse Team', blurb: 'Pick, pack and send stock out to the stores.', initials: 'KM', home: '/warehouse', accent: 'teal', pin: '042968' },

  {
    id: 'imran',
    name: 'Imran',
    role: 'it',
    title: 'IT',
    blurb: 'Set up logins and keep the system running.',
    initials: 'IM',
    home: '/users',
    accent: 'cyan',
    pin: '963517',
    hidden: true,
  },

  // Promoter names pending the staff list (Q61).
  {
    id: 'promoter-pavilion',
    name: 'Pavilion KL promoter',
    role: 'promoter',
    locationId: 'pavilion-5',
    title: 'Store Promoter · Pavilion 5th Floor',
    blurb: 'Record today’s sales, count the stock, ask HQ for more.',
    initials: 'P5',
    home: '/today',
    accent: 'teal',
    pin: '258413',
    placeholder: true,
  },
  {
    id: 'promoter-klia2',
    name: 'KLIA T2 promoter',
    role: 'promoter',
    locationId: 'klia-t2',
    title: 'Store Promoter · KLIA T2',
    blurb: 'Record today’s sales, count the stock, ask HQ for more.',
    initials: 'K2',
    home: '/today',
    accent: 'teal',
    pin: '847036',
    placeholder: true,
  },
]

export const seedPeople: Person[] = rawPeople.map((p) => ({
  ...p,
  pinHistory: [],
  pinSetAt: SEEDED_AT,
  pinSetBy: 'Imran',
  active: true,
}))

/** Static lookup for the data generator, which runs before the store exists. */
export const personById = (id: string) => seedPeople.find((p) => p.id === id)

/** Sign-in rack grouping, by role, so people added later land in the right place. */
export const PEOPLE_GROUPS: { label: string; roles: Role[] }[] = [
  { label: 'Leadership', roles: ['director', 'md', 'ops', 'pa'] },
  { label: 'Finance', roles: ['finance'] },
  { label: 'Warehouse', roles: ['warehouse'] },
  { label: 'Stores & IT', roles: ['promoter', 'it'] },
]

export const ACCENT_GRADIENT: Record<Person['accent'], string> = {
  violet: 'bg-grad-violet',
  blue: 'bg-grad-blue',
  cyan: 'bg-grad-cyan',
  teal: 'bg-grad-teal',
}

// ── PIN rules ───────────────────────────────────────────────────────────────

/** Obvious PINs anyone would guess first. */
const WEAK_PINS = new Set([
  '000000', '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999',
  '123456', '654321', '012345', '543210', '123123', '121212', '112233',
])

export interface PinCheck {
  ok: boolean
  error?: string
}

/**
 * Validates a proposed PIN against every rule the client set: six digits,
 * unique across all logins, and never one this person has used before.
 */
export function checkPin(pin: string, target: Person, allUsers: Person[]): PinCheck {
  if (!/^\d+$/.test(pin)) return { ok: false, error: 'A PIN is digits only.' }
  if (pin.length !== PIN_LENGTH) {
    return { ok: false, error: `A PIN is exactly ${PIN_LENGTH} digits.` }
  }
  if (WEAK_PINS.has(pin)) {
    return { ok: false, error: 'That PIN is too easy to guess. Choose another.' }
  }
  if (pin === target.pin) {
    return { ok: false, error: 'That is already their current PIN.' }
  }
  if (target.pinHistory.includes(pin)) {
    return { ok: false, error: 'They have used that PIN before. Choose a new one.' }
  }
  const clash = allUsers.find((u) => u.id !== target.id && u.pin === pin)
  if (clash) {
    return { ok: false, error: 'Another login already uses that PIN.' }
  }
  return { ok: true }
}

/** A six-digit PIN that is not weak and not already in use. */
export function suggestPin(allUsers: Person[]): string {
  const taken = new Set(allUsers.flatMap((u) => [u.pin, ...u.pinHistory]))
  for (let attempt = 0; attempt < 500; attempt++) {
    const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(PIN_LENGTH, '0')
    if (!WEAK_PINS.has(pin) && !taken.has(pin)) return pin
  }
  return ''
}
