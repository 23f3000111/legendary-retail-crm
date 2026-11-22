# Who rejected, the Overview's dates, Stores' calendar, products on Stock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The developer's message of 22 November, nine points with screenshots, confirmed the same day:
1. The Orders list says who rejected each rejected order.
2. The Overview's consignment and dealers open on their figures, not the ring.
3. Consignment left, dealers right on the Overview, and consignment before dealers everywhere.
4. A From and To under "Good morning" drives consignment, main stores, dealers, best sellers and the countries.
5. Every row of a table has its own colour: no grey from the seventh on.
6. Davy, Kelly and Chloe add, remove and re-price products, and arrange them, from the Stock page; Finance only arranges (its outlets, as since 20 November).
7. The Stock export is a breakdown like Finance's reports: store by store, subtotals, a grand total, and a PDF.
8. On Stores the calendar sits under the boxes, and From and To move to the top of the page.
9. Spirit 1 vials counted together at closing: already live since 18 November; nothing to build.

**Architecture:**
- Pure helpers carry each rule, tested first: `rejectionOf`, the channel order, the palette, `showsFigures`, `priceChanges`, the stock report.
- The pages use them. The product changes go through the existing `saveProduct`, `removeProduct`, `restoreProduct` and `saveProductOrder`, so nothing new reaches the server.
- No server change.

**Tech Stack:** React 18 + TypeScript, zustand, framer-motion `Reorder`, vitest.

**Spec:** the developer's message and the answers of 22 November (in the session). The record goes into `docs/spec/2026-11-22-orders-overview-stock.md`.

## Global Constraints

- **Channel order:** main, consignment, dealers. It applies to every switch, list, picker, table and export.
- **Partner months:** a month counts in some dates when its 1st is in them, as on Revenue.
- **Overview dates:** they drive consignment, main stores, dealers, best sellers and the countries only. The four boxes, "Who is selling" (today, live) and the calendar stay as they are. With no dates, the page is as it was. The founder's version has none of those sections and gets no dates.
- **Product controls:** only `canEdit && manageCatalogue` (Davy, Kelly, Chloe). Chloe gains the Stock page. Finance, the founder, the warehouse and promoters see no controls.
- **Palette:** slots 1–6 stay as they were, so nothing already drawn changes colour. Slots 7–12 are validated with the dataviz checker on white. Slots 13–48 are distinct, for long tables only.

## Review Focus

1. Live data arriving after the first draw (the live site): the figures must show without a tap.
2. Overview dates holding no month's 1st (5 to 20 Nov): the partner panels say so. They must not look broken.
3. A promoter exporting stock: only their own store.
4. Adjust prices with one bad line among good ones: nothing is saved until every line is right, and the bad one is named.
5. An order rejected, sent again and rejected again: the latest rejection is shown.

---

### Task 1: Pure layer

**Produces:**
- `rejectionOf(po): { by: string; role: Role; at: string; note?: string } | null` in `src/lib/po-machine.ts`. It returns the latest `rejected` event while the order stands rejected.
- `CHANNELS = ['main', 'consignment', 'dealer']`.
- `SERIES` (12), `SERIES_EXTRA` (36), and `seriesColor(i)`, which is distinct for i < 48 and never `OTHER`.
- `showsFigures(table, chartChosen)` in `ChartFrame.tsx`.
- `priceDraft(sku)` and `priceChanges(lines, drafts) → { changes: ProductInput[]; problems: Record<skuId, string> }` in `src/lib/prices.ts`.
- `buildStockReport(data, locationIds)`, `stockCsvBlocks(r)`, `stockPrintSpec(r)` and `stockFilename(r)` in `src/lib/stockReport.ts`.
- `NAV.pa` gains `/stock`.

- [ ] Tests first: `po-machine.test.ts`, `analytics.test.ts` and `outletOrder.test.ts` (the order), `palette.test.ts`, `ChartFrame.test.ts`, `prices.test.ts`, `stockReport.test.ts`, `nav.test.ts`. Watch each fail, implement, suite green, commit.

### Task 2: Orders

- [ ] The Status column says "by <name>" and the time under the Rejected chip. Progress shows the reason. The CSV gains Rejected by, Rejected on (Malaysian date) and Reason.

### Task 3: Overview

- [ ] `ChartFrame` uses `showsFigures`.
- [ ] Order: Consignment | Main stores | Dealers.
- [ ] From and To under the greeting, kept in `useViews.overview`. Partners use `selectPartnerPeriod`; main stores use `selectStoreTotals` on main; best sellers and the countries use the dates; pop-ups use `datesChoice`.
- [ ] `toSlices` folds past `SERIES.length`.

### Task 4: Stores and the channel switches

- [ ] Stores: From, To and Clear move to the page header, beside CSV and PDF. The calendar moves under the boxes (or under the header, for Finance) and jumps to the month of To. Arrange joins the panel's controls.
- [ ] Switches: Stores, Closings and Promotions read Main · Consignment · Dealers. The SalesReport store groups follow `CHANNELS`.

### Task 5: Stock

- [ ] Top right, for those with the controls: Arrange (`ArrangeRange` in place of the table), Adjust prices (`priceChanges`), Remove (take off, with what was taken off and Put back), Add a product (`ProductEditor`). Each row gets a pencil and a cross.
- [ ] Export: the breakdown CSV. A promoter exports only their store. A PDF report button sits beside it.

### Task 6: Record and release

- [ ] Spec record, README test count, memory (consignment before dealers).
- [ ] Browser walk as Davy, Kelly, Chloe, Finance, the founder and a promoter, on desktop and phone.
- [ ] Merge, push, and check that both live hosts serve the new `assets/main-*.js`.
