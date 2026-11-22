# Orders, the Overview, Stores and Stock — 22 November 2026

The developer sent nine points on 22 November, each with a screenshot. On the
same day they confirmed the plan:

- **The Overview's dates:** they drive the partner panels, main stores, best
  sellers and countries. The boxes, "Who is selling" and the calendar stay
  as they are.
- **Finance:** its "up and down" is the Arrange added on 20 November.
- **Order of channels:** consignment comes before dealers everywhere.
- **The stock export:** its layout was left to us.

Everything below is built. Nothing on the server changed: products are added,
changed, taken off and arranged through the actions the Products page
already uses.

## The rule: consignment before dealers

> "Swap the two sections consignment and dealer because in finance page left
> side is consignment and right side is dealer so swap to be consistent with
> the entire CRM and also note this to make crm consistent."

Wherever the channels appear together, the order is **main stores, then
consignment, then dealers**. This covers:

- the Overview's panels, which now run Consignment | Main stores | Dealers;
- the switches on Stores, Closings and Promotions;
- the Analytics filter;
- every By channel table (Revenue, Analytics);
- the store pickers;
- the sales report's store groups;
- the Arrange window;
- the exports.

`CHANNELS` in `src/data/locations.ts` holds the order. Revenue's section is
now called *Consignment & dealers*.

## What was asked, and what changed

| # | Asked | What changed |
|---|---|---|
| 1 | "In the rejected in order page there should be a mention of who has rejected the order request" | A rejected order says **by Kelly Tew** and when, under its Rejected chip. Its reason, which is required when rejecting, sits under the progress bar. If an order was sent again and rejected again, the latest rejection shows. The Orders CSV gains *Rejected by*, *Rejected on* (Malaysian date) and *Reason*. |
| 2 | "Consignment and dealer should be default in figure on the page. NOT the pie chart." | On the live site the page is drawn before the partners' figures arrive. A chart frame took "no figures yet" as "show the chart", and kept the ring. Now a frame shows its figures whenever it has some, until **Chart** is tapped. This applies to every chart frame. |
| 3 | Swap consignment and dealers | See the rule above. |
| 4 | "Add the date filter" (under "Good morning") | **From** and **To** sit under the greeting. Chosen dates drive the partner panels, main stores, best sellers and *Which countries bought*. Partners count a month when its 1st is in the dates, as on Revenue. Dates that hold no 1st say so. A tapped store or partner opens on those dates. With no dates, the page is as it was. The dates are kept for the tab. The founder's version has none of those sections, so it has no dates. |
| 5 | "Make sure they all have different colour boxes" | The palette went from 6 colours to 12. The first six are unchanged. The six new ones passed the dataviz checker on white (adjacent pairs, colour-blind and normal vision, 3:1 contrast). Past twelve, 36 more distinct colours cover the long tables, such as 44 dealers. No row is grey any more except a real "Other". The ring draws up to twelve slices, so its colours match the rows. |
| 6 | "Add, remove and adjust price option added top right and the products can be amended themselves … Kelly, Chloe and Davy's page. Finance can ONLY move the products up and down" | See *The Stock page* below. |
| 7 | "This exported report … should give the breakdown output like the report made in finance page" | **CSV** and **PDF report** are laid out like the Product Sales Listing behind Finance's reports. See *The stock report* below. |
| 8 | "Move the calendar up below the boxes and make sure there is a date filter here" | **From**, **To** and *Clear dates* sit at the top of Stores, beside CSV and PDF report, and drive the table and both exports as before. The calendar sits straight under the four boxes and opens on the month of **To**. Finance has no boxes. It opened on the stores themselves on 16 November, so its table stays first and its calendar under it. |
| 9 | Love, Hope and Confidence vials counted as Spirit 1 at closing | Live since 18 November (Revision 10), as the developer's screenshot shows: *Spirit 1 · 3ml Vials (Love, Hope, Confidence), counted together*, only for the 3ml vials and only on the closing count. Nothing to build. |

### The Stock page (point 6)

- **Chloe can now open Stock.** She did not have the page, and the developer
  named it as hers, Kelly's and Davy's.
- **Top-right buttons:**
  - **Arrange:** the products' drag list, the same order as Products.
  - **Adjust prices:** every line sold at a list price on one sheet, with
    Promotion, Retail and Promotion 2. Only changed lines are saved, each
    logged on its own. One bad box holds the whole sheet back and names its
    line.
  - **Remove:** takes a product off the range, and lists what was taken off
    with *Put back*.
  - **Add a product.**
- **Each row** has a pencil (prices, reorder level, case size) and a cross
  (take it off).
- **Who sees them:** only those who can change products (Davy, Kelly,
  Chloe). Finance, the founder, the warehouse and the stores see no new
  controls.
- **Finance's "up and down":** the Arrange on its outlet lists, as the
  developer confirmed.

### The stock report (point 7)

The Stock export used to be a single grid: a product per row, a store per
column. It now reads like Finance's reports:

1. A heading.
2. **Stock by store:** units on hand, products at or below reorder, products
   out, and the suggested top-up for each store, with the date of its count.
3. **Stock listing:** each store under its own *Outlet:* band, every product
   with on hand, per day, days left, reorder at, status and suggested, then a
   subtotal per store and a **Grand Total**.
4. **Each product across the stores.**

A store exporting its own stock gets only its own listing. Before this
change, a store's export carried every main store.

## Calls made along the way

- **Chloe gets the Stock page,** as point 6 needs.
- **The stock report's layout:** each store, then its products. The question
  was left blank, and this matches the Product Sales Listing.
- **Finance's Stores keeps the table first.** We had said its calendar would
  sit under the title. But the 16 November note that Finance "opens on the
  stores themselves" still stands, and Finance has no boxes.
- **"Remove" takes a product off the range,** as on Products. It is never
  deleted: its sales, counts and orders keep it, and it can be put back.
- **Every CSV now sets a cell that starts like a formula** (=, +, -, @) as
  the text typed, a quote in front, so Excel never runs it. Rejection
  reasons are typed by people and now reach the Orders export.
