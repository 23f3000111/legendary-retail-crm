import { products, sellableSkus, testerSkus, vialSkus, type Sku } from '../../data/products'

/** In the order of the range, the way the counter lists it. */
const inRangeOrder = (list: Sku[]): Sku[] =>
  [...list].sort(
    (a, b) =>
      products.findIndex((p) => p.id === a.productId) - products.findIndex((p) => p.id === b.productId),
  )

/**
 * Everything a store can ask HQ for, grouped the way it sits in the stockroom:
 * what is sold and counted, the 3ml vials, and the testers. For a `<select>`.
 */
export function OrderableOptions() {
  return (
    <>
      <optgroup label="Bottles, sets and travel kits">
        {inRangeOrder(sellableSkus.filter((k) => k.variant !== 'vial')).map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="3ml vials">
        {vialSkus.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Testers">
        {testerSkus.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </optgroup>
    </>
  )
}
