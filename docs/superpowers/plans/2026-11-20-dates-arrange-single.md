# Partner dates, outlets in your own order, single details folded — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The developer's third message of 20 November:
- Revenue's consignment and dealers each choose their own From and To, and dealers run highest first.
- Every list of outlets can be dragged into the person's own order.
- Analytics stops giving a whole section to a single line, such as "Revenue by channel" showing only Main stores.

**Architecture:**
- Two selectors read partner figures over dates. A month counts when its 1st is in the dates, as everywhere else.
- A pure helper orders outlets by a person's arrangement. It is kept per person on the device, as "Hide other notes" is.
- One Arrange window, the products' drag list again, serves every list. A small switch, "Highest first | My order", sits on the ranked lists.
- No server change.

**Tech Stack:** React 18 + TypeScript, zustand (persist), framer-motion `Reorder`, vitest.

**Spec:** the developer's message (in the session); the record goes into `docs/spec/2026-11-20-revenue-stores-analytics.md`.

## Global Constraints

- **Partner months:** a month counts in some dates when its 1st is in them (`inWindow(`${month}-01`)`).
- **Dealers:** on Revenue they open highest first.
- **Arrangement:** never changes anyone else's view.
- **Single details:** a section is hidden only when it would show exactly one line. Its line goes under Analytics' boxes, not away.

## Review Focus

1. Dates that hold no month's 1st (2 to 31 Oct): every partner at nothing, and the panel says why.
2. An arrangement saved before an outlet opened (TRX), or naming one that closed: new outlets join at the end, gone ones are ignored.
3. Keying in on Revenue while the list is sorted highest first: rows must not jump while typing.
4. Storage blocked (private window): arranging still works for the visit and nothing crashes.
5. Analytics filtered to one store: that store must still open its pop-up from the line that replaces the table.

---

### Task 1: Pure layer

**Produces:**
- `selectPartnerPeriod(data, channel, from, to)`: `{ months: string[]; rows: { locationId, revenue, months: {month, revenue, keyed?}[] }[]; total: number; withFigure: number }`, rows highest first.
- `selectChannelPeriod(data, from, to)`: as `selectChannelMonth`, over dates. `selectChannelMonth` becomes a wrapper.
- `inOutletOrder(rows, idOf, order)` in `src/lib/outletOrder.ts`: channel order main, dealer, consignment; arranged first; the rest in the usual order.

- [ ] Tests first (`analytics.test.ts`, `src/lib/outletOrder.test.ts`), watched failing, then implemented; suite green; commit.

### Task 2: Arrange anywhere

- [ ] `src/store/useOutletOrder.ts`: per person, localStorage, guarded. It holds each channel's arrangement and each list's mode.
- [ ] `src/components/ArrangeOutlets.tsx`: the drag window.
- [ ] `src/components/OutletOrderControl.tsx`: the switch and the Arrange button.
- [ ] Wire them into each list:
  - Stores
  - Analytics *By store* and its chips
  - Revenue's two panels
  - Overview *Who is selling*
  - Closings grid (mine always)
  - Dealer sales and the keying form (mine always)

### Task 3: Revenue by dates

- [ ] Consignment and dealers each have From and To, with last month first. They are kept for the tab.
- [ ] Each row taps through to its pop-up.
- [ ] **Key in a month** switches to the form; **Back to the dates** returns.
- [ ] By channel has its own From and To, and its CSV is in its corner.

### Task 4: Analytics single details

- [ ] Each section is hidden when it has one line:
  - By channel (one channel)
  - Which countries bought (one country)
  - Products (one product)
  - By store (one store)
- [ ] Under the boxes, a line for each hidden section. A country or store there opens its pop-up.

### Task 5: Check, record, release

- [ ] Tests and build pass.
- [ ] Walk Finance, Davy and Kelly locally.
- [ ] Spec section, README count, merge, push, confirm both addresses.
