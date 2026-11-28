# Vials, on hand, and sales changed after closing — 26 November 2026

The client's *Revision #10* (our Revision 12) has three points, on Finance's
store page and the promoter's closing. Nothing on the server changed, and no
SQL was run. The live figures below were read in a read-only transaction that
was rolled back.

| Asked | What changed |
|---|---|
| "Please help to confirm ALL stores vial will update the deducted stock everyday" | A vial's **Deducted** comes from its count |
| "For KLIA T2, On hand quantity not displaying (Help to make sure ALL stores shows correct on hand quantity)" | A count of every product at 0 is no count, and a box the record cannot back starts empty |
| "If promoter changes any sales, it won't reflect in the final closing of the day" | Today's closing follows the sales |

## A vial's Deducted

Vials are given away with a purchase. Many counters never ring them up: in
the two weeks to 25 November, Pavilion 5th Floor recorded no vial at all and
KLCC Isetan recorded vials on one day only, while both stores' vial counts
fell every night. So their Deducted read 0.

A vial's Deducted is now what its count says left the shelf, where that is
more than was rung up: the last count, plus what arrived since, less the
count at the close. Where more was rung up than the count says, what was rung
up stands. It applies at every store, on the store's page, on the promoter's
closing as the boxes are typed, on a closed day, and in the CSV and PDF
(`offTheShelf` in `src/store/selectors.ts`).

- A **bottle's** Deducted is unchanged: what sold and was written off. A
  bottle's count that is short of that is a difference to look into, not
  stock that was deducted.
- Vials counted **three at a time** (Spirit 1, Spirit 2, 3 Wishes) each get
  a share of the three's count, so each vial's Deducted is its share. The
  three's total is exact.
- On the day after a day **nobody closed**, the count covers both days, so
  a vial's Deducted does too.

## On hand

### What the live server showed

- **KLIA T2** filed every product at 0 on every closing from 3 October to
  25 November, while selling every day (12 units on 25 November). Its first
  two closings, on 1 and 2 October, counted 8 units and then 1. It confirmed
  receiving one order, of 1,326 units, on 12 November, and still filed 0.
- Each box starts at what the shelf should hold. With a last count of 0 and
  sales since, that came to 0, and the 0 was filed.
- The other main stores' counts look like real counts: a few products at 0
  each, and the totals move with the sales and deliveries.

### What changed

- **A count that put every product at 0 is no count** (`countOfNothing`).
  - The Stock page and the alerts read that store as not counted. Its lines
    show **Not counted** instead of out of stock, and no top-up is suggested
    for it, on the Stock page or on its closing's order, until it counts.
  - Its day on the store's page and in the exports shows no on-hand figure,
    with a note saying why. The promoter's closed day says the same.
  - The next closing says *Count everything tonight*: every box starts
    empty, even for a delivery since, because what was on the shelf before
    the delivery is not known either. The delivery shows beside the box.
- **A line that has sold more than was on record** since its last count, at
  any store, starts empty, marked *More sold than was on record — count it*
  (`knownLines` in `src/lib/counting.ts`). The record is the last count plus
  what arrived since.
- **A closing with every box at 0, on a day that sold, is refused**:
  "Every product is at 0, though 12 were sold today — count what is on the
  shelf and type it in." On a day with no sales it is allowed: a new store's
  shelf can be empty before its first delivery.

KLIA T2's days already filed keep their zeros as filed. They now read as not
counted. Its on hand is right from the first closing it counts.

## Sales changed after closing

Before, a sale rung up, changed or deleted after today was closed left the
closing as it was, and the screens asked the promoter to *Update the
closing*. Now the closing follows the sale at once (`withSale` in
`src/lib/changes.ts`, `followSales` in `src/store/useData.ts`):

- The sale's lines as they were come off the closing, and its lines as they
  are go on. Lines are matched by id, so every other line the closing
  carries stays exactly as it was.
- The total follows. The **cash** stays as typed and the **card** takes the
  difference, as the closing form itself works it out. Where the sales now
  come to less than the cash, the cash comes down to match.
- The **counts** stay as counted.
- It is written to the activity log as its own line, *Closing brought up to
  date with the sales*, with what changed.
- It happens only where the closing could be changed outright: today's, by
  the store or by Kelly or Davy, and not while a correction waits on it.

Record a sale says *Today is closed* once the day is filed, and that the card
takes up the difference. A sale paid in cash is put right with **Change the
closing**. The notice *The sales have changed since today was closed* stays,
for the rare case another phone changed a sale before reloading this version.

## Calls made along the way

- **"Deducted" for a vial** was read as what left the shelf, whether rung up
  or not. The promoters were not asked to ring up every vial.
- **KLIA T2's past days were not changed.** The live data was only read.
  Correcting those closings is a decision for the client; the app now shows
  them as not counted.
- **Cash after a change.** A sale has no payment method of its own, so a
  change after closing goes on the card, as the closing form does with
  whatever is not typed as cash.
- **The server does not check counts.** A closing of every product at 0 is
  refused by the app, not by the server. If the server should refuse it too,
  `_closing_refusal` in `supabase/migrations/0001_init.sql` and its twin
  `closingWriteRefusal` in `src/lib/editing.ts` are the two places.
- **Two phones at once.** Each phone brings the closing up to date from its
  own copy. If two people change the same closing within a few seconds, the
  later write wins, as with any change to a closing.

## 27 November: KLIA T2 still filed 0

The developer reported that KLIA T2 was still not updating. The live server
showed why: KLIA T2 filed 26 November at 23:01 with every product at 0 and
22 units sold, six hours after this version went live at 17:00. The new
closing cannot file that, so the phone was still running the version from
before. A page left open ran the version it opened with until somebody
reloaded it.

- **The server refuses it now**, whatever version sends it:
  `_closing_refusal` in `0001_init.sql`, and its twin `closingWriteRefusal`
  in `src/lib/editing.ts`. A count of every product at 0, on a day that sold,
  is refused when it is filed, or when a change turns the counts into it. A
  day filed that way before can still be changed, as long as its counts stay
  as they were. Tried first on a copy against every closing on the server:
  only KLIA T2's 53 such closings would have been refused, and none when
  written back unchanged. Applied with `scripts/migrate.mjs`;
  `scripts/verify-server.mjs` passed 76 of 76.
- **An open page now picks up a new version** (`NewVersion`,
  `src/lib/appVersion.ts`). It asks every five minutes, and whenever it comes
  back to the front, which version is live. Once another is, the next tap to
  another page opens it, after anything on its way to the server has arrived.
  A line at the top offers *Open it now*. A page that is already open, on
  today's version or an older one, does not have this yet: it gets it the
  next time it is reloaded.
- **The live data, after the release:** no sale was changed after a closing
  on the same day, so the closing has not had to follow one yet. The vials'
  Deducted, worked out by the new page on the live data, reads 58, 76 and 64
  at Pavilion 5th Floor (24 to 26 November) and 14 and 18 at KLCC Isetan (25
  and 26 November), where nothing was rung up.

## 28 November: on hand worked out from the record

The developer sent KLIA T2's Stock page, every line *Not counted*, and an
Orchid pop-up showing +120 came in and −108 went out with no on hand: "why
is data not showing, also On hand is not showing anywhere". KLIA T2 had not
closed since 26 November, so its last count was still the one at 0.

Where a store's last count put every product at 0, on hand is now what the
record works out (`selectWorkedOut` in `src/store/selectors.ts`). It starts
from the last real count before it, or from nothing where there is none, and
goes day by day: what sold and was written off comes off, then what was
confirmed received goes on. It never goes below 0, because a sale with
nothing on record came from stock nobody recorded. That makes it a floor:
stock the store had before the app knew of it is not in it.

- **Everywhere on hand shows**, the figure carries **≈**, with a note saying
  why: the Stock page, its tiles, the all-stores grid and the CSV/PDF; a
  product's pop-up, whose list says *Worked out · 65 on the shelf by the
  record*; the store's day and the promoter's closed day; and the exports,
  with *On hand from: Worked out* in the CSV.
- **The store's next closing** starts every box at that figure, plus what
  came in since, less what sold, titled *Check every box against the shelf*.
  Its count then becomes the real one. A line that has sold more than the
  record says it had still starts empty, to be counted.
- **Low and out-of-stock** read from the figure, so top-ups are suggested
  again.

On the live data, worked out read-only: KLIA T2's Stock page shows about
1,079 units (Orchid ≈65, Violet ≈55), 1,103 at its 26 November close, and
its next closing starts 32 of its 33 boxes filled in. No other store is
affected. Nothing on the server was changed.
