# Coverage check — the three documents, line by line

**Date:** 2026-08-23
**Purpose:** you asked us to read the client's three files again and say honestly whether
anything is missing. This is that answer.

The three files are:

1. `Legendary CRM Company Hierarchy for CRM.pdf`
2. `Legendary Stores for CRM.pdf`
3. `Legendary_Perfume_CRM_Client_Discovery_Form.md` — 96 questions

---

## 1. The hierarchy chart

Every box on the chart, and where it lives in the system.

| Chart says | Built | Where |
|---|---|---|
| Director (Founder) — Vins Lim — *access all, cannot edit* | ✅ | `capabilities.director` is the only role with `canEdit: false`. Every screen hides its actions and the header wears a "View only" badge so he knows why. |
| Davy's PA — Chloe Chock — *access and edit all* | ✅ | `capabilities.pa`. Edits everything, approves nothing. |
| Managing Director — Lim Davy — *access and edit all, approves changes and PO* | ✅ | `capabilities.md`. |
| Operational Manager — Kelly Tew — *access and edit all, approves changes and PO* | ✅ | `capabilities.ops`. |
| Finance — Siew Fang, Ivvi, Eunice, Apple — *access and edit all* | ✅ | `capabilities.finance`. **Does not approve** — see the note below. |
| Warehouse — An, Loong, Low, Kim — *access to stock data* | ✅ | `capabilities.warehouse` with `stockOnly: true`; their navigation is Despatch and Stock, nothing else. |
| Store Promoter — *input data* | ✅ | `capabilities.promoter`, `viewAll: false` — their own store only. |

**Correction made since the last build:** Finance no longer approves purchase orders. The
chart gives *"approves changes and PO"* to two boxes and Finance is not one of them. This
contradicts discovery Q48, which says Kelly, Finance and Davy share the authorisation. We
have followed the chart, as instructed, and **flagged the conflict** in
[`2026-08-21-answers-to-decisions.md`](./2026-08-21-answers-to-decisions.md) for the client
to settle. `src/lib/po-machine.ts` now allows `submitted → approved` for `md` and `ops`
only, and a test fails the build if anyone widens it.

**Imran is not on the chart.** He is a technical administrator, so he sits outside it — and
per the client's instruction his login is hidden from everyone else's Logins screen.

Every row above is covered by a test in `src/data/people.test.ts`.

---

## 2. The stores document

| Document | System | Match |
|---|---|---|
| 12 main stores (9 trading, 3 marked *coming*) | 12, with Sogo 118, TRX and Melaka Parkland Mall flagged *coming* and excluded from every figure | ✅ |
| 56 dealers | 56, names exactly as listed | ✅ |
| 6 consignment | 6 — Sasa, AirAsia, Eraman KLIA T1, Eraman KLIA T2, Eraman KKIA, Watsons | ✅ |
| Main stores record *daily sales, SKU sold, countries* | Daily closing captures all three; country is recorded per sale line, not estimated | ✅ |
| Dealers record *daily sales, SKU sold* | Same closing, with the country step absent | ✅ |
| Consignment records *monthly sales, SKU sold* | Monthly period, no stock count, carries a margin field | ✅ |

**Still to confirm, and flagged in the system rather than guessed:**

- **What is "BSAS"?** It is listed as a main store and we cannot place it. It carries the
  region `To confirm`.
- **Dealer towns.** 56 names, no addresses. All 56 carry `To confirm` as their region, so
  they cannot yet be grouped geographically. Q2 suggests many are souvenir shops in Kota
  Kinabalu.
- **Two lists disagree.** Discovery answer 2 names "Parkson Elite" and "LIA" and omits BSAS;
  the stores document names "Parkson Pavilion" and "Langkawi Airport" and includes BSAS. We
  built from the stores document.
- **Consignment margin rates.** Six placeholders, clearly labelled as such on the Stores
  screen.

---

## 3. The 96 questions

### What was missing, and has now been built

Three answers were in the discovery form and not in the system. All three are now in.

**Online sales (Q5, Q13).** *"Do you sell online as well — your own website, Shopee, Lazada,
TikTok Shop? Should those sales appear in this system too?" — **Yes**. "Should the website
and the shops share the same stock numbers?" — **Yes**.*

Online is now a fourth channel alongside main, dealer and consignment. Four storefronts —
the Legendary website, Shopee, Lazada and TikTok Shop — file daily like a shop, but are
marked as **not holding their own stock**: an online order is picked from the warehouse, so
those locations have no nightly count and never raise a top-up. That is what "share the same
stock numbers" means in practice. They appear in every channel filter, every revenue split
and on the Targets screen.

*Please confirm which platforms you actually run.* The four are taken from the wording of
the question itself.

**Promotions (Q59).** *"Davy plan in advance, Chloe record in system, and inform Imran."*

There is now a Promotions screen. Davy plans, Chloe records, and the screen **chases the
third step** — a promotion that has not been passed to Imran shows in a banner and in its
own counter, because that is the step most easily forgotten. Imran has the screen in his own
navigation so he can read what he has been told.

A promotion never changes a figure. You record only revenue (Q58) and do not want the system
minding what each shop charges (Q60), so this is context sitting beside the numbers rather
than arithmetic applied to them — the reason an unusual week was unusual, on the screen next
to the week.

**Setting targets (Q68).** *"How are sales targets set? — Davy."*

There is now a Targets screen. Only Davy can set them; everyone else sees the same numbers
without the input boxes. Each store's target sits beside **what it actually took last
month**, and a "copy last month" button fills the empty ones as a starting point — setting a
target against nothing is how targets end up wrong. Dealers are excluded: they buy from
Legendary rather than sell on its behalf, so a sales target does not belong to them.

Per Q69, a target is a single figure per store per month with no history behind it.

**A full activity log (Q67).** *"Do you need a record of who changed what and when?" —
"Accounting side will handle."*

The client has since asked for it in the CRM, and they were right to. Every action that
changes anything now writes one line — what happened, who did it, and when — on a new
**Activity** screen: filterable by person, category and date, and exportable.

Three decisions inside it are worth stating:

- **The log never contains a PIN**, old or new. It records that one was changed, and by
  whom. A log of PINs would undo the point of encrypting them.
- **Looking at somebody's PIN is itself an action** and leaves a line, which is what makes
  the arrangement in [`pin-security.md`](./pin-security.md) defensible rather than merely
  permitted.
- **It is append-only in the database.** The insert and select policies exist; the update and
  delete policies do not, and under row-level security an operation with no policy is denied.
  Nobody can tidy the log — not the Managing Director, not IT.

The database writes its own copy through a trigger on every table that matters, so a change
made by a script or a psql session is recorded the same as one made through a screen. An
audit trail the application can forget to write is an audit trail with holes in it.

**Who reads it:** the Director, Davy, Kelly, Chloe and Imran. Finance and the Warehouse are
left out on purpose — the log records who looked at whose PIN, which is not theirs to read.
The chart says Finance can access all data, so **this is a judgement call and one line to
change** if the client disagrees.

### Everything else, section by section

| Section | Status |
|---|---|
| **About the business (1–7)** | One company (Q1) · 5 new shops a year, Malaysia only (Q3) · under 50 users (Q4) · dealers, consignment and samples (Q6) · accurate daily sales, SKU management and country data is the whole point (Q7) — that is what the Overview leads with |
| **Software you use (8–15)** | Zeoniq where it exists, manual at airports and department stores (Q8) — the *Record a sale* screen assumes manual · SQL Accounting stays the book of record, no cost price anywhere (Q9, Q58) · stock in SQL and spreadsheets today (Q10) · **Q11 superseded** — PIN sign-in, not Gmail · no customer list, 3 years of sales, countries start fresh (Q12) |
| **Closing the day (16–26)** | Once per shop per day (Q16) · anyone may close, no second check (Q17) · 11pm cut-off, and Davy, Kelly and Chloe are told if a shop forgets (Q18) · corrections for 3 days, Kelly approves (Q19) · every perfume counted every night (Q20) · total plus a cash / e-wallet / card split, no float, no cash-on-hand (Q21) · no store-side adjustment for exchanges (Q22) · staff purchases recorded separately (Q23) · figures exclude SST (Q24) · testers, damages and samples written off, by Kelly or Davy only (Q25) |
| **Customers (27–34)** | Counts by country, no personal records (Q27) · staff ask (Q28) · **exact nationality per perfume, main outlets only** (Q29) — recorded on each sale line, and a country filter therefore *excludes* dealers and consignment rather than estimating them, which the screen says out loud · no tax-refund paperwork (Q30) · no loyalty scheme yet (Q31) |
| **Stock (35–44)** | Stock belongs to the shop once it leaves, HQ counts for its own purposes (Q35) · one warehouse (Q36) · reorder by human feeling for now, so suggestions are advisory (Q37) · no shop-to-shop transfers (Q38) · Kelly sorts out short or damaged deliveries (Q39) — recorded as a note on the receipt · no batch, expiry or serial numbers (Q40, Q41) · nightly count (Q42) · Kelly and Davy adjust missing stock (Q43) · testers are not separate stock (Q44) |
| **Orders (45–52)** | The demo chain confirmed (Q45) · Kelly approves all (Q46) · nothing above the MD (Q47) · **Q48 conflicts with the chart — see above** · no supplier orders (Q49) · urgent handled manually (Q50) · printed form comes from SQL (Q51) · no back-orders, the shop asks again (Q52) |
| **Products (53–60)** | 19 products, 9 named so far — the Products screen says so rather than pretending (Q53) · every size, refill, travel size, gift set and tester counted separately (Q54) · Chloe adds products, no approval needed (Q56) · no barcode scanning (Q57) · **no cost price or profit anywhere**, one margin per consignment partner (Q58, Q65) · promotions now built (Q59) · shops may retail at their own price; only Legendary's revenue is recorded (Q60) |
| **People (61–67)** | ⏳ Staff list still to come from Chloe (Q61) — the two promoter logins are placeholders and marked "Name to confirm" · seven roles confirmed correct (Q62) · Kelly covers all shops (Q64) · pay and cost data excluded entirely (Q65) · Imran and Chloe create logins (Q66) — now Davy and Kelly too, per your instruction · **full activity log built (Q67)** — see below |
| **Targets and reports (68–74)** | Targets screen built (Q68) · no target history (Q69) · no commission (Q70) · **Pavilion KL, KLIA T2 and KLCC Isetan pinned to the top of Davy's Overview** (Q71) · ⏳ the hand-made reports were sent to Imran and we have not seen them (Q72) |
| **Alerts (75–77)** | In-system notifications only, no email or WhatsApp (Q75) · Davy, Kelly and Chloe on every alert (Q76) |
| **Where it is used (78–84)** | iPad at the counter — the closing flow and the keypad are built finger-first (Q78) · phone and laptop at head office (Q79) · **no offline mode**, closing goes on paper if the connection drops (Q80) · website, no app store (Q81) · ⏸ Malaysia hosting — open question, see the deployment note (Q82) · Imran is the IT function (Q83) · English only (Q84) |
| **Data and rules (85–90)** | ⏳ 3 years of Excel history to migrate, sample not yet received (Q85, Q86) · no personal data, so no privacy notice needed (Q87) · 10-year retention is a backup policy (Q88) · full export is `pg_dump` (Q90) |
| **Getting started (91–96)** | ASAP (Q91) · Chloe trains the shop staff (Q93) — which is why one sign-in mechanism for everybody matters · success is "getting accurate information" (Q94) · nothing to remove from the demo (Q95) |

---

## What is genuinely still outstanding

Nothing in the three documents is unbuilt. What remains is **information we do not have**,
not features we have not written:

| # | What we need | From | Why it matters |
|---|---|---|---|
| 1 | The full product list — all 19, every size, set and tester, with prices | Davy | The system carries 22 SKUs across 10 products; the rest are invented placeholders |
| 2 | Staff names and roles for every login | Chloe (Q61) | Two promoter logins are placeholders; PINs cannot be issued to people we cannot name |
| 3 | Consignment margin rates for all six partners | Finance (Q58) | Six placeholders currently |
| 4 | Dealer towns or states | — | 56 dealers cannot be grouped by region |
| 5 | What "BSAS" is | — | Listed as a main store, unplaceable |
| 6 | Which online platforms you actually run | Davy | Four assumed from the wording of Q5 |
| 7 | A Zeoniq export — one busy day and one full month | Imran (Q8) | Decides which of three integration shapes we build |
| 8 | An Excel sample of the 3 years of history | — (Q86) | Sizes the migration |
| 9 | The reports made by hand today | Imran already has them (Q72) | May reveal a screen we have not thought of |

And three decisions only the client can make:

- **Q48 vs the chart** — when Kelly and Davy are both away, does Finance approve or does the
  order wait?
- **Q82** — is Singapore hosting acceptable, or must the servers be physically in Malaysia?
  This is the difference between RM 60 a year and roughly RM 6,000.
- **PIN visibility** — should senior staff be able to *look up* a colleague's current PIN, or
  is *setting* them a new one enough? See [`pin-security.md`](./pin-security.md).
- **Who reads the activity log** — currently the Director, Davy, Kelly, Chloe and Imran.
  Should Finance be included, given the chart says they can access all data?

---

## One thing we would recommend adding, which the client did not ask for

**Recording a short or damaged delivery when a shop confirms it arrived.**

Q39 answers *who* sorts it out (Kelly, later the warehouse stockkeeper) but not whether the
system should capture it. Today a promoter confirming receipt can write "two bottles short"
in the note, which is honest but leaves the stock number wrong until the next nightly count
corrects it silently.

Capturing the shortfall properly — received quantity per line, not just a note — would make
the stock figure right the same evening. It is about a day's work. We have **not** built it,
because it goes beyond what you asked for and it changes what the warehouse sees. Worth a
sentence from Kelly on whether it is wanted.
