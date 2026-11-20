# Revenue, Stores and Analytics — 20 November 2026

The developer's second message of 20 November, with screenshots of Finance's
Revenue and Dealer sales pages and of a country's window, asked for changes to
three pages and for "pop-up everywhere with detailed details". It also asked
whether *Legendary CRM Amendments #7* is done. That document is our Revision
9: the file in the repository root is byte-for-byte the same as
`docs/client-input/CRM Revision 9.pdf`. The check is at the end.

Everything below is built. Nothing on the server changed.

## Revenue (Finance)

| Asked | What changed |
|---|---|
| Remove the four boxes: revenue, units sold, orders to clear, staff purchased | Gone. Orders waiting on Finance still show under *Needs you*, only when there are some. |
| The sales report: no "equal", only *between*, from a start date to an end date; Store, Item and Nationality folded when the page opens | The report is back on Revenue (it came off on the morning of 20 November). **Business date** is *between* two dates, yesterday to yesterday when it opens. **Store**, **Item** and **Nationality** wait under **Add rule**. Added, each is a list of choices, with no *equal* or *not equal*. |
| "Unit should be in detailed in sales report" | Every row (a store on a day) opens a pop-up: what sold, at which price, who bought, and how the day was paid. **What sold** beside the rows lists the report's units, product by product, with totals. The CSV has both blocks. The PDF has the rows, then *What sold*. |
| Remove the Dealer sales page; dealers beside consignment | Finance's bar no longer has *Dealer sales*. On Revenue, **Dealers & consignment** shows both, side by side, for a month (last month first, any month on the list). Finance keys the figures in there. The save bar shows only while a figure is waiting to be saved. Consignment partners keep their margin. |
| Remove Written off | Gone. |
| By channel should work, with dealers and consignment | **By channel** is a month: the month chosen above it. Main stores are as filed (today live in the month still running). Dealers and consignment are as keyed in, with how many partners that is ("4 of 44"). The figures come first; **Chart** draws the ring. The export at the top of the page is this table. |

Dealers and consignment report a month at a time, so a rolling 30 days would
cut their month in half. That is why By channel showed only the main stores.

Davy, Kelly and Chloe keep **Dealer sales** in *More*. Kelly keys the months
in there.

## Stores

- **From** and **To** sit above the table. With dates chosen, the table shows
  those days only: each store's **Sales**, **Units** and **Customers**, with
  totals. The CSV and PDF follow. **Clear dates** brings back today,
  yesterday, the month to date and last month, which *Amendments #7* asked
  for.
- **Tapping a store opens its pop-up.** It opens on the chosen dates, or on
  the month to date. Tapping one of the store's figures opens it on that
  figure's days. A switch moves between today, yesterday, the month to date
  and last month.

## Analytics

- **From** and **To** are always showing, beside 7, 30 and 90 days, this
  month and last month. The *Dates* button is gone; dates that match no
  period light none of the buttons.
- **The filter stays.** The dates, stores, products, countries and the
  measure are kept for the browser tab. Leaving for a store's page and coming
  back, by *Back* or by the bar, finds the page as it was left. So do the
  dates on Stores and the sales report's rules on Revenue. Signing out forgets
  them.
- **A store opens in a pop-up first**, for the dates and the products and
  countries chosen. **Open full detail** at its foot goes on to the store's
  page, `#/stores/pavilion-5` for Pavilion KL. The arrow at the end of each
  row is gone. Tapping a store no longer narrows the page to it.

## The pop-up, everywhere a store is tapped

"It says 20 unit sold but it's not showing what 20 unit sold."

Each pop-up has:

- **The figures**: sales, units, customers, and how the filed days were paid
  (cash, card, e-wallet).
- **What sold, most first**: every product with each price it went at
  ("RM 188 ×18"), its units and sales.
- **Where the customers came from**: each country's customers, units and
  sales.
- **Day by day**, when it covers more than a day. Tap a day to see it alone.
- **Months keyed in**, for a dealer or consignment partner, which have no
  products behind them.
- **Open full detail**: the store's page, on the same day when the pop-up is
  one day.

Every list has its total and shows ten at a time. Where it opened from a
narrowed page, it says so: "Only Orchid, as on the page it was opened from."

| Where | Opens on |
|---|---|
| Stores: a store, or one of its figures | The dates chosen, or the figure's window |
| Analytics: *By store* | The dates and the filter |
| Analytics and Overview: a store in a country's window | Those days, that country only |
| Revenue: a row of the sales report | That store's day, with the report's items and nationalities |
| A day on the calendar (Overview, Stores): a store | That day |
| Overview: *Who is selling*, *Main stores · month to date*, *Dealers*, *Consignment*; the founder's three and his stores against target | Today, the month to date, the partner's month, yesterday |

## Calls made without asking

- **Dealer sales is gone for Finance only.** Kelly keys the months in on that
  page; Davy and Chloe keep it too.
- **By channel reads a month, not 30 days**, since partners report monthly.
- **The report opens on yesterday**, as it did before.
- **Stores keeps its four windows until dates are chosen**, as *Amendments
  #7* asked.
- **The pop-up is on the Overview too**, because the message asked for
  "pop-up everywhere".

## Later the same day: dates for the partners, outlets in your own order, single lines

A third message, with screenshots of the *Dealers & consignment* section on
Revenue and of Analytics' *Revenue by channel*. It changed three things.

### Consignment and dealers, each for its own dates

"Put calendars to select start date and end date ... for both Dealers and
Consignment separately and for dealers ... top most is highest value."

- Each list has its own **From** and **To**. Both start on last month, the
  month every partner has reported.
- Each partner's months add up when their 1st falls in the dates: 1 September
  to 31 October is September and October together. Dates that hold no month's
  1st (2 to 31 October) hold nothing, and the list says why.
- Every partner is listed, **highest first**, with those with nothing at the
  foot.
- The title is the total for the dates. Under it: how many partners have a
  figure, and for which months.
- Each row says who keyed it in, or how many months it adds up. Consignment
  keeps its margin.
- **Tap a partner** for its pop-up: its months, keyed in.
- **Key in a month** switches the section to the boxes for one month, as
  before. **Back to the dates** returns to the lists.
- **By channel** now has its own From and To, with its CSV in its corner.
- All these dates are kept for the tab, like the report's rules.

### Outlets in your own order

"There should be a drag option for all the outlets, Consignment, Dealers,
stores, in analytics page, everywhere ... so client can drag the things and
placed as per their choice."

**Arrange** opens the products' drag list again, for outlets. Each line can
be dragged by its handle, moved with the arrow keys, or sent to the top. Main
stores, dealers and consignment are arranged separately, each in its own
list. **Save my order** keeps it.

The order is each person's own, kept on that device, as *Hide other notes*
is. One person's order never changes anyone else's lists.

| List | How it opens | Arrange |
|---|---|---|
| Stores | Highest first; **My order** on the switch | Yes |
| Analytics: *By store* | Highest first; My order on the switch | Yes |
| Analytics: the filter's store chips | Your order | — |
| Revenue: consignment, dealers | Highest first, as asked; My order on the switch | Yes |
| Overview: *Who is selling* | Highest first; My order on the switch | Yes |
| Closings: the filing grid | Your order | Yes |
| Dealer sales, and keying in on Revenue | Your order, which stays put while figures are typed | Yes |

Saving an arrangement switches that list to My order. Each list remembers
its choice on the device. An outlet that opens later joins the end of the
person's order.

### Single lines folded on Analytics

"Remove or hide the things that has only one detail like Revenue by channel
in analytics page has only one Main stores detail ... put this Main stores
detail somewhere else."

A section with a single line is no longer a section. Its line sits in a card
under the four boxes:

| Section | Folded when | The card |
|---|---|---|
| Revenue by channel | One channel sold | "Main stores only", the amount, and why: a partner's month counts when its 1st is in the dates |
| Which countries bought | One country | The country, its customers, units and sales; tap it to open it |
| Products | One product | The product, its units and sales |
| By store | One store in view | The store, its sales and customers; tap it for its pop-up |

When one of the two top sections is folded, the other takes the whole
width. Revenue's By channel stays a section, because it carries its own
dates.

## Legendary CRM Amendments #7 — the check

Each page and rule of the document, checked on 20 November in the local
build as Davy, the founder, Finance and Kelly.

| # | Asked | Now |
|---|---|---|
| 1 | Overview: four boxes (today, yesterday, month to date, last month); the units box removed | Done. |
| 2 | Stores: the same four boxes | Done for Davy, Kelly, Chloe and the founder. Finance's Stores has had no boxes since 16 November ("for finance they only want detail"). |
| 3 | Analytics: the same four boxes | Changed on 16 November at Davy's request: Analytics shows the chosen dates' sales, units, customers and stores that sold, not the four windows. |
| 4 | Closings: the same four boxes | Done. |
| 5 | *Main stores · month to date*: figures first | Done. Every chart opens on its figures. |
| 6 | Stores: *Units · 30 days* to last month's sales | Done. Today, yesterday, month to date and last month, each with customers and a total. |
| 7 | A store's page: graphs to the bottom | Done. |
| 8 | A store's page: stock, top 10 with Load more, moved up | Built in Revision 9. Revision 10 (#8) replaced it with the day's table under the calendar: every product in the client's order, with price, deducted, sales and on hand at close. It is not ten at a time now. |
| 9 | *Who is selling*: yesterday's closing on top of each box | Done. |
| 10 | *Which countries bought*: sales per country; tap one for its stores and products | Done. |
| 11 | Overview: a calendar of daily sales, each day opening each store's sales | Done. Each store in the day now opens its pop-up. |
| 12 | Best sellers: Collection column removed; totals under every column of amounts | Done. |
| 13 | *Where they came from*: counted by customer, not by bottle | Done. |
| 14 | *Best sellers here*: units and amount per product, with a total | Done. |
| 15 | A store's calendar: a total on each date; a date opens each product, the countries and their customers | Done. |
| 16 | The Stores table's four columns | Done. |
| 17 | The counter (sales report) on Stores; export as he likes | Built in Revision 9. On 16 November Davy moved it to Analytics ("I'll do this in the analytics"). Today Stores has From and To; Analytics has dates, stores, products and countries; Revenue has the report. Every one exports CSV and PDF. |
| 18 | The CSV is "boring": a report with the numbers drawn | Done. **PDF report** beside every CSV: boxes, a bar chart, the table with its total. |
| Rule 1 | Add, remove and price products and promotions | Done. Davy, Kelly and Chloe have Products and Promotions. |
| Rule 2 | Graphs at the bottom | Done. |
| Rule 3 | Pie and bar charts second, figures first | Done. |
| Rule 4 | The four boxes on the main pages | Done on the Overview, Stores, Closings and each store's page. Analytics changed on 16 November (row 3). |
| Rule 5 | The counter on the Overview, Stores and Analytics | Taken off the Overview at the client's request on 1 November. Stores and Analytics as in row 17. |
| Rule 6 | Stores about sales at a glance | Done. |
| Rule 7 | Analytics detailed, with prominent buttons | Done. |
| Rule 8 | A calendar day: each store, its sales, the products sold, the buyers' countries | Done. |
