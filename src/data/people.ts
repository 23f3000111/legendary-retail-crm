/**
 * The organisation, taken from "Legendary CRM Company Hierarchy" and the
 * username list in "CRM Revision 2".
 *
 * Access levels come straight from the chart:
 *
 *   Director (Vins Lim) ............ sees all data, cannot edit anything
 *   Managing Director (Lim Davy) ... sees and edits all, approves changes and orders
 *   PA to the MD (Chloe Chock) ..... sees and edits all
 *   Operational Manager (Kelly Tew)  sees and edits all, approves changes and orders
 *   Finance (3 people) ............. sees and edits all
 *   Warehouse (4 people) ........... stock data only
 *   Store Promoter (27 people) ..... inputs data for their own store
 *
 * Only the Managing Director and the Operational Manager approve. That is what
 * the chart says, and it is the line the rest of the system is built on:
 * approving an order, approving a closing correction and writing off stock are
 * all "approvals" and all sit with those two.
 *
 * IT (Imran) sits outside the chart. He is a technical administrator, and his
 * own login is hidden from everyone else.
 *
 * ── Signing in ──────────────────────────────────────────────────────────────
 *
 * Username and password, then a six-digit code sent to the person's e-mail.
 * This replaces the PIN keypad entirely at the client's instruction, and it is
 * a straightforwardly better arrangement: a password is stored as a one-way
 * hash, so nobody — not Davy, not IT, not somebody holding a stolen copy of the
 * database — can read it back. The uncomfortable trade-off that the old PIN
 * design carried simply goes away.
 *
 * What survives from the PIN model is the *authority table*: who may reset
 * whose credentials is exactly who could previously change whose PIN.
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
   * Deliberately narrower than "can access all data". The log records who reset
   * whose password and who changed whose login, so it goes to the people who
   * are accountable for the system rather than to everyone who can read a sales
   * figure. If the client wants Finance included, it is one line here.
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

// ── Credentials ─────────────────────────────────────────────────────────────

/** Short enough to type on a counter iPad, long enough to be worth having. */
export const PASSWORD_MIN = 10

/** How long an e-mailed sign-in code is good for. */
export const CODE_TTL_MINUTES = 10
export const CODE_LENGTH = 6

export interface Person {
  id: string
  /** Unique, lower case, no spaces. What they type to sign in. */
  username: string
  name: string
  /** Where the six-digit sign-in code is sent. */
  email: string
  role: Role
  title: string
  /** Promoters are tied to one store; everyone else is head office. */
  locationId?: string
  blurb: string
  initials: string
  home: string
  accent: 'violet' | 'blue' | 'cyan' | 'teal'
  /**
   * The password.
   *
   * Held in readable form **in this wireframe only**, because there is no
   * server to hash against and a walkthrough has to be able to sign in. The
   * production schema stores an Argon2 hash and nothing else — see
   * `docs/spec/auth.md` and `supabase/migrations/0001_schema.sql`. No screen in
   * the application ever reads this back.
   */
  password: string
  /** What they have used before. A password is never reused. */
  passwordHistory: string[]
  passwordSetAt: string
  passwordSetBy: string
  /** Set when a senior issues a password, cleared once they choose their own. */
  mustChangePassword?: boolean
  active: boolean
  /** Hidden from every other person's Logins screen. IT only. */
  hidden?: boolean
  /** Shown where something about the person is not yet confirmed. */
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

// ── Who may reset whose password ────────────────────────────────────────────
//
// The client set this out precisely for PINs, and it carries over unchanged to
// passwords — only the verb is different, because a hashed password can be
// *reset* but never *read*:
//
//   IT ................. anyone, including the Managing Director and itself
//   Managing Director .. anyone visible to him, including the Director and himself
//   Ops / PA ........... themselves, Finance, Warehouse and Store Promoters —
//                        but not each other, and not the Managing Director
//   Finance ............ themselves only
//   Warehouse .......... themselves only
//   Store Promoter ..... their own only
//   Director ........... his own only; the role cannot edit anything else

const RESET_TARGETS: Record<Role, Role[]> = {
  it: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter', 'it'],
  md: ['director', 'md', 'ops', 'pa', 'finance', 'warehouse', 'promoter'],
  ops: ['ops', 'finance', 'warehouse', 'promoter'],
  pa: ['pa', 'finance', 'warehouse', 'promoter'],
  finance: ['finance'],
  warehouse: ['warehouse'],
  promoter: ['promoter'],
  director: ['director'],
}

/** Whether `actor` may see `target` at all. IT is hidden from everyone else. */
export const canSeeUser = (actor: Person, target: Person): boolean =>
  !target.hidden || target.id === actor.id

/**
 * Whether `actor` may set `target`'s password.
 *
 * Ops and the PA may change their *own* but not each other's, which the role
 * table alone cannot express — hence the same-role guard below.
 *
 * One thing differs from the old PIN rules: **everyone can now change their
 * own**. A promoter could not change their own PIN because a senior had to be
 * able to look it up; with a hash nobody can look anything up, so the reason
 * for that restriction is gone.
 */
export const canResetPasswordOf = (actor: Person, target: Person): boolean => {
  if (!canSeeUser(actor, target)) return false
  if (!RESET_TARGETS[actor.role].includes(target.role)) return false

  // Ops and the PA reach their own role only for themselves, never a colleague.
  if ((actor.role === 'ops' || actor.role === 'pa') && actor.role === target.role) {
    return actor.id === target.id
  }
  if (
    actor.role === 'finance' ||
    actor.role === 'warehouse' ||
    actor.role === 'promoter' ||
    actor.role === 'director'
  ) {
    return actor.id === target.id
  }
  return true
}

/** Whether this person can change their own password. Everyone can. */
export const canChangeOwnPassword = (person: Person): boolean =>
  canResetPasswordOf(person, person)

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

/** Company mail (Q11). Real addresses still to be confirmed by the client. */
export const emailFor = (username: string) => `${username}@legendary.com.my`

// ── The seeded organisation ─────────────────────────────────────────────────

interface Seed {
  id: string
  username: string
  name: string
  role: Role
  title?: string
  locationId?: string
  blurb?: string
  accent?: Person['accent']
  hidden?: boolean
}

const SEEDED_AT = '2026-08-01T09:00:00+08:00'

const DEFAULT_BLURB: Record<Role, string> = {
  director: 'See everything across the group.',
  md: 'The whole group on one screen.',
  ops: 'Chase the closings, approve every order.',
  pa: 'Keep the product list and promotions right.',
  finance: 'Check what the stores reported against what we expect.',
  warehouse: 'Pick, pack and send stock out to the stores.',
  promoter: 'Record today’s sales, count the stock, ask HQ for more.',
  it: 'Set up logins and keep the system running.',
}

/**
 * Head office, from the username list in "CRM Revision 2".
 *
 * Note that Finance is now three people, not four — "Apple" is not on the
 * revised list.
 */
const headOffice: Seed[] = [
  {
    id: 'vins',
    username: 'vinslim',
    name: 'Vins Lim',
    role: 'director',
    title: 'Director & Founder',
    blurb: 'See everything across the group. I do not change anything.',
    accent: 'violet',
  },
  {
    id: 'davy',
    username: 'limdavy28',
    name: 'Lim Davy',
    role: 'md',
    title: 'Managing Director',
    blurb: 'The whole group on one screen, and whatever needs me first.',
    accent: 'violet',
  },
  {
    id: 'chloe',
    username: 'chloechock',
    name: 'Chloe Chock',
    role: 'pa',
    title: 'PA to the Managing Director',
    blurb: 'Keep the product list and promotions right, and set up new staff.',
    accent: 'cyan',
  },
  {
    id: 'kelly',
    username: 'kellytew',
    name: 'Kelly Tew',
    role: 'ops',
    title: 'Operational Manager',
    blurb: 'Chase the closings, approve every order, keep stock honest.',
    accent: 'blue',
  },

  { id: 'siew-fang', username: 'siewfang', name: 'Siew Fang', role: 'finance', accent: 'blue' },
  { id: 'ivvi', username: 'ivvichin', name: 'Ivvi Chin', role: 'finance', accent: 'blue' },
  { id: 'eunice', username: 'eunicelim', name: 'Eunice Lim', role: 'finance', accent: 'blue' },

  { id: 'an', username: 'xianan', name: 'Xi An', role: 'warehouse', accent: 'teal' },
  { id: 'loong', username: 'tianloong', name: 'Tian Loong', role: 'warehouse', accent: 'teal' },
  { id: 'low', username: 'lowchunhui', name: 'Low Chun Hui', role: 'warehouse', accent: 'teal' },
  { id: 'kim', username: 'kimlim', name: 'Kim Lim', role: 'warehouse', accent: 'teal' },

  {
    id: 'imran',
    username: 'imran',
    name: 'Imran',
    role: 'it',
    title: 'IT',
    blurb: 'Set up logins and keep the system running.',
    accent: 'cyan',
    hidden: true,
  },
]

/** How each username is written out. Every one needs checking with the client. */
const DISPLAY_NAME: Record<string, string> = {
  teokoknian: 'Teo Kok Nian',
  tanshimin: 'Tan Shi Min',
  yongsetyee: 'Yong Set Yee',
  sayzhengqiang: 'Say Zheng Qiang',
  gohmeeling: 'Goh Mee Ling',
  chweehuining: 'Chwee Hui Ning',
  lookpohlei: 'Look Poh Lei',
  tangwinnie: 'Tang Winnie',
  quahchuen: 'Quah Chuen',
  engellahii: 'Engella Hii',
  siewziching: 'Siew Zi Ching',
  ngmengxiang: 'Ng Meng Xiang',
  leekwansern: 'Lee Kwan Sern',
  limzhixuan: 'Lim Zhi Xuan',
  tanjiwei: 'Tan Ji Wei',
  eddielee: 'Eddie Lee',
  limyongkent: 'Lim Yong Kent',
  shannesslow: 'Shanness Low',
  fonghaobin: 'Fong Hao Bin',
  yapboonming: 'Yap Boon Ming',
  desmondchang: 'Desmond Chang',
  gohzixuan: 'Goh Zi Xuan',
  chanqijun: 'Chan Qi Jun',
  danzeltan: 'Danzel Tan',
  khookwoktsu: 'Khoo Kwok Tsu',
  chewyingtian: 'Chew Ying Tian',
  kokchewling: 'Kok Chew Ling',
}

/**
 * The 27 store promoters, from the same list.
 *
 * Two things to confirm with the client:
 *
 *   1. The list groups twelve people under **"KL"**, and there are three KL
 *      stores — Pavilion 5th Floor, Parkson Pavilion and KLCC Isetan. All
 *      twelve sit at Pavilion 5th Floor here, which is a placeholder rather
 *      than a decision, and the Logins screen says so against each of them.
 *   2. Display names are split out of the usernames ("teokoknian" → "Teo Kok
 *      Nian"). Word boundaries in a romanised name are a guess, so each should
 *      be checked against how the person writes it.
 */
const promoterGroups: { locationId: string; usernames: string[]; storeConfirmed: boolean }[] = [
  {
    locationId: 'klia-t2',
    usernames: ['teokoknian', 'tanshimin', 'yongsetyee', 'sayzhengqiang', 'gohmeeling', 'chweehuining'],
    storeConfirmed: true,
  },
  { locationId: 'langkawi', usernames: ['lookpohlei', 'tangwinnie', 'quahchuen'], storeConfirmed: true },
  { locationId: 'parkson-imago', usernames: ['engellahii'], storeConfirmed: true },
  { locationId: 'genting', usernames: ['siewziching', 'ngmengxiang'], storeConfirmed: true },
  {
    // "KL" in the client's list — which of the three KL stores is unconfirmed.
    locationId: 'pavilion-5',
    usernames: [
      'leekwansern', 'limzhixuan', 'tanjiwei', 'eddielee', 'limyongkent', 'shannesslow',
      'fonghaobin', 'yapboonming', 'desmondchang', 'gohzixuan', 'chanqijun', 'danzeltan',
    ],
    storeConfirmed: false,
  },
  {
    locationId: 'melaka',
    usernames: ['khookwoktsu', 'chewyingtian', 'kokchewling'],
    storeConfirmed: true,
  },
]

const unconfirmedStore = new Set(
  promoterGroups.filter((g) => !g.storeConfirmed).flatMap((g) => g.usernames),
)

const promoters: Seed[] = promoterGroups.flatMap((g) =>
  g.usernames.map((username) => ({
    id: username,
    username,
    name: DISPLAY_NAME[username] ?? username,
    role: 'promoter' as Role,
    locationId: g.locationId,
    accent: 'teal' as const,
  })),
)

/**
 * Starting passwords.
 *
 * Everyone is issued one and told to change it the first time they sign in,
 * which is what `mustChangePassword` drives. In the real system these are
 * generated once and handed over; here they are derived so a walkthrough is
 * repeatable. Note that they deliberately avoid the word "Legendary" — the
 * rules below reject it, and a starting password the system would refuse to
 * accept is a confusing thing to hand somebody.
 */
export const startingPassword = (username: string) => `Start-${username.slice(0, 5)}-26`

const toPerson = (s: Seed): Person => ({
  id: s.id,
  username: s.username,
  name: s.name,
  email: emailFor(s.username),
  role: s.role,
  title: s.title ?? ROLE_LABEL[s.role],
  locationId: s.locationId,
  blurb: s.blurb ?? DEFAULT_BLURB[s.role],
  initials: initialsOf(s.name),
  home: HOME_FOR_ROLE[s.role],
  accent: s.accent ?? 'blue',
  password: startingPassword(s.username),
  passwordHistory: [],
  passwordSetAt: SEEDED_AT,
  passwordSetBy: 'Imran',
  mustChangePassword: false,
  active: true,
  ...(s.hidden ? { hidden: true } : {}),
  ...(unconfirmedStore.has(s.username) ? { placeholder: true } : {}),
})

export const seedPeople: Person[] = [...headOffice, ...promoters].map(toPerson)

/** Static lookup for the data generator, which runs before the store exists. */
export const personById = (id: string) => seedPeople.find((p) => p.id === id)

export const personByUsername = (username: string, all: Person[] = seedPeople) =>
  all.find((p) => p.username.toLowerCase() === username.trim().toLowerCase())

/** Logins screen grouping, by role, so people added later land in the right place. */
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

// ── Password rules ──────────────────────────────────────────────────────────

/** The ones an attacker tries first, and the ones people actually pick. */
const WEAK = [
  'password', 'legendary', '12345678', 'qwerty', 'letmein', 'welcome',
  'admin', 'abc123', 'iloveyou', 'perfume',
]

export interface PasswordCheck {
  ok: boolean
  error?: string
}

/**
 * Validates a proposed password.
 *
 * Length first, because length is what actually matters, and then the three
 * rules the client's own process implies: not an obvious one, not the one they
 * are already using, and never one they have used before.
 */
export function checkPassword(password: string, target: Person): PasswordCheck {
  const value = password.trim()
  if (value.length < PASSWORD_MIN) {
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` }
  }
  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) {
    return { ok: false, error: 'Use letters and at least one number.' }
  }
  const lower = value.toLowerCase()
  if (WEAK.some((w) => lower.includes(w))) {
    return { ok: false, error: 'That is too easy to guess. Choose something else.' }
  }
  if (value === target.password) {
    return { ok: false, error: 'That is the password already in use.' }
  }
  if (target.passwordHistory.includes(value)) {
    return { ok: false, error: 'That password has been used before. Choose a new one.' }
  }
  return { ok: true }
}

/** How strong it looks, for the meter beside the box. 0–3. */
export const passwordStrength = (password: string): 0 | 1 | 2 | 3 => {
  let score = 0
  if (password.length >= PASSWORD_MIN) score++
  if (password.length >= 14) score++
  if (/[^a-z0-9]/i.test(password) && /[0-9]/.test(password)) score++
  return Math.min(3, score) as 0 | 1 | 2 | 3
}

/** A username nobody else holds, derived from a name. */
export function suggestUsername(name: string, all: Person[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
  if (!all.some((p) => p.username === base)) return base
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`
    if (!all.some((p) => p.username === candidate)) return candidate
  }
  return `${base}${Date.now().toString(36).slice(-4)}`
}

/** Something long and memorable to hand over, for the "suggest" button. */
export function suggestPassword(): string {
  const words = ['orchid', 'mahsuri', 'violet', 'kebaya', 'nyonya', 'ondeh', 'spirit', 'wish']
  const pick = () => words[Math.floor(Math.random() * words.length)]
  return `${pick()}-${pick()}-${100 + Math.floor(Math.random() * 900)}`
}

/** Masks an address for the "we sent a code to…" line. */
export const maskEmail = (email: string): string => {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}`
}

/** A six-digit sign-in code. */
export const newSignInCode = (): string =>
  String(Math.floor(Math.random() * 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
