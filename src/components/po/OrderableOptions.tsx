import { sellableSkus, testerSkus, vialSkus } from '../../data/products'

/**
 * Everything a store can ask HQ for, grouped the way it sits in the stockroom:
 * what is sold and counted, the 3ml vials, and the testers, each in the
 * range's own order (Revision 10). For a `<select>`.
 */
export function OrderableOptions() {
  return (
    <>
      <optgroup label="Bottles, sets and travel kits">
        {sellableSkus.filter((k) => k.variant !== 'vial').map((k) => (
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
