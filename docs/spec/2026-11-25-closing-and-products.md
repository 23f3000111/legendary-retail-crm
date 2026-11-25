# The promoter's closing, and Add a product — 25 November 2026

The developer sent four points. The first two are the client's document
*Revision #9* (our Revision 11), whose only page is "Promoter's Page
(Closing)". The other two are screenshots of **Add a product** on the Stock
page.

Nothing on the server changed, and no SQL was run.

## The promoter's closing

Both points had been built on 20 November, when the same page was first sent.
Both were checked again in the browser as a promoter, and gaps were found and
closed.

| Asked | Already live since 20 November | Added now |
|---|---|---|
| "Add below picture section in promoter's closing page, so that they can refer back the deducted stocks and sales of the day" | **The day, product by product**, on the closing as it is filled in and on a closed day: price, deducted, sales, on hand at close | A link to it under *Today's sales*, **Deducted stock and sales, product by product**. On a closed day the table is read from the closing alone. Before, on a day that was still today, *Price* and *Sales* read the counter, so a sale changed after closing left the table and its heading disagreeing. |
| "After promoter receive stock for PO, the received quantity automatically adds into the closing quantity" | Each box starts at the last count, plus what was confirmed received since, less what sold | See below. |

What was missing for received stock:

- **A store that has never counted (TRX),** and **a product new to a store,**
  started with an empty box, whatever had been received. Each now starts at
  what was received, less what sold, and shows *Received +48*. A product that
  was never counted and never received still starts empty, because nothing is
  known about it. Vials counted three at a time wait until all three are
  known.
- **Days nobody closed.** Deliveries on such a day were added to the next
  closing, but that day's sales were not taken off. They now are, shown as
  *+5 on days not closed*.
- **Ask HQ for stock** asked again for what had just arrived. Once received,
  an order was no longer on its way, and it was not yet counted. The
  suggestion now takes it into account, here and on the Stock page.

## Add a product

| Asked | What changed |
|---|---|
| "Put product name instead of fragrance" | The label is **Product name**. Its last choice is **Make a new product…** instead of *A new fragrance…* |
| "Put add collection, make new collection, make new product dropdown" | A second dropdown, **Collection**, sits beside it: *Add to a collection…*, the collections, and **Make a new collection…** |

How the two dropdowns work together (`src/lib/addProduct.ts`):

- Choosing a product shows its collection. All the products stay listed, so a
  wrong pick is easy to change.
- Choosing a collection lists only its products.
- Making a new collection starts with a new product, because a collection
  exists while a product is in it.

A new collection appears everywhere the four do: the Analytics filter, the
Products page and its export, the charts (with its own colour), and this card.
Making one is written to the activity log with its first product.

The Products page opens the same card.

### How a new collection is kept

The server accepts only the four built-in collections in a product's record.
So a collection made in the app travels beside one of those four:

```json
"product": { "id": "moonlight", "name": "Moonlight", "collectionId": "signature",
             "collection": { "id": "festive", "name": "Festive" } }
```

The app reads `collection` when it makes sense, and `collectionId` otherwise.
The server does not check the `collection` part, so `applyCatalogue` does. An
older page still open in a browser shows such a product under Signature until
it is reloaded. If that page saves the product, the collection is kept as
long as another line of the product still carries it.

If the server should check new collections too, `_catalogue_refusal` in
`0001_init.sql` and its twin in `src/lib/catalogue.ts` are the two places to
change.

## Calls made along the way

- **"Add collection" and "Make new collection"** were read as adding the
  product to a collection, and making one: the Collection dropdown does both.
- **A product that exists cannot be moved to another collection.** That was
  not asked for.
- **The first count at a new store** starts from what was received, as the
  client asked, but the page still says to check it: stock that did not come
  through an order is not known.
