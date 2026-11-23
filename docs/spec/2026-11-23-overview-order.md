# The Overview's order, and clearer sentences — 23 November 2026

The developer sent three points and a closing line, with screenshots of the
live site. Everything below is built. Nothing on the server changed.

| Asked | What changed |
|---|---|
| "Best sellers should go down on Davy, Kelly and Chloe page" and "best seller should move down and which country bought should go below the calendar" | The Overview reads, in order: the four boxes; consignment, main stores and dealers; **Who is selling**; the **calendar**; **Which countries bought**; **Best sellers**; orders in flight. The founder's version has none of these sections and did not change. |
| "The headings and boxes should be different colour oriented and this section should move up under the sales followed by calendar" | *Who is selling* sits straight under the sales panels, with the calendar after it. Its three headings and their boxes each have their own colour: pink for the main stores, cyan for consignment, green for the dealers. The heading names the kind of outlet, so colour is never the only sign. |
| "In analytics, this sentence is wrong English" | Analytics' *Channel* card, shown when only one channel sold, now says: *All RM 676,124 came from the main stores. Consignment partners and dealers report once a month. A month is counted when its first day falls within the dates.* The same sentence replaces "its month counts when its 1st is in the dates" on Revenue and on the Overview. |

## The same sentences everywhere

`MONTH_RULE` in `src/lib/words.ts` is the one sentence about which months
count. It is used on Analytics, Revenue and the Overview.

While in these sentences, "dealers and consignment" became "consignment and
dealers" where a page or an export names both. This follows the 22 November
rule. Error messages, the activity log's labels and code comments are
unchanged.

## Calls made along the way

- **"Under the sales"** was read as under the consignment, main stores and
  dealers panels, not between them and the four boxes.
- **Countries come directly below the calendar, and best sellers below
  them,** since the two were named separately.
- **The colours** follow the arrows in the screenshot: pink, cyan and green.
