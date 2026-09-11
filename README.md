# Legendary · Retail CRM

A working wireframe of the production CRM for **Legendary**, a Malaysian perfume house selling
through 62 locations across three channels.

Built from the client's own answers: the 96-question discovery form, the company hierarchy, and
the store list. Those three documents are the client's own and are kept out of this repository;
what was decided from them is written up in [`docs/spec/`](docs/spec/) —
[the decisions](docs/spec/2026-08-21-answers-to-decisions.md) taken from each answer, and
[a coverage check](docs/spec/2026-08-23-coverage-check.md) going back through all three files to
say what is built and what is still missing.

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # 190 tests
npm run build    # typecheck + production bundle into dist/
```

---

## What the business actually looks like

The demo assumed nine identical outlets. The real estate is **62 locations that report
differently**, and channel is the primary dimension in the system:

| Channel | Count | Reports | Country per sale? | How often | Own stock? |
|---|---|---|---|---|---|
| **Main store** | 12 (9 open, 3 coming) | Sales, product, country | **Yes, exactly** | Daily | Yes |
| **Dealer** | 44 | Sales, product | No | Daily | Yes |
| **Consignment** | 6 | Sales, product, margin | No | Monthly | No |

Channel decides which closing form a location gets, what it is asked for, and how often it is due.

---

## Signing in

**Username and password.** Leadership and IT also get a six-digit code by e-mail; everybody else
is in as soon as the password is right.

Everything else works the way the PINs did, at the client's request: seniors issue passwords,
promoters keep the one they are given, and Davy, Imran, Kelly and Chloe can look up the passwords
within their reach — every look-up recorded on the Activity screen. The rules, and what they cost,
are in [`docs/spec/auth.md`](docs/spec/auth.md).

The sign-in screen carries a demo panel listing the logins. **It is one flag in the code and must
be turned off before real staff use the system.**

---

## The thirty-nine people

Taken from the hierarchy chart and the username list in *CRM Revision 2* — twelve at head
office and twenty-seven store promoters, with their real usernames.

| Person | Role | What they get |
|---|---|---|
| **Vins Lim** | Director (Founder) | Everything, **read only** — no action appears anywhere |
| **Lim Davy** | Managing Director | Overview, analytics, approvals, promotions, targets |
| **Kelly Tew** | Operational Manager | Her working screen: approvals, corrections, missed closings |
| **Chloe Chock** | PA to the MD | Overview, analytics, products, promotions, logins |
| Siew Fang, Ivvi Chin, Eunice Lim | Finance | Revenue by channel, consignment margins, clearing orders |
| An, Loong, Low, Kim | Warehouse | Despatch and the combined pick list — stock screens only |
| 27 promoters across six stores | Store Promoter | Their own store: record sales, close the day, stock, orders |
| **Imran** | IT | Logins, permissions and the activity log. **His own login is hidden from everyone else** |

The read-only founder is a real permission mode, not hidden buttons: `canEdit: false` removes
every action from every screen, and the top bar wears a "View only" badge so he can tell why.

---

## Everything is written down

Every action that changes anything writes one line: what happened, who did it, and when. Filing a
closing, approving an order, editing a login, setting a target, recording a promotion, signing in,
mistyping a PIN — all of it, on the **Activity** screen, newest first, filterable by person,
category and date, and exportable.

Two decisions are worth knowing about:

- **PINs are never written to the log**, old or new. A log of PINs would undo the point of
  encrypting them. What is recorded is that a PIN was changed, and by whom.
- **Looking at somebody's PIN is itself an action** and leaves a line. Four people can read
  fifteen PINs; each time they do, it is on the record.

The log is read by the Director, Davy, Kelly, Chloe and Imran. In the database it is
**append-only** — the insert and select policies exist and the update and delete policies do not,
so under row-level security nobody can quietly tidy it, including the Managing Director.

The database also writes its own copy through a trigger on every table that matters, so a change
made by a script or a psql session is recorded the same as one made through a screen.

---

## The two things that changed most

**1. Country is captured per sale, and it is exact.**
The client needs to know precisely which nationality bought which perfume, in the main stores
(Q29). So a promoter records each sale as it happens — tap the perfume, tap the country — and the
11pm close becomes a confirmation rather than an hour of recall. The old estimate is gone.

Dealers and consignment never capture it. When a country filter is on, they are **excluded rather
than estimated**, and the screen says how much of the estate that leaves out.

**2. Nothing is valued.**
Once stock leaves the warehouse it is no longer Legendary's, and the client was explicit that this
must not be confused with SQL Accounting (Q35). So stock here is a count for visibility only, and
there is no cost price or profit anywhere (Q58, Q65). The single margin figure sits on each
consignment partner.

---

## Walking it in five minutes

1. **Lim Davy** — the overview opens with the three stores he checks first every morning
   (Q71: Pavilion KL, KLIA T2, KLCC Isetan), then the group, then what needs him.
2. **Pavilion KL promoter** — *Record a sale*: tap Orchid 30ml, tap China. That is the whole
   interaction, sized for a finger on an iPad (Q78).
3. **Close the day** — four steps: check the sales you logged → split the money three ways →
   count every perfume → send Kelly a top-up. Raising an order is a confirmation, not typing.
4. **Kelly Tew** — the order is at the top of her queue. She approves every order (Q46).
5. **Finance** clears it, **Warehouse** picks and dispatches, the promoter confirms it arrived.
6. **Vins Lim** — the same screens with every button gone.
7. **Imran** — the Logins screen, where he is the only person who can see his own row, and the
   only person besides Davy who can change Davy's PIN.
8. **Activity** — everything the walkthrough just did, in order, with names and times against it.

`Ctrl`/`⌘` `K` jumps to any screen, store, order or person.

---

## The order chain

Confirmed as demonstrated (Q45), with Kelly approving everything and Davy covering when she is
away (Q46):

```
 Store        Kelly              Finance           Warehouse          Store
 draft ──▶ submitted ──▶ approved ──▶ cleared ──▶ packed ──▶ on its way ──▶ received
                │
                └──▶ rejected  (reason required; chain ends)
```

`src/lib/po-machine.ts` owns which moves are legal and who may make them. No screen assigns a
status directly, so none can offer a move the workflow does not allow. There are no back-orders —
a short delivery means the store asks again (Q52) — and the printed order form comes out of SQL,
not from here (Q51).

**Finance clears, it does not approve.** The discovery form (Q48) said Finance shares the
authorisation; the hierarchy chart gives "approves changes and PO" to the Managing Director and
the Operational Manager only. The chart wins, and the conflict is flagged for the client rather
than settled quietly.

---

## Architecture

**One store, and pure selectors over it.** Every figure comes from a `select*()` in
`src/store/selectors.ts`. Screens never aggregate; charts never compute.

```
src/
├─ data/        locations · products · people · countries · types · seed
├─ store/       useAuth (capabilities) · useData · selectors
├─ lib/         dates · format · po-machine · exportCsv
├─ components/  ui/ · charts/ · layout/ · po/
└─ pages/       signin · hq/ · store/ · orders/
```

### What gets saved in the browser

The 90 days of seeded history are far too large for browser storage — an early version blew the
quota the moment anyone recorded a sale. Instead the browser keeps a **small overlay of what this
person changed** (a few hundred bytes), replayed over a freshly generated seed on load. It keeps a
walkthrough's changes across a refresh, and it mirrors how the real system will work: the server
holds the history, the device holds only what is in front of you.

### Demo data

`src/data/seed.ts` generates 90 days for the daily channels and three closed months for
consignment, from a fixed seed, so every run is byte-identical. It carries stock forward day by
day — sales draw it down, a top-up is raised when something crosses its reorder level, and the
delivery lands a few days later — which is why the stock screen reconciles with the sales behind
it.

---

## Testing

190 Vitest tests over the pure layer:

- **Seed** — determinism, revenue reconciling against its own sale lines, payment splitting three
  ways, every product counted every night, never selling stock a store did not have, never selling
  a tester, country recorded on every main-store line and on no other.
- **Selectors** — aggregation against a brute-force count, channel and product splits summing back
  to the whole, exact country attribution, dealers correctly returning nothing under a country
  filter, coverage reporting, stock status and suggested quantities.
- **State machine** — the confirmed chain, refusal to skip or reverse steps, and per-role
  permissions including the founder having no move anywhere and approval sitting only with the
  Managing Director and the Operational Manager.
- **People** — every row of the hierarchy chart, and every row of the PIN authority table: who
  may change whose, who may see whose, IT hidden from everyone else, and the four PIN rules
  (six digits, not obvious, never shared, never reused).
- **Store** — the same PIN rules enforced again at the last line, plus targets and promotions
  surviving a round trip through the overlay.
- **Activity** — that every action writes exactly one line, that the line carries a person, a
  role and a timestamp, that a refused action writes nothing, and that no PIN ever reaches the
  log.
- **Countries** — that all 200 of the client's own list are present with unique ISO codes, and
  that search puts a name starting with your query above one that merely contains it.
- **Catalogue** — the sixteen priced lines and their two prices, that no two SKUs share a code,
  that nothing unsellable carries a price, and that BSAS counts on retail while everyone else
  counts on promotion.

---

## Still outstanding from the client

Listed in full in the decisions document. The ones that matter most:

1. **The full product list** — 19 products confirmed by count; we have 9 with real prices.
2. **Consignment margin rates** for the six partners.
3. **What "BSAS" is** — listed as a main store, we cannot place it.
4. **Dealer towns** — 56 names, no addresses, so they cannot be grouped by region yet.
5. **The staff list** from Chloe, so promoters get real names and real PINs.
6. **A Zeoniq export** and a **sales history sample**, to size the integration and the migration.

A full walk through all three client documents, saying what is built and what is still missing, is
in [`docs/spec/2026-08-23-coverage-check.md`](docs/spec/2026-08-23-coverage-check.md).

## To make it production

This build is the complete front end against realistic data — every screen, every role, every
workflow, ready for sign-off. Going live also needs a database, PIN sign-in wired to it, the
Zeoniq feed for the counters that can provide one, and the three years of Excel history migrated
in.

The schema is written and ready to run: [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql)
enforces the client's rules at the storage layer — a country only where the store captures one, a
tester never sold, a correction closing after three days, and a PIN never shared or reused.

**It can run for the price of a domain.** Cloudflare Pages and the Supabase free tier cover
everything else; the one thing not to skip is a nightly backup, which is also free.
[`docs/spec/deployment-and-backend.md`](docs/spec/deployment-and-backend.md) has the numbers,
including when the free tier runs out and what to do then.
