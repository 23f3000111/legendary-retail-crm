import { useState } from 'react'
import { Button } from './ui/Button'
import { SegmentedControl } from './ui/Field'
import { ArrangeOutlets } from './ArrangeOutlets'
import type { ListMode, OutletSort } from '../store/useOutletOrder'
import type { Channel } from '../data/locations'

/**
 * On a list of outlets (20 November): "Highest first" or "My order", and
 * **Arrange** to drag them into that order. A list with no figures to rank
 * by, such as the filing grid, keeps to "My order" and shows Arrange alone.
 */
export function OutletOrderControl({
  sort,
  channels,
  valueLabel = 'Highest first',
  switchable = true,
}: {
  sort: OutletSort
  /** The kinds of outlet the list shows, each arranged on its own. */
  channels: Channel[]
  valueLabel?: string
  switchable?: boolean
}) {
  const [arranging, setArranging] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {switchable && (
        <SegmentedControl<ListMode>
          size="sm"
          value={sort.mode}
          onChange={sort.setMode}
          options={[
            { value: 'value', label: valueLabel },
            { value: 'mine', label: 'My order' },
          ]}
        />
      )}
      <Button size="sm" variant="ghost" icon="grip" onClick={() => setArranging(true)} title="Drag the outlets into your own order">
        Arrange
      </Button>
      {arranging && (
        <ArrangeOutlets channels={channels} onClose={() => setArranging(false)} onSaved={() => sort.setMode('mine')} />
      )}
    </div>
  )
}
