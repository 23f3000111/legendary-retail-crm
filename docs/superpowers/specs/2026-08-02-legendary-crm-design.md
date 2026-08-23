# Legendary CRM — Design Spec

**Date:** 2026-08-02
**Status:** Built. Amendments made during implementation are marked *(revised)*.

## Purpose

A demonstration CRM for **Legendary**, a Malaysian luxury perfume house. Outlets use it to
perform their daily closing; HQ uses it to approve stock top-ups and analyse group performance.

This is a **client-facing demo**, not a production system. There is no real authentication:
the login screen offers one-click "Login as…" persona cards so a client can feel every role
in a single sitting. All data lives in the browser.

## Grounding in the real brand

The sibling project `../legendary` is the Legendary retail website. This CRM reuses its
real-world facts so the demo reads as genuine:

- **9 outlets** — Pavilion KL, KLCC · Isetan, Pavilion KL · Parkson Elite, Genting · Sky
  Avenue, Melaka Flagship, KLIA Terminal 1 · Eraman, KLIA Terminal 2 · Gate P & Q, Langkawi
  Airport, Parkson · Imago KK. Regions: Kuala Lumpur, Highlands, Melaka, Airports, Sabah.
- **9 SKUs** — Orchid (RM159), Mahsuri (RM159), Violet (RM149), Man (RM189), Kebaya Blooms
  (RM159), Ondeh Delights (RM159), Nyonya Aromatic (RM159), 3 Wishes (RM199), Spirit (RM179).
  Collections: Signature, Nyonya, 3 Wishes, Spirit.
- **Brand palette and type** — Heritage Luxe ivory/gold/ink, Fraunces + Jost.

Three of the nine outlets are airport stores. That is why customer country-of-origin tracking
is a first-class feature rather than an afterthought: this is tourist retail.

## Decisions

| Decision | Choice |
|---|---|
| Stack | Vite + React 18 + TypeScript + Tailwind 3 + framer-motion + zustand + Recharts |
| Visual direction | ~~Dark luxe command center~~ → **Light command deck** *(revised, see below)* |
| Roles | Outlet Staff, HQ Admin, PO Approver, Owner, Accounts, Warehouse, Managing Director (7) |
| Data | Deterministic seed of ~90 days, persisted to localStorage, resettable |
| Closing flow | Guided 4-step "Close the Day" wizard |
| Origin capture | Live tally counters tapped through the day |
| Owner analytics | Rich filter bar + metric picker driving every chart |
| Upgrades | Smart alerts + auto-PO, targets/leaderboard, full PO lifecycle, export + ⌘K |

## Architecture

**Single zustand store + pure selector functions.** All entities live in one persisted store.
Every figure rendered anywhere comes from a pure `select*()` function over that store.

Rationale: in a client demo the fatal failure is two screens disagreeing about a number. One
source of truth makes that structurally impossible, and pure selectors are directly unit-testable.

```
src/
├─ data/        outlets · skus · countries · personas · seed
├─ store/       useAuth · useData (zustand + persist) · selectors (pure)
├─ lib/         format · analytics · po-machine · export
├─ components/  layout/ · ui/ · charts/
└─ pages/       login · staff/ · admin/ · approver/ · accounts/ · warehouse/ · owner/
```

Two rules keep files focused:

- **Charts never fetch or compute.** They receive a prepared array of points.
- **Pages never aggregate.** They call a selector.

Consequently `selectors.ts` is the only module containing analytics arithmetic, and the only
module that strictly needs tests.

## Data model

```ts
Outlet        { id, name, region, code, monthlyTargetMYR, staffName }
Sku           { id, name, collection, accent, priceMYR, size, reorderPoint, caseSize }
Country       { code, name, flag, region }

DailyClosing  { id, outletId, date,
                sales: { grossMYR, transactions, tender: { cash, card, qr } },
                skuMovement: [{ skuId, opening, sold, damaged, closing }],
                origins:     [{ countryCode, customers }],
                submittedBy, submittedAt, status: 'draft' | 'submitted' }

PurchaseOrder { id: "PO-2026-0142", outletId, createdBy, createdAt, priority, notes,
                lines: [{ skuId, qtyRequested, qtyApproved, qtyShipped }],
                status, events: [{ status, actor, role, at, note }] }

Alert         { id, type: 'low_stock' | 'missed_closing' | 'target_risk' | 'po_stalled',
                severity, outletId, skuId?, message, at, read }
```

### Purchase order lifecycle

```
 Staff        Approver              Accounts             Warehouse          Staff
 draft ──▶ submitted ──▶ approved ──▶ accounts_cleared ──▶ packed ──▶ in_transit ──▶ received
                │
                └──▶ rejected  (reason required; chain ends)
```

Accounts clears the PO **before** the warehouse packs it — stock is not committed until the
cost is signed off. (Flagged to the client for confirmation; changing the order is a one-line
edit to `po-machine.ts`.)

Every transition appends to `events[]` with actor, role, timestamp and note; that array renders
directly as the timeline on the PO detail page. Partial fulfilment is expressed as
`qtyApproved < qtyRequested` and surfaced with an amber badge.

`lib/po-machine.ts` owns the transition table and the per-role permission to perform each
transition. No page may mutate `status` directly.

## Screens

**Login** — six persona cards, no passwords. A role switcher persists in the topbar so the
client can move between roles mid-demo without returning to login.

| Role | Screens |
|---|---|
| Outlet Staff | Today overview · Close the Day wizard · live origin tally · stock on hand with reorder flags · my POs · closing history |
| HQ Admin | Group overview · closings monitor (who has not closed today) · PO inbox · master inventory · alerts feed |
| PO Approver | Approval queue · PO detail with sales-velocity justification · approve / adjust quantity / reject with reason |
| Accounts | Approved-PO queue · cost summary · mark cleared |
| Warehouse | Cleared-PO queue · pick list · pack & dispatch, partial fulfilment |
| Owner | Filter bar (date range · outlets · region · collection/SKU · nationality) + metric picker (revenue / units / customers / avg basket) driving every chart · outlet leaderboard · targets · exports |

**Targets are shown as pace, not completion** *(revised during implementation)*. The demo's
today is the 2nd of the month, so raw month-to-date against a monthly target read 2% for every
outlet — arithmetically right, useless as a signal, and every ring rendered red. Rings and
badges now show month-to-date against the pro-rata share of the target the month has so far
earned, where 100% means exactly on track. The raw month-to-date and target figures sit beside
it as text.

Wizard step 4 joins the requirements together: low-stock SKUs arrive **pre-filled with
suggested quantities** derived from 30-day sales velocity, so raising a PO is a confirmation
rather than data entry.

## Visual language *(revised after client review)*

The first build shipped a dark luxe theme drawn from the retail site. The client rejected it
and supplied a reference: a light dashboard with vibrant gradient KPI tiles, pill navigation in
a gradient header, white cards and a gradient footer — asking for that structure with a
"modern futuristic command centre" feel. The theme below replaces the dark one entirely.

- **Deck** `#EEF2FA`, lit by two distant coloured washes and a faint plotted grid at 3% ink
- **Panels** white glass at 85% with a hairline edge and a top-edge highlight
- **Gradients** indigo→violet for the command bar, status bar and primary actions; violet /
  blue / cyan / teal for the KPI tiles, always in that fixed order
- **Ink** `#0F1B33` primary, `#4A5B7A` secondary, `#8494B2` muted
- **Type** Sora for display, Inter for UI, JetBrains Mono for every number
- **Chart series** re-validated for the white surface (see below); a single series wears the UI
  accent rather than taking a categorical slot
- One ambient effect — a slow light sweep across the gradient bars. Everything else moves
  because something changed: count-up KPIs, staggered reveals, wizard step transitions.

### Chart palette

Re-searched and re-validated against white, since the dark-surface set would not hold:
adjacent CVD ΔE 21.0 (target ≥ 8), normal-vision ΔE 33.0 (floor ≥ 15), all six ≥ 3:1 contrast.
The sequential ramp was lifted until its light end cleared the 2:1 floor on white.

## Managing Director *(added after client review)*

A seventh role. The Owner's screen is a filterable deep-dive; the Managing Director's is the
board-level read and carries **no filters at all** — group telemetry, a priority queue ranked by
severity, composition rings for collection and region, the outlet strip, and the order
pipeline. Splitting them keeps each screen answering one question well rather than both badly.

## Seed data

A deterministic PRNG with a fixed seed, so every demo run is identical: 90 days × 9 outlets.

- Weekend uplift; airport outlets peak on different curves from mall outlets
- Tourist mix varies by location — KLIA and Langkawi skew China · India · UK · Australia ·
  Gulf; Melaka skews Singapore · Indonesia; Imago KK skews China · Korea
- A festive-season bump
- Purchase orders spread across every status, so no queue is ever empty

*(revised during implementation)*

- **A gentle growth trend, ~0.35%/day.** Without it the seasonal calendar alone decides the
  period-on-period deltas, and whichever 30-day window happened to contain the June school
  holidays won — which opened the demo on a wall of red arrows for a business that is in fact
  trading up.
- **Three closings left unfiled, not two.** The two back-dated ones drive the missed-closing
  alerts as planned. The third is *today at the staff persona's own outlet*: the seed originally
  filed it, which meant a client signing in as Aisyah was turned away by a day already closed
  and could never reach the Close the Day wizard — the flow the whole demo is built around.
  Her outlet now opens mid-afternoon with a customer tally already running.
- **In-flight orders are dealt statuses from a fixed ladder** rather than inferred from age.
  Age alone left the recent window too sparse to populate every queue, so `approved` and
  `packed` were empty.
- **Monthly targets are calibrated to the seeded run rate.** The first pass guessed them at
  roughly three times actual, so every outlet read as failing.

## Persistence and error handling

`zustand/persist` writes to `localStorage["legendary-crm-v1"]`, versioned. "Reset demo data"
in the topbar re-seeds. Corrupt or unparseable storage falls back to a fresh seed with a toast
rather than a blank screen.

Validation: tender must balance gross sales; closing stock cannot be negative; PO lines must be
greater than zero; rejection requires a reason. Route guards redirect a role away from another
role's pages; unknown routes render a 404.

## Testing

Vitest over the pure layer only:

1. Selector aggregation — revenue, units, customer counts, averages, period comparison
2. PO state machine — legal transitions succeed, illegal ones are rejected, role permissions hold
3. Seed determinism — the same seed produces identical data across runs

UI components are not unit-tested. Incorrect arithmetic in front of a client is the failure mode
worth guarding against; button rendering is not.

## Out of scope

Real authentication, a server, a database, multi-user concurrency, real payment or ERP
integration, mobile native apps.
