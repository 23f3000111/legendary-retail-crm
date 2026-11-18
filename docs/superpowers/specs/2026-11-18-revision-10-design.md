# Revision 10 — design (18 November 2026)

Inputs: `docs/client-input/CRM Revision 10.pdf` (headed "Revision #8", the
client's eighth) and the 16 November meeting with Davy
(`docs/client-input/2026-11-16 meeting notes.pdf` and the transcript beside
it). Approved in conversation on 18 November: build everything below,
Analytics included, and put it live once the tests pass.

## Why

Finance keys each store's day into the accounting system, usually on a
Monday for the weekend. Today they have to read a summary and dig for
prices, the day's closing stock is not shown, and the page is full of things
they never use. Davy wants the sales reporting in one place (Analytics), the
product lists in the order of their own stock sheet, and closing easier on a
busy night.

## Goals

1. **Finance's store page**: a calendar; tap a day and see that day only —
   every product with its price as sold, deducted, sales and **on hand at
   that day's close**; cash and card; customers by country. Nothing else.
2. **Everyone's store page**: Days left and Status gone; the sales report
   gone; the calendar straight under the four boxes, driving the same day
   detail.
3. **Stores list**: sales report gone for everyone; for Finance the four
   boxes go too and the stores table comes first.
4. **Overview**: dealers (and consignment) shown as soon as any are keyed in;
   a consignment chart beside dealers and main stores, above Best sellers.
5. **Analytics**: one date choice (presets or any From–To) drives the whole
   page, and only those dates are shown: totals per store, per product and
   per country (every country, no "Other"). The four windows, the separate
   sales report and the 14-day sparkline column leave the page.
6. **Exports** follow the dates and filters and carry the detail: each
   product, each date it sold (units, selling price, net sales), a subtotal
   per product, zero rows left out; payment; closing stock; customers.
7. **Product order**: the client's stock-sheet order everywhere products are
   listed, vials after the bottles in the client's vial order; Davy, Kelly
   and Chloe can rearrange it on Products, shared by everyone.
8. **Closing**: the 3ml vials of Love/Hope/Confidence, Passion/Dream/Life and
   Wish 1/2/3 are counted as one figure each — at closing only.
9. **Orders**: Davy, Kelly and Chloe see the store's on-hand for each line as
   at the day the order was placed; Kelly's (the approvers') notes are green;
   other notes can be hidden.
10. **Sogo 118** opens; every KL promoter can pick it.

## Non-goals

- The website/CMS launch (another project).
- Renaming products (Davy mentioned names "may change"; only the order was
  agreed). Add and remove stay with Davy, Kelly and Chloe, as now.
- Changing notes after they are written (kept unchangeable, as agreed).
- Zeoniq's exact layout: the example report is a blurry screenshot only. The
  exports follow its shape; the format can be matched once the PDF arrives.

## Anti-goals

- No change to how revenue, sales, orders or stock are recorded per product.
  Vials are combined on the closing count screen and nowhere else.
- No loss of data: a combined count still writes a count for every vial.
- No new load on the server beyond one small document.

## Approaches considered

**Where the product order lives.**
(a) A `position` on every product record — rewrites ~60 records per move and
needs a record for every built-in line. (b) **One shared document** listing
the line ids in order (chosen) — one write per change, the built-in list stays
as it is, a line added later falls in at the end of its section.
(c) Hard-coded only — fails "without asking the developers".

**How a combined vial count becomes three counts.**
(a) **Split in proportion to what each should hold** (chosen): when the
count matches, each vial keeps exactly its expected figure; a difference is
spread by share, largest remainder, never below zero. On a change to a filed
day, the split follows what was filed, and an unchanged total keeps the
filed figures untouched. (b) Store one combined count and stop knowing each
vial — breaks every per-vial screen, which the client said stay untouched.

**Analytics.** (a) Keep the page and add custom dates. (b) **Make the page
filter the report** (chosen): presets plus From–To on the filter bar, every
panel reads only those dates, the sales report panel goes because the filter
already has its store, item and nationality rules, and the exports become
the detailed report. (c) Wait for drawings — declined.

## Design

### Product order
- `products.ts`: `CLIENT_ORDER` (sku ids, from the PDF) and
  `applyCatalogue(entries, order?)` sorts `skus` by section (sold lines,
  then vials, then testers), then by position in the saved order or else the
  client's, then by built-in position. `products` (fragrances) follow the
  first line of each. Derived lists (`sellableSkus`, `countedSkus`…) follow.
- The four lines missing from the PDF (Spirit 2 Set, Dream 50ml, 3 Wishes
  Travel Kit, Nyonya Travel Kit) go after Hope. Mahsuri's second vial entry
  is ignored. "LOVE/CONFIDENCE/HOPE EDP 15ML" are the 50ml bottles on the
  range.
- New document kind `product_order`, id `range`, `{ skuIds }`, written by
  md/ops/pa, signed by the server (`changedBy`, `changedAt`), checked by
  `_product_order_refusal` (SQL) and `productOrderRefusal` (local twin).
- Products page: **Arrange** — drag or arrow keys within each section,
  Save, Cancel, "Back to the client's order". Logged.
- The sample-history generator keeps the built-in order, so the demo data
  and the tests built on it do not move.
- Rankings stay ranked: Best sellers, Best sellers here, a country's
  products, chart bars. Order lines keep the order the store dragged them
  into (Revision 8).
- Record a sale: the bottles by fragrance, then a "3ml vials" group.

### Closing vial groups
- `COUNT_GROUPS` in `products.ts`: Spirit 1 vials (love, hope, confidence),
  Spirit 2 vials (passion, dream, life), 3 Wishes vials (wish 1–3).
- `lib/counting.ts` (pure, tested): the shelf as rows — single lines and
  groups in range order, a group where its first member sits; `splitCount`;
  turning the typed boxes into `StockCount[]`.
- `CloseDay`: one box per group; sold, should-be and filed are the group's
  sums. `describeClosingChanges` reports a group's change as one line.

### Store page (`StoreDetail`)
- Finance: header → calendar (choose a day) → the day.
- Others: header → four boxes → calendar → the day → best sellers here →
  where they came from → orders → revenue graph. Sales report removed.
- The day (`StoreDay`): boxes for sales, cash, card (e-wallet if any) and
  customers; the stock table in range order — price as sold, deducted, sales,
  on hand at the close (all rows, totals at the foot, tap for movements);
  customers by country with totals; CSV and PDF of the day. Today reads live
  and says the count comes at closing; a day not filed says so.
- The selected day starts on the last day filed; the calendar marks it.
- Dealers and consignment: a table of the months keyed in instead of the
  calendar.

### Stores list (`Locations`)
- Sales report removed. Finance: no four boxes; table, calendar, pipeline.

### Overview
- `latestPartnerMonth`: the latest month up to last month with any figure
  (this month only if nothing earlier); partners without a figure are left
  out; "4 of 44 keyed in".
- Dealers, Main stores and Consignment side by side, above Best sellers;
  Who is selling follows the same month rule.

### Analytics
- Filter bar: 7/30/90 days, This month, Last month, Dates (From–To).
- Selectors read every panel by the four boxes' rules (days that have ended
  as filed, today live): period totals with customers and the change on the
  period before; stores; products (range order); countries in full; channels;
  the daily series.
- Panels: boxes (sales, units, customers, stores that sold) → country basket
  when one country is chosen → countries + channels → products → stores →
  trend and trading pattern.

### Exports (`lib/detailReport.ts`)
- One builder for a filter: sales by product (product × date × store ×
  price, product subtotals, total), payment (main stores' closings: cash,
  card, e-wallet), closing stock (store × date × product: deducted, on hand),
  dealers' and consignment months where nothing narrows by product or
  country, and customers by country.
- CSV: those sections one after another. PDF: boxes, rules, a chart and the
  same sections; the PDF folds stores together by product and date unless
  one store is chosen. `printReport` gains titled sections with subtotal
  rows.
- Used by the store page's day and by Analytics.

### Orders
- `selectOnHandAtOrder(data, po)`: the latest closing count for the store
  filed before the order was sent (its first "sent" event, else when it was
  raised).
- `PoLines` and the Approve window show it to Davy, Kelly, Chloe and Vins.
- `PoTimeline`: notes by Kelly or Davy (approvers) in green with their name;
  "Hide other notes" (remembered on the device) folds every other note,
  the store's included. Finance's clearance moves off green to the primary
  colour so green means Kelly.

### Sogo 118
- Opened in `locations.ts`; `0003_locations.sql` regenerated; KL promoters
  get it from the town list. The sample history skips a store with no
  footfall weight, so the demo does not move.

## Constraints

- Live server with real staff data: SQL first in a rolled-back dry run, then
  `scripts/migrate.mjs`, then `scripts/verify-server.mjs`; then push to main
  (the deploy workflow publishes). Nothing on the server is wiped.
- `src/api/local.ts` and `0001_init.sql` stay twins.
- `position: sticky` does not work in this app; nothing new relies on it.
- Every figure comes from a selector; screens do not aggregate.

## Left to the builder

Copy on screen, the exact CSV column names, colours within the existing
palette, and test structure.
