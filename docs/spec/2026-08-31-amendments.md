# Client amendments — 31 August 2026

Twelve changes came back from the client after the walkthrough. Eleven are
built; one is on hold pending a decision. This is what changed and why, plus
four places where an amendment reverses one of their own discovery answers.

---

## What changed

| # | Asked for | Where it landed |
|---|---|---|
| 1 | Vins's home screen loses the graphs and the detailed analysis | `Overview.tsx` — the founder's version keeps the takings he checks and how the stores are tracking, and drops the KPI row, the revenue chart, the channel split, the best sellers and the country ribbon |
| 2 | Vins stops seeing unimportant notifications | Same screen — his list is filtered to missed closings, corrections waiting for approval, and months falling behind. Stock and order chasing stay with Kelly |
| 3 | Store cards clickable everywhere in top management | Every card and row now opens `/stores/:id` |
| 4 | Swap **Stores** and **Analytics** in the bar | `nav.ts`, for every role that has both |
| 5 | Analytics store rows clickable too | Same destination |
| 6 | One customer buying several things is **one** sale | `Sell.tsx` rebuilt: build the basket first, answer "where are they from?" once at the end |
| 7 | Remove staff purchases and the e-wallet field from the closing | `CloseDay.tsx` — and the testers/damages block the client crossed out on the same screen |
| 8 | Stores page shows daily sales and month-to-date; no trend, no change | `Locations.tsx` and a new `dailyRevenue` on the location row |
| 9 | Close the day goes back to the older, simpler structure | **On hold** — see below |
| 10 | Full country list, search instead of "Fewer", Malaysia split four ways | `countries.ts` rebuilt from `docs/Zeoniq Countries.md`; new `CountryPicker` |
| 11 | Stock rows open to show what came in and what went out | New `StockItemDetail`, on both the store page and the head-office stock screen |
| 12 | Fix the phone, iPhone and Safari layout problems | See below |

---

## The new store page

Everything about one store in one place: 30-day revenue against the previous
period, units, month-to-date against its target, what is out of stock, the
revenue trend, where its customers came from, its best sellers, its full stock
list, its recent closings and its recent orders.

Every figure comes from the same selectors the group dashboards use, so this
page cannot disagree with the screen that sent you here.

It is reached from the morning-three cards, the store-vs-target cards, the
Stores table and the Analytics ranking — the client's point was fair: a store
name you cannot click is a dead end, and the question after *"Pavilion took
RM 93,620"* is always *"why?"*

---

## Recording a sale

The order of the two questions has swapped. It used to be: pick a perfume, pick
a country, done — and a customer buying three bottles was recorded three times,
answering the same country question over and over.

Now the promoter taps everything the customer is taking, adjusts quantities if
needed, and answers **once**. Every line gets the same country, and the
activity log gets one entry: *"Recorded a sale — 4 units across 3 products at
Pavilion KL · Customer from Malaysia · Chinese"*.

That is also what makes Q29 survive a busy Saturday. Recording nationality per
bottle is a promise a counter quietly stops keeping; recording it per customer
is one question per person.

## Countries

All 200 from the client's Zeoniq list, in their document's order — their top
twenty first, then the rest alphabetically — so the two systems agree.

- The five the store sees most stay on the screen as big buttons.
- **"Fewer" is gone.** In its place, *Search all countries* opens a picker that
  focuses the box immediately; two or three letters is enough. A name that
  *starts* with what you typed sorts above one that merely contains it, and the
  results are grouped A, B, C as the client asked.
- Flags are derived from the ISO code rather than pasted in — 200 hand-typed
  emoji is 200 chances to get one wrong.
- **Malaysia asks one more question**: Malay, Chinese, Indian or Others. It is
  the home market, so the mix inside it is worth more than the headcount. No
  other country has it, and it is never guessed.

---

## Item 12 — the phone, iPhone and Safari problems

Five real faults, not just tightening:

**The background was fighting iOS.** `background-attachment: fixed` on `body`
is a long-standing iOS Safari problem — it re-rasterises the gradient on every
scroll frame, which is what made the background jump and the page feel slow.
The deck now lives on its own fixed layer behind the content.

**Every form control zoomed the page.** iOS Safari zooms in when you focus a
control whose text is under 16px, and leaves you scrolled sideways. Controls
are 16px on a phone and drop to the designed size from `sm` up.

**Panel headers overflowed.** A title with a filter row beside it is fine on a
laptop and wider than a phone on its own; the header now wraps and the controls
take their own full-width line instead of pushing out of the panel.

**The navigation cut a label in half.** On a phone the pills wrap onto a second
line rather than sitting in a sideways scroller nobody notices.

**Tables were being crushed.** They now size to their columns and scroll inside
their own panel, so the page itself never scrolls sideways — verified at 390px.

Also: the footer no longer sticks on a phone, where it cost a line of content
on every screen and covered the last row of whatever you were reading; page
headings scale down; and `100dvh` replaces `100%` so there is no gap under the
footer as the iOS browser chrome slides away.

---

## Item 9 — on hold

*"For closing day go back to the old structure that we have before we change."*

The earlier version of that screen is not in this repository's history, so
rebuilding it from memory would be a guess. Held until we have the old screen
or a decision on which shape is meant. The field removals from item 7 are done
either way and will carry over.

---

## Four amendments that reverse an earlier answer

Worth putting in front of the client before go-live, because each one was
answered the other way in the discovery form:

| Amendment | The earlier answer |
|---|---|
| Remove the e-wallet field | **Q21:** *"Only record total, and split Cash, e-wallet and CC sales."* |
| Remove staff purchases | **Q23:** *"Do staff purchases and staff discounts need to be recorded separately from normal sales?" — "Yes."* |
| Remove testers, damages and samples from the closing | **Q25:** *"Do shops record testers used up, damaged bottles, or free samples given away? Who is allowed to write those off?" — "Yes. Kelly & Davy."* |
| Vins stops seeing most notifications | The hierarchy chart gives the Director access to **all** data. This narrows what he is *shown by default*, not what he can reach — every figure is still on his other screens |

In all three removals the **column stays in the database and the history keeps
its values**. Only the input is gone, so three years of migrated history, the
schema and the existing reports still line up, and putting a field back is a
small change rather than a migration.

If the intention was to stop recording these things altogether — rather than to
stop asking the promoter for them — say so, and we will take them out of the
data model properly.
