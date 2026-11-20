# Revenue, Stores and Analytics: pop-ups and dates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do what the developer asked on 20 November (second message): Finance's Revenue page without the four tiles or Written off, with the sales report back (dates *between* only, rules folded) and units in detail, the dealers beside consignment, and By channel showing all three channels; Stores and Analytics with From/To calendars, a store's details in a pop-up before its page, and filters that survive leaving the page. Then check *Legendary CRM Amendments #7* (our Revision 9) on the running app.

**Architecture:** One new selector (`selectStorePeriod`) feeds one shared pop-up (`StoreSalesModal`) used on Stores, Analytics, Revenue's report and the Overview. The sales report comes back from git (`63f9a47^`) reworked. Page state that must survive navigation lives in a small zustand store persisted to `sessionStorage`. No server change.

**Tech Stack:** React 18 + TypeScript, zustand, Tailwind, vitest (pure layer only).

**Spec:** the developer's message of 20 November (in the session) and `docs/client-input/CRM Revision 9.pdf` (= the root `Legendary CRM Amendments #7.pdf`, byte-identical). The record of what changed goes to `docs/spec/2026-11-20-revenue-stores-analytics.md`.

## Global Constraints

- Figures read as everywhere else: days that have ended as filed, today live, a keyed-in partner month on its 1st (`eachLineIn`, `salesIn`).
- No "equal" anywhere in the report: the business date is *between* two dates; store, item and nationality are "one of these".
- A pop-up first, then **Open full detail** to `#/stores/<id>`.
- The live server is not touched; nothing in `supabase/` changes.
- Product lists that rank stay ranked; lists of the range keep the client's order.

## Review Focus

1. A dealer or consignment partner opened in the pop-up: no lines, a keyed month — the pop-up must say so, not show zeros as if nothing sold.
2. Today inside the chosen dates: read live once, never with today's closing as well.
3. Analytics' saved filter after midnight or after switching to sample data: dates past today must be pulled back.
4. Finance keying in on Revenue: the save bar must not cover the page when nothing is waiting to be saved.
5. A month on By channel with no partner figures yet: main stores alone, and the page says the partners are not keyed in.

---

### Task 1: The pure layer

**Files:** `src/store/selectors.ts`, `src/store/storePeriod.test.ts` (new), `src/store/selectors.test.ts`, `src/store/analytics.test.ts`, `src/lib/views.ts` + `src/lib/views.test.ts` (new), `src/components/layout/nav.ts` + `nav.test.ts`.

**Produces:**
- `selectStorePeriod(data, f: Filter, locationId): StorePeriod` — `SalesFigure` plus `skus` (`{skuId,label,code,units,revenue,prices: SoldAt[]}`, most units first), `countries` (most customers first), `days` (`{day,revenue,units,customers}`, oldest first), `tender` (`{cash,card,ewallet,days}` summed over the filed days in range, or null; null whenever products or countries narrow), `months` (partner months whose 1st is in range: `{month,revenue,keyed?}`).
- `selectSalesReport(...)` also returns `skus: {skuId,label,units,revenue}[]`, most units first.
- `restoreFilter(saved: unknown, today): Filter | null` and `restoreRules(saved: unknown, today): ReportRule[] | null` in `src/lib/views.ts`.
- Finance's nav without `/partners`.

- [ ] Tests first: pop-up totals equal Analytics' store total for the same filter; prices per product (198 ×1, 188 ×2); countries by customers; days; tender summed and null when narrowed; a dealer's keyed month in `months` and in `revenue`; today live once.
- [ ] Sales report `skus` honours item and nationality rules, sums to the report's units and revenue.
- [ ] A month's channels (`selectChannelTotals` over `monthDates`) include the dealers' and consignment months keyed in.
- [ ] `restoreFilter`: fills missing lists, pulls dates past today back, refuses junk. `restoreRules`: keeps a date rule as *between*, drops unknown fields.
- [ ] `canOpen('finance', '/partners')` false; md, ops, pa true.
- [ ] Implement, watch each pass, full suite green. Commit.

### Task 2: The pop-up

**Files:** `src/components/StoreSales.tsx` (new), `src/components/charts/Donut.tsx` (`onSelect`), `src/pages/hq/StoreDetail.tsx` (`?day=`).

- [ ] `StoreSalesModal({locationId, periods, initial?, base?, onClose})`: switch between periods when there are several; Sales / Units / Customers / Paid boxes; products with prices; countries; days (tap one to see it alone); a partner's months; footer **Done** and **Open full detail** (`/stores/<id>`, with `?day=` for one day).
- [ ] `StoreDetail` opens on `?day=` when it is a real day up to today.
- [ ] `Donut`/`DonutTable` take `onSelect(key)` as an alternative to `href`.

### Task 3: Revenue (Finance)

**Files:** `src/components/SalesReport.tsx` (restored from `63f9a47^`, reworked), `src/pages/hq/Finance.tsx`, `src/pages/hq/PartnerSales.tsx` (export the month form), `src/store/useViews.ts` (new).

- [ ] Four tiles and Written off gone. Sales report: Business date *between* From and To (yesterday by default), Store/Item/Nationality as **Add rule** chips, no equal/not equal; rows tap to the pop-up for that store and day; **What sold**, product by product; CSV with both blocks; PDF.
- [ ] Dealers & consignment side by side for a month (last month first), keyed in here by Finance; the save bar only while something is waiting.
- [ ] By channel for the same month: main stores, dealers, consignment. Export follows it.

### Task 4: Stores

**Files:** `src/pages/hq/Locations.tsx`.

- [ ] From/To above the table; with dates, Sales / Units / Customers for those dates only, CSV and PDF too; without, the four windows as before. Tapping a store (or one of its figures) opens the pop-up on that window or those dates. Dates and channel kept on leaving the page.

### Task 5: Analytics

**Files:** `src/components/FilterBar.tsx`, `src/pages/hq/Analytics.tsx`.

- [ ] From/To always showing beside the presets ("Dates" button gone). Filter and measure kept in `useViews` (sessionStorage), restored through `restoreFilter`. A store row opens the pop-up for the filter; the arrow column and the narrowing-on-tap go.

### Task 6: Pop-ups everywhere else a store is tapped

**Files:** `src/pages/hq/Overview.tsx`.

- [ ] Who is selling, Main stores · month to date, Dealers, Consignment, and the founder's three and his against-target cards open the pop-up (today, month to date, the partner's month, yesterday) instead of the page.

### Task 7: Check, record, release

- [ ] `npm test`, `npm run build`. Walk Finance, Davy, Kelly and the founder locally (screenshots), every Amendments #7 item included. Write `docs/spec/2026-11-20-revenue-stores-analytics.md` with the check. README test count. Merge to main, push, confirm the live bundle on both addresses.
