/**
 * Demonstration history, generated deterministically.
 *
 * The four channels are simulated differently because they genuinely behave
 * differently: main stores trade daily and record the buyer's nationality
 * against every line; dealers trade daily without nationality; consignment
 * partners report once a month and hold no counted stock; online storefronts
 * trade daily and are picked from the warehouse, so they have no shelf to count
 * and never raise a top-up.
 *
 * Every run produces byte-identical data, so a walkthrough on Tuesday matches
 * the one on Friday.
 */
import { locations, tradingLocations, type Location } from './locations'
import { countedSkus, sellableSkus, skuById, priceOf } from './products'
import { countries } from './countries'
import { seedPeople as people, seedPeople } from './people'
import { seedPromotions } from './promotions'
import { addDays, dateRange, daysBetween, formatDate, isWeekend, monthKey } from '../lib/dates'
import { rm } from '../lib/format'
import { newestFirst, type AuditEntry } from '../lib/audit'
import { ROLE_LABEL } from './people'
import { locationName } from './locations'
import type {
  Alert,
  Closing,
  CrmData,
  DateStr,
  PoEvent,
  PoStatus,
  PurchaseOrder,
  SaleLine,
  StockCount,
  Target,
  WriteOff,
} from './types'

/** The demo's fixed "today". */
export const DEMO_TODAY: DateStr = '2026-08-21'
const HISTORY_DAYS = 90
/** Consignment partners report monthly; we seed this many closed months. */
const HISTORY_MONTHS = 3

/**
 * How far back the seeded activity log goes.
 *
 * The full 90 days would be about six thousand rows, which is more than a
 * walkthrough needs and slower to generate. The real system keeps everything
 * for ten years (Q88); this is a demo-data limit and nothing else. The Activity
 * screen says so on the page rather than letting anyone assume the log is
 * short by design.
 */
export const AUDIT_HISTORY_DAYS = 30

export const SEED_VALUE = 0x1e6e_11a7

/** mulberry32 — small, fast, identical across engines. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const jitter = (r: () => number, spread: number) => 1 + (r() - 0.5) * spread
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]
const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** Malaysian retail calendar, roughly. */
function seasonFactor(date: DateStr): number {
  const md = date.slice(5)
  if (md >= '02-14' && md <= '02-24') return 1.34 // Chinese New Year travel
  if (md >= '03-20' && md <= '03-29') return 0.88 // Ramadan lull
  if (md >= '03-30' && md <= '04-06') return 1.28 // Raya gifting
  if (md >= '06-01' && md <= '06-20') return 1.08 // school holidays
  if (md >= '12-18' && md <= '12-31') return 1.4 // year end
  return 1
}

/** The house is growing, so period-on-period deltas are not decided by season alone. */
const DAILY_GROWTH = 0.0035

function dayFactor(date: DateStr, dayIndex: number, r: () => number): number {
  const weekend = isWeekend(date) ? 1.32 : 1
  return weekend * seasonFactor(date) * Math.pow(1 + DAILY_GROWTH, dayIndex) * jitter(r, 0.26)
}

/**
 * Splits a day's units across nationalities for a main store. Returns one sale
 * line per SKU per country, which is what "exactly which nationality bought
 * which perfume" means in practice.
 */
function linesWithCountries(
  soldBySku: Map<string, number>,
  profile: string[],
  r: () => number,
): SaleLine[] {
  const tail = countries.map((c) => c.code).filter((c) => !profile.includes(c))
  const lines: SaleLine[] = []

  for (const [skuId, qty] of soldBySku) {
    if (qty <= 0) continue
    // Weight the outlet's regulars, with an occasional walk-in from elsewhere.
    const pool: string[] = []
    profile.forEach((code, i) => {
      const weight = Math.max(1, Math.round((profile.length - i) * 2.4 * jitter(r, 0.5)))
      for (let n = 0; n < weight; n++) pool.push(code)
    })
    for (let i = 0; i < 3; i++) pool.push(pick(r, tail))

    const perCountry = new Map<string, number>()
    for (let unit = 0; unit < qty; unit++) {
      const code = pick(r, pool)
      perCountry.set(code, (perCountry.get(code) ?? 0) + 1)
    }
    for (const [countryCode, n] of perCountry) lines.push({ skuId, qty: n, countryCode })
  }

  return lines
}

interface PendingDelivery {
  locationId: string
  date: DateStr
  lines: { skuId: string; qty: number }[]
}

const IN_FLIGHT_WINDOW = 9

/** Statuses dealt to in-flight orders, newest least progressed. */
const IN_FLIGHT_LADDER: PoStatus[] = [
  'submitted',
  'submitted',
  'approved',
  'accounts_cleared',
  'packed',
  'in_transit',
  'rejected',
  'approved',
]

interface PoInput {
  id: string
  locationId: string
  date: DateStr
  lines: { skuId: string; qtyRequested: number; qtyApproved: number | null; qtyShipped: number | null }[]
  urgent: boolean
  createdBy: string
}

const STAGE_OF: Record<Exclude<PoStatus, 'rejected'>, number> = {
  draft: 1,
  submitted: 2,
  approved: 3,
  accounts_cleared: 4,
  packed: 5,
  in_transit: 6,
  received: 7,
}

export function buildSeed(seed: number = SEED_VALUE): CrmData {
  return build(rng(seed))
}

/**
 * Turns the generated history into activity-log rows.
 *
 * Everything here is *derived* rather than invented: a closing already knows
 * who filed it and when, and every purchase-order event already carries its
 * actor, role and timestamp. Reading them back out means the log agrees with
 * the data by construction — it cannot drift, because there is only one set of
 * facts.
 */
function deriveAudit(
  closings: Closing[],
  purchaseOrders: PurchaseOrder[],
  today: DateStr,
): AuditEntry[] {
  const entries: AuditEntry[] = []
  const since = addDays(today, -AUDIT_HISTORY_DAYS)
  let n = 0
  const id = (at: string) => `seed-au-${(n += 1).toString(36)}-${at.slice(0, 10)}`

  for (const c of closings) {
    if (c.period < since) continue
    const person = seedPeople.find((u) => u.name === c.submittedBy)
    const units = c.lines.reduce((a, l) => a + l.qty, 0)
    entries.push({
      id: id(c.submittedAt),
      at: c.submittedAt,
      actorId: person?.id ?? 'unknown',
      actorName: c.submittedBy,
      actorRole: person?.role ?? 'promoter',
      kind: 'closing',
      action: 'closing.filed',
      summary: `Filed the ${formatDate(c.period)} ${
        c.periodType === 'month' ? 'month' : 'closing'
      } for ${locationName(c.locationId)} — ${rm(c.revenueMYR)}`,
      entityId: c.id,
      locationId: c.locationId,
      detail: `${units} units${c.writeOffs.length ? `, ${c.writeOffs.length} written off` : ''}`,
    })

    for (const w of c.writeOffs) {
      if (!w.approvedBy || !w.approvedAt) continue
      const approver = seedPeople.find((u) => u.name === w.approvedBy)
      entries.push({
        id: id(w.approvedAt),
        at: w.approvedAt,
        actorId: approver?.id ?? 'unknown',
        actorName: w.approvedBy,
        actorRole: approver?.role ?? 'ops',
        kind: 'closing',
        action: 'closing.write_off',
        summary: `Approved writing off ${w.qty} × ${skuById(w.skuId)?.label ?? w.skuId} at ${locationName(c.locationId)}`,
        entityId: c.id,
        locationId: c.locationId,
        detail: WRITE_OFF_WORD[w.reason],
      })
    }
  }

  for (const po of purchaseOrders) {
    for (const e of po.events) {
      if (e.at.slice(0, 10) < since) continue
      const person = seedPeople.find((u) => u.name === e.actor)
      entries.push({
        id: id(e.at),
        at: e.at,
        actorId: person?.id ?? 'unknown',
        actorName: e.actor,
        actorRole: e.role,
        kind: 'order',
        action: `order.${e.status}`,
        summary: `${PO_WORD[e.status]} ${po.id} for ${locationName(po.locationId)}`,
        entityId: po.id,
        locationId: po.locationId,
        detail: e.note,
      })
    }
  }

  // The day everyone was given a login and a PIN.
  for (const person of seedPeople) {
    entries.push({
      id: id(person.passwordSetAt),
      at: person.passwordSetAt,
      actorId: 'imran',
      actorName: person.passwordSetBy,
      actorRole: 'it',
      kind: 'login',
      action: 'login.created',
      summary: `Created a login for ${person.name}, ${ROLE_LABEL[person.role]}`,
      entityId: person.id,
      locationId: person.locationId,
      detail: 'Issued them a starting password',
    })
  }

  return entries.sort(newestFirst)
}

const PO_WORD: Record<PoStatus, string> = {
  draft: 'Started',
  submitted: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  accounts_cleared: 'Cleared',
  packed: 'Packed',
  in_transit: 'Dispatched',
  received: 'Confirmed the arrival of',
}

const WRITE_OFF_WORD: Record<WriteOff['reason'], string> = {
  tester: 'Tester used up',
  damaged: 'Damaged',
  sample: 'Free sample',
}

function build(r: () => number): CrmData {
  const today = DEMO_TODAY
  const start = addDays(today, -(HISTORY_DAYS - 1))
  const days = dateRange(start, today)

  const kelly = people.find((p) => p.role === 'ops')!
  const davy = people.find((p) => p.role === 'md')!
  const chloe = people.find((p) => p.role === 'pa')!
  const warehouse = people.find((p) => p.role === 'warehouse')!
  const promoterFor = (loc: Location) =>
    people.find((p) => p.locationId === loc.id)?.name ?? `${loc.code} promoter`

  const dailyLocations = tradingLocations.filter((l) => l.cadence === 'daily')
  const monthlyLocations = tradingLocations.filter((l) => l.cadence === 'monthly')

  // Opening stock for every location that counts stock.
  const stock = new Map<string, number>()
  const key = (l: string, s: string) => `${l}::${s}`
  for (const loc of dailyLocations.filter((l) => l.holdsOwnStock)) {
    for (const s of countedSkus) {
      const base = loc.channel === 'main' ? 2.6 : 1.6
      stock.set(key(loc.id, s.id), Math.round(s.reorderPoint * (base + r() * 1.6)))
    }
  }

  const closings: Closing[] = []
  const purchaseOrders: PurchaseOrder[] = []
  const deliveries: PendingDelivery[] = []
  const recent: PoInput[] = []
  const finance = people.find((p) => p.role === 'finance')!
  const actors = { ops: kelly.name, finance: finance.name, warehouse: warehouse.name }
  let poCounter = 118

  // Two back-dated gaps drive the missed-closing alerts, and the promoter's own
  // store is left open today so the closing flow is reachable in a walkthrough.
  const missed = new Set([
    `langkawi::${addDays(today, -1)}`,
    `parkson-imago::${addDays(today, -3)}`,
    `pavilion-5::${today}`,
  ])

  // ── Daily channels ───────────────────────────────────────────────────────
  for (const [dayIndex, date] of days.entries()) {
    for (const loc of dailyLocations) {
      // Online: picked from the warehouse, so there is no shelf to count and no
      // top-up to raise. Sales and how they were paid, and nothing else.
      if (!loc.holdsOwnStock) {
        const f = dayFactor(date, dayIndex, r)
        const units = Math.max(1, Math.round(14 * loc.traffic * f))
        const popTotal = sellableSkus.reduce((a, s) => a + s.popularity, 0)
        const soldBySku = new Map<string, number>()
        let revenueMYR = 0
        for (const s of sellableSkus) {
          const qty = Math.round((s.popularity / popTotal) * units * jitter(r, 0.9))
          if (qty <= 0) continue
          soldBySku.set(s.id, qty)
          revenueMYR += qty * priceOf(s, loc.priceBasis)
        }
        if (soldBySku.size === 0) continue

        // Marketplaces settle by card and wallet; there is no cash online.
        const ewallet = roundTo(revenueMYR * (0.42 + (r() - 0.5) * 0.1), 1)
        closings.push({
          id: `${loc.id}-${date}`,
          locationId: loc.id,
          channel: loc.channel,
          period: date,
          periodType: 'day',
          revenueMYR,
          tender: { cash: 0, ewallet, card: roundTo(revenueMYR - ewallet, 1) },
          lines: [...soldBySku].map(([skuId, qty]) => ({ skuId, qty })),
          staffSales: { qty: 0, revenueMYR: 0 },
          stockCount: [],
          writeOffs: [],
          submittedBy: chloe.name,
          submittedAt: `${date}T23:${String(Math.floor(r() * 55)).padStart(2, '0')}:00+08:00`,
        })
        continue
      }

      const received = new Map<string, number>()
      for (const d of deliveries) {
        if (d.locationId !== loc.id || d.date !== date) continue
        for (const l of d.lines) {
          stock.set(key(loc.id, l.skuId), (stock.get(key(loc.id, l.skuId)) ?? 0) + l.qty)
          received.set(l.skuId, (received.get(l.skuId) ?? 0) + l.qty)
        }
      }

      if (missed.has(`${loc.id}::${date}`)) continue

      const f = dayFactor(date, dayIndex, r)
      const transactions = Math.max(1, Math.round(11 * loc.traffic * f))
      const unitsTarget = Math.round(transactions * (1.15 + r() * 0.4))
      const popTotal = sellableSkus.reduce((a, s) => a + s.popularity, 0)

      const soldBySku = new Map<string, number>()
      const stockCount: StockCount[] = []
      let revenueMYR = 0

      for (const s of countedSkus) {
        const openingBefore = stock.get(key(loc.id, s.id))! - (received.get(s.id) ?? 0)
        const available = openingBefore + (received.get(s.id) ?? 0)

        let sold = 0
        if (s.sellable) {
          const want = Math.round((s.popularity / popTotal) * unitsTarget * jitter(r, 0.8))
          sold = Math.max(0, Math.min(want, available))
        }
        const closing = Math.max(0, available - sold)
        stock.set(key(loc.id, s.id), closing)

        if (sold > 0) {
          soldBySku.set(s.id, sold)
          revenueMYR += sold * priceOf(s, loc.priceBasis)
        }
        stockCount.push({ skuId: s.id, opening: openingBefore, counted: closing })
      }

      // Testers used, the odd damage, an occasional sample.
      const writeOffs: WriteOff[] = []
      if (r() < 0.16) {
        const s = pick(r, countedSkus)
        const reason: WriteOff['reason'] = r() < 0.5 ? 'tester' : r() < 0.8 ? 'damaged' : 'sample'
        writeOffs.push({
          skuId: s.id,
          qty: 1,
          reason,
          approvedBy: r() < 0.7 ? kelly.name : davy.name,
          approvedAt: `${date}T22:${String(10 + Math.floor(r() * 40)).padStart(2, '0')}:00+08:00`,
        })
      }

      // Staff purchases, kept apart from normal trade.
      const staffQty = r() < 0.12 ? 1 : 0
      const staffSales = {
        qty: staffQty,
        revenueMYR: staffQty
          ? Math.round(priceOf(pick(r, sellableSkus), loc.priceBasis) * 0.7)
          : 0,
      }

      const lines: SaleLine[] =
        loc.recordsCountries && loc.originProfile
          ? linesWithCountries(soldBySku, loc.originProfile, r)
          : [...soldBySku].map(([skuId, qty]) => ({ skuId, qty }))

      const cardShare = (loc.region === 'Airports' ? 0.68 : 0.52) + (r() - 0.5) * 0.08
      const ewalletShare = (loc.region === 'Airports' ? 0.14 : 0.28) + (r() - 0.5) * 0.06
      const card = roundTo(revenueMYR * cardShare, 1)
      const ewallet = roundTo(revenueMYR * ewalletShare, 1)
      const cash = roundTo(revenueMYR - card - ewallet, 1)

      closings.push({
        id: `${loc.id}-${date}`,
        locationId: loc.id,
        channel: loc.channel,
        period: date,
        periodType: 'day',
        revenueMYR,
        tender: { cash, ewallet, card },
        lines,
        staffSales,
        stockCount,
        writeOffs,
        submittedBy: promoterFor(loc),
        submittedAt: `${date}T${21 + (r() < 0.5 ? 0 : 1)}:${String(Math.floor(r() * 55)).padStart(2, '0')}:00+08:00`,
      })

      // Raise a top-up when something crosses its reorder point.
      const lowLines = countedSkus
        .filter((s) => stock.get(key(loc.id, s.id))! <= s.reorderPoint)
        .map((s) => {
          const onHand = stock.get(key(loc.id, s.id))!
          const target = Math.round(s.reorderPoint * 3)
          return {
            skuId: s.id,
            qtyRequested: Math.max(s.caseSize, roundTo(target - onHand, s.caseSize)),
            qtyApproved: null,
            qtyShipped: null,
          }
        })

      const inFlight =
        purchaseOrders.some(
          (p) => p.locationId === loc.id && !['received', 'rejected'].includes(p.status),
        ) || recent.some((x) => x.locationId === loc.id)

      if (lowLines.length && !inFlight) {
        poCounter += 1
        const input: PoInput = {
          id: `PO-2026-${String(poCounter).padStart(4, '0')}`,
          locationId: loc.id,
          date,
          lines: lowLines,
          urgent: lowLines.length >= 3,
          createdBy: promoterFor(loc),
        }

        if (daysBetween(date, today) > IN_FLIGHT_WINDOW) {
          const po = makePurchaseOrder({ ...input, targetStatus: 'received', r, actors })
          purchaseOrders.push(po)
          deliveries.push({
            locationId: loc.id,
            date: addDays(date, 3),
            lines: po.lines.map((l) => ({ skuId: l.skuId, qty: l.qtyShipped ?? 0 })),
          })
        } else {
          recent.push(input)
        }
      }
    }
  }

  // Deal the in-flight orders across the lifecycle so every queue is populated.
  recent.sort((a, b) => (a.date < b.date ? 1 : -1))
  recent.forEach((input, i) => {
    purchaseOrders.push(
      makePurchaseOrder({
        ...input,
        targetStatus: IN_FLIGHT_LADDER[i % IN_FLIGHT_LADDER.length],
        r,
        actors,
      }),
    )
  })

  // ── Consignment: one closing per partner per closed month ────────────────
  const thisMonth = monthKey(today)
  for (let back = HISTORY_MONTHS; back >= 1; back--) {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    if (monthKey(period) === thisMonth) continue

    for (const loc of monthlyLocations) {
      const soldBySku = new Map<string, number>()
      let revenueMYR = 0
      const monthlyUnits = Math.round(150 * loc.traffic * jitter(r, 0.4))
      const popTotal = sellableSkus.reduce((a, s) => a + s.popularity, 0)

      for (const s of sellableSkus) {
        const qty = Math.round((s.popularity / popTotal) * monthlyUnits * jitter(r, 0.7))
        if (qty <= 0) continue
        soldBySku.set(s.id, qty)
        revenueMYR += qty * priceOf(s, loc.priceBasis)
      }

      closings.push({
        id: `${loc.id}-${period}`,
        locationId: loc.id,
        channel: loc.channel,
        period,
        periodType: 'month',
        revenueMYR,
        lines: [...soldBySku].map(([skuId, qty]) => ({ skuId, qty })),
        staffSales: { qty: 0, revenueMYR: 0 },
        stockCount: [],
        writeOffs: [],
        submittedBy: kelly.name,
        submittedAt: `${addDays(period, 34)}T10:${String(Math.floor(r() * 55)).padStart(2, '0')}:00+08:00`,
      })
    }
  }

  const targets: Target[] = locations
    .filter((l) => l.monthlyTargetMYR)
    .map((l) => ({ locationId: l.id, month: thisMonth, amountMYR: l.monthlyTargetMYR! }))

  // The promoter's own store is mid-afternoon: a few sales already logged, the
  // rest of the day still to come.
  const liveLines: CrmData['liveLines'] = {}
  const pavilion = locations.find((l) => l.id === 'pavilion-5')!
  const openers = sellableSkus.filter((s) => s.bestseller).slice(0, 4)
  liveLines[pavilion.id] = openers.map((s, i) => ({
    skuId: s.id,
    qty: 1 + Math.floor(r() * 2),
    countryCode: (pavilion.originProfile ?? ['MY'])[i % (pavilion.originProfile?.length ?? 1)],
  }))

  const alerts = deriveAlerts(closings, purchaseOrders, stock, key, today)

  return {
    today,
    closings,
    purchaseOrders,
    alerts,
    targets,
    promotions: seedPromotions,
    audit: deriveAudit(closings, purchaseOrders, today),
    liveLines,
    users: seedPeople,
  }
}

/** Walks an order down the chain to `targetStatus`, writing the event trail. */
function makePurchaseOrder(
  args: PoInput & {
    targetStatus: PoStatus
    r: () => number
    actors: { ops: string; finance: string; warehouse: string }
  },
): PurchaseOrder {
  const { id, locationId, date, lines, urgent, createdBy, targetStatus, r, actors } = args
  const stage = targetStatus === 'rejected' ? 0 : STAGE_OF[targetStatus]

  const at = (offset: number, hh: number) =>
    `${addDays(date, offset)}T${String(hh).padStart(2, '0')}:${String(5 + Math.floor(r() * 50)).padStart(2, '0')}:00+08:00`

  const events: PoEvent[] = [
    { status: 'draft', actor: createdBy, role: 'promoter', at: at(0, 20) },
    {
      status: 'submitted',
      actor: createdBy,
      role: 'promoter',
      at: at(0, 21),
      note: urgent ? 'Bestsellers down to the last few units.' : undefined,
    },
  ]

  const priced = lines.map((l) => ({ ...l }))

  if (targetStatus === 'rejected') {
    events.push({
      status: 'rejected',
      actor: actors.ops,
      role: 'ops',
      at: at(1, 10),
      note: 'Quantities above the quarter allocation. Resubmit with the bestsellers only.',
    })
    return {
      id, locationId, createdBy, createdAt: at(0, 20),
      priority: urgent ? 'urgent' : 'standard',
      notes: '', status: 'rejected', lines: priced, events,
    }
  }

  let status: PoStatus = 'submitted'

  if (stage >= 3) {
    priced.forEach((l, i) => {
      const trim = i === 0 && r() < 0.28
      l.qtyApproved = trim ? Math.max(1, Math.round(l.qtyRequested * 0.6)) : l.qtyRequested
    })
    events.push({
      status: 'approved',
      actor: actors.ops,
      role: 'ops',
      at: at(1, 10),
      note: priced.some((l) => l.qtyApproved !== l.qtyRequested)
        ? 'Approved with one line trimmed to the allocation.'
        : undefined,
    })
    status = 'approved'
  }
  if (stage >= 4) {
    events.push({ status: 'accounts_cleared', actor: actors.finance, role: 'finance', at: at(1, 15) })
    status = 'accounts_cleared'
  }
  if (stage >= 5) {
    priced.forEach((l) => (l.qtyShipped = l.qtyApproved))
    events.push({ status: 'packed', actor: actors.warehouse, role: 'warehouse', at: at(2, 11) })
    status = 'packed'
  }
  if (stage >= 6) {
    events.push({ status: 'in_transit', actor: actors.warehouse, role: 'warehouse', at: at(2, 16) })
    status = 'in_transit'
  }
  if (stage >= 7) {
    events.push({ status: 'received', actor: createdBy, role: 'promoter', at: at(3, 12) })
    status = 'received'
  }

  return {
    id, locationId, createdBy, createdAt: at(0, 20),
    priority: urgent ? 'urgent' : 'standard',
    notes: '', status, lines: priced, events,
  }
}

function deriveAlerts(
  closings: Closing[],
  pos: PurchaseOrder[],
  stock: Map<string, number>,
  key: (l: string, s: string) => string,
  today: DateStr,
): Alert[] {
  const alerts: Alert[] = []
  const stamp = (d: DateStr, hh: string) => `${d}T${hh}:00+08:00`
  const daily = tradingLocations.filter((l) => l.cadence === 'daily')

  // Stock at or under its reorder point right now.
  for (const loc of daily) {
    for (const s of countedSkus) {
      const onHand = stock.get(key(loc.id, s.id)) ?? 0
      if (onHand > s.reorderPoint) continue
      alerts.push({
        id: `low-${loc.id}-${s.id}`,
        type: 'low_stock',
        severity: onHand === 0 ? 'critical' : onHand <= s.reorderPoint / 2 ? 'serious' : 'warn',
        locationId: loc.id,
        skuId: s.id,
        message:
          onHand === 0
            ? `${skuById(s.id)?.label} is out of stock`
            : `${skuById(s.id)?.label} down to ${onHand}, at or below the reorder point of ${s.reorderPoint}`,
        at: stamp(today, '07:30'),
        read: false,
      })
    }
  }

  // Daily locations that did not file. Deadline is 11pm (Q18).
  for (const loc of daily) {
    for (let back = 1; back <= 4; back++) {
      const date = addDays(today, -back)
      if (closings.some((c) => c.locationId === loc.id && c.period === date)) continue
      alerts.push({
        id: `missed-${loc.id}-${date}`,
        type: 'missed_closing',
        severity: back === 1 ? 'serious' : 'critical',
        locationId: loc.id,
        message: `No closing filed for ${date}`,
        at: stamp(addDays(date, 1), '08:00'),
        read: false,
      })
    }
  }

  // Orders sitting with Kelly.
  for (const po of pos) {
    if (po.status !== 'submitted') continue
    alerts.push({
      id: `po-${po.id}`,
      type: 'po_waiting',
      severity: po.priority === 'urgent' ? 'serious' : 'warn',
      locationId: po.locationId,
      poId: po.id,
      message: `${po.id} is waiting for approval`,
      at: stamp(today, '07:45'),
      read: false,
    })
  }

  return alerts.sort((a, b) => (a.at < b.at ? 1 : -1))
}
