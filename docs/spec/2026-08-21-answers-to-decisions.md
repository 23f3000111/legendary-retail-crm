# What the client's answers decide

**Date:** 2026-08-21
**Sources:** `Legendary_Perfume_CRM_Client_Discovery_Form.md`, `Legendary Company Hierarchy for CRM.pdf`,
`Legendary Stores for CRM.pdf`

This is the translation layer between what the client said and what gets built. Every line below
is traceable to an answer. Open questions are listed at the end — none of them block starting.

---

## The eight that shaped the build

| # | Answer | What it means |
|---|---|---|
| 3 | Max 5 new shops a year, Malaysia only | **No multi-company isolation, no multi-currency.** One organisation, one currency, one tax regime. Saves a large amount of foundation work. |
| 8 | **Zeoniq** POS; airports and department stores use the building owner's system | **No single integration solves it.** Zeoniq can feed the owned counters; everything else stays manual entry. The closing screen must be excellent at typed entry, not assume a feed. |
| 9 | **SQL Accounting** | SQL stays the book of record. The CRM does not post to it, and does not try to be it. |
| 27 | **Counts by country only** — no individual customer records | Settled: this is an **operations and reporting system**, not a customer-relationship database. No personal data, so no PDPA exposure (confirmed at Q87: "not relevant"). |
| 29 | **Exact nationality per product — main outlets only** | The demo's estimate is replaced by real capture. Main stores record country against each product line. Dealers and consignment do not. |
| 35 | Stock belongs to the shop once dispatched; CRM count is "for HQ purposes only, don't mix up with SQL" | The CRM tracks **quantity for visibility**, never valuation. SQL owns the money. This is a hard boundary. |
| 40 | **No batch, production or expiry tracking** | Stock stays a simple count per product per location. Avoids the largest single piece of work on the table. |
| 80 | If the connection drops, close the day on paper | **No offline mode.** Roughly halves the closing screen's complexity. |

---

## The structure that changed most

The demo assumed nine owned outlets that all behave the same. The real estate is **74 locations
across three channels that report differently**:

| Channel | Count | Reports | Countries? | Cadence |
|---|---|---|---|---|
| **Main store** | 12 (9 open, 3 coming) | Sales + product sold + country | **Yes, per product** | Daily |
| **Dealer** | 56 | Sales + product sold | No | Daily |
| **Consignment** | 6 | Sales + product sold + margin | No | **Monthly** |

Channel is now the primary dimension in the system. It decides which closing form a location
gets, what is asked for, and how often.

**Main stores** — Pavilion 5th Floor, Genting Sky Avenue, Melaka, Langkawi Airport, KLIA T2,
BSAS, Parkson Pavilion, Parkson KK Imago, KLCC Isetan, and three opening soon: Sogo 118, TRX,
Melaka Parkland Mall.

**Consignment** — Sasa, AirAsia, Eraman KLIA T1, Eraman KLIA T2, Eraman KKIA, Watsons.
Each needs a margin rate (Q58) — rates still to come.

---

## People and permissions

Taken from the hierarchy document, not from the demo's invented cast.

| Person | Role | Access |
|---|---|---|
| **Vins Lim** | Director (Founder) | All data — **read only, cannot edit** |
| **Lim Davy** | Managing Director | All data, edit. Approves changes and orders |
| **Chloe Chock** | PA to the MD | All data, edit |
| **Kelly Tew** | Operational Manager | All data, edit. Approves changes and orders |
| **Finance** — Siew Fang, Ivvi, Eunice, Apple | Finance | All data, edit |
| **Warehouse** — An, Loong, Low, Kim | Warehouse | Stock data only |
| **Store promoters** | Promoter | Data entry for their own location |
| **Imran** | IT | Creates and removes logins (Q66). Not on the chart, and his own login is hidden |

The read-only Director is a genuinely new requirement — the founder sees everything and changes
nothing. That is a permission mode the demo did not have.

Named responsibilities from the answers:
- **Kelly** approves every purchase order (Q46), approves closing corrections (Q19), writes off
  stock with Davy (Q25, Q43), handles delivery problems (Q39), oversees all shops (Q64).
- **Chloe** adds and edits products (Q56), records promotions (Q59), trains staff (Q93).
- **Davy** sets targets (Q68), plans promotions (Q59).
- **Davy and Kelly approve. Finance does not.** ⚠️ The discovery form (Q48) says Kelly, Finance
  and Davy share the authorisation; the hierarchy chart gives *"approves changes and PO"* to the
  Managing Director and the Operational Manager only. **We have followed the chart**, on the
  client's instruction. Finance instead *clears* an approved order for picking, which is a step in
  the chain rather than an approval. Please confirm this is what you want when Kelly and Davy are
  both away.
- **Davy, Kelly and Chloe** receive every notification (Q76).

---

## Daily closing — as it actually works

- **Once per day, per shop** (Q16). Not per shift.
- **Anyone at the counter may file it**, and nobody counter-signs (Q17).
- **Deadline 11pm.** Miss it and Davy, Kelly and Chloe are notified (Q18).
- **Corrections allowed for 3 days**, approved by Kelly (Q19).
- **Every product counted every night** (Q20).
- **Money: total only**, split three ways — cash, e-wallet, credit card. No opening float, no
  cash-on-hand, no banking step (Q21).
- **No SST** on the figures (Q24).
- **Staff purchases and staff discounts recorded separately** (Q23).
- **Testers used, damages and free samples are recorded**; only Kelly and Davy may write them
  off (Q25).
- Exchanges and damages are replaced from the warehouse — **the store makes no adjustment** (Q22).

## Orders

- Flow confirmed as demonstrated (Q45), with **Kelly approving all** (Q46).
- **No supplier or manufacturer orders** in this system (Q49).
- **No back-orders** — a partial delivery means the shop asks again (Q52).
- **Printed order forms come out of SQL**, not from us (Q51).
- Urgent requests are handled manually, outside the system (Q50).
- Reorder points are **human judgement for now**; after 3–6 months of real data the system should
  start suggesting them (Q37). Built as a switch we can turn on later.

## Products

- **19 products**, and **variants count separately** — sizes, refills, travel sizes, gift sets and
  testers each get their own line (Q53, Q54).
- Gift sets are packed in advance, not assembled from bottles (Q55).
- **No barcode scanning** (Q57).
- **Revenue only — no cost price, no profit anywhere in the system** (Q58, Q65). The single
  exception is a **margin figure for each consignment partner**.
- Shops may sell at different prices; we record only Legendary's revenue (Q60).

## Everything else

- **iPad at the counter** (Q78); phone and laptop at head office (Q79). Tablet-first layout.
- **Website only, no app store** (Q81).
- **English only** (Q84).
- **Notifications inside the system only** — no WhatsApp, no email (Q75).
- **A full activity log.** Q67 said the accounting side would handle the audit trail; the client
  has since asked for it in the CRM. Every action that changes anything is recorded with the
  person and the time, on the Activity screen, and the log is append-only in the database.
- **Six-digit PIN sign-in for everyone.** This supersedes the Q11 answer about Gmail, at the
  client's instruction. See [`pin-security.md`](./pin-security.md) for who may change and see
  whose PIN, and for the one trade-off it carries.
- **Hosted in Malaysia** (Q82).
- **3 years of history to migrate, from Excel** (Q85, Q86). Country data starts fresh (Q12).
- **10 year retention** (Q88), with a guaranteed full export (Q90).
- Success is defined as **"getting accurate information"** (Q94).
- The three numbers Davy checks first each morning: **Pavilion KL, KLIA T2, KLCC Isetan daily
  sales** (Q71) — these get pinned to the top of his screen.

---

## Open questions — do not block the build

1. **The full product list.** We have 19 as a count and 9 real names from the website. We need the
   actual 19 with every size, set and tester variant, and their prices.
2. **Consignment margin rates** for Sasa, AirAsia, the three Eraman counters and Watsons (Q58).
3. **What is "BSAS"?** Listed as a main store; we cannot place it.
4. **Dealer locations.** We have 56 dealer names but no towns or states, so they cannot yet be
   grouped by region. Q2 suggests many are souvenir shops in Kota Kinabalu.
5. **Two lists disagree.** Answer 2 names "Parkson Elite" and "LIA" and omits BSAS; the stores
   document names "Parkson Pavilion", "Langkawi Airport" and includes BSAS. **We are building
   from the stores document** — please confirm.
6. **Stock count cadence.** Q20 says every product every night; Q42 says a full count every day
   Monday to Friday. We read this as: shops count nightly, the warehouse counts on weekdays.
   Please confirm.
7. **Staff list** — Chloe was to send names and roles for every login (Q61).
8. **Sales history sample** in Excel, so we can plan the migration (Q86).
9. **Online storefronts.** Q5 and Q13 said online sales belong in the system and share the shops'
   stock, but named no platform. The system now carries four — the Legendary website, Shopee,
   Lazada and TikTok Shop, taken from the question itself — and treats them as picked from the
   warehouse rather than from a shelf. **Please confirm which of these you actually run**, and
   whether any others should be added.
10. **Zeoniq export** — one busy day and one full month, so we can size the integration.

---

## What "production" still needs beyond this build

This build delivers the complete working front end against realistic seeded data — every screen,
every role, every workflow, ready for sign-off. To put it in front of real staff it also needs:

- A server and database, with backups — see [`deployment-and-backend.md`](./deployment-and-backend.md)
- PIN sign-in wired to the database rather than the seeded data
- The Zeoniq feed for the counters that can provide one
- The Excel history migrated in
- Account setup for Imran to administer

Those are the next phase and depend on access to their systems.
