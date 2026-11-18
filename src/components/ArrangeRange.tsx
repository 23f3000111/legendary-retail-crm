import { useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { Panel, PanelBody, PanelHeader, Rule } from './ui/Panel'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { useToasts } from './ui/Toast'
import { useData } from '../store/useData'
import { inClientOrder, sectionOf, skuById, skus, type RangeSection } from '../data/products'

const SECTIONS: { id: RangeSection; title: string }[] = [
  { id: 'sold', title: 'Bottles, sets and kits' },
  { id: 'vial', title: '3ml vials' },
  { id: 'tester', title: 'Testers' },
]

type Lists = Record<RangeSection, string[]>

const split = (ids: string[]): Lists => {
  const out: Lists = { sold: [], vial: [], tester: [] }
  for (const id of ids) {
    const sku = skuById(id)
    if (sku) out[sectionOf(sku)].push(id)
  }
  return out
}

const onRange = () => skus.filter((s) => !s.removed)

/**
 * Arranging the range (16 November): Davy, Kelly and Chloe put the products
 * in the order every page lists them, without asking the developers. A line
 * is dragged by its handle, or moved with the arrow keys, within its own
 * part of the range: the bottles first, the vials after them, the testers
 * last. Nothing changes until it is saved, and then it changes for everyone.
 */
export function ArrangeRange({ onDone }: { onDone: () => void }) {
  const saveProductOrder = useData((s) => s.saveProductOrder)
  const push = useToasts((s) => s.push)
  const [lists, setLists] = useState<Lists>(() => split(onRange().map((s) => s.id)))

  const save = () => {
    const result = saveProductOrder([...lists.sold, ...lists.vial, ...lists.tester])
    if (!result.ok) return push(result.error ?? 'The order could not be saved.', result.error?.startsWith('Nothing') ? 'info' : 'critical')
    push('The new order is saved, for every page and every store', 'good')
    onDone()
  }

  const move = (section: RangeSection, id: string, by: -1 | 1) =>
    setLists((all) => {
      const list = [...all[section]]
      const from = list.indexOf(id)
      const to = from + by
      if (from < 0 || to < 0 || to >= list.length) return all
      list.splice(from, 1)
      list.splice(to, 0, id)
      return { ...all, [section]: list }
    })

  return (
    <Panel>
      <PanelHeader
        eyebrow="Arrange"
        title="The order every page lists the products in"
        meta="Drag a line by its handle, or use the arrow keys on it. The bottles come first, then the vials, then the testers. Save, and every page and every store follows it."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              onClick={() => setLists(split(inClientOrder(onRange()).map((s) => s.id)))}
            >
              Back to the client’s order
            </Button>
            <Button size="sm" variant="secondary" onClick={onDone}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" icon="check" onClick={save}>
              Save the order
            </Button>
          </div>
        }
      />
      <Rule />
      <PanelBody className="space-y-5">
        {SECTIONS.filter((sec) => lists[sec.id].length > 0).map((sec) => (
          <section key={sec.id}>
            <p className="eyebrow mb-2">{sec.title}</p>
            <Reorder.Group
              as="ol"
              axis="y"
              values={lists[sec.id]}
              onReorder={(ids: string[]) => setLists((all) => ({ ...all, [sec.id]: ids }))}
              className="space-y-1.5"
            >
              {lists[sec.id].map((id, i) => (
                <ArrangeLine
                  key={id}
                  id={id}
                  place={i + 1}
                  first={i === 0}
                  last={i === lists[sec.id].length - 1}
                  onMove={(by) => move(sec.id, id, by)}
                />
              ))}
            </Reorder.Group>
          </section>
        ))}
      </PanelBody>
    </Panel>
  )
}

function ArrangeLine({
  id,
  place,
  first,
  last,
  onMove,
}: {
  id: string
  place: number
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
}) {
  const controls = useDragControls()
  const sku = skuById(id)
  const label = sku?.label ?? id
  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 py-1.5 pl-1.5 pr-3"
    >
      <button
        type="button"
        aria-label={`Move ${label}: drag, or use the arrow keys`}
        title="Drag to move"
        onPointerDown={(e) => {
          e.preventDefault()
          controls.start(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' && !first) {
            e.preventDefault()
            onMove(-1)
          }
          if (e.key === 'ArrowDown' && !last) {
            e.preventDefault()
            onMove(1)
          }
        }}
        style={{ touchAction: 'none' }}
        className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink active:cursor-grabbing"
      >
        <Icon name="grip" className="h-4 w-4" />
      </button>
      <span className="readout w-6 shrink-0 text-right text-[11px] text-ink-3">{place}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{label}</span>
      <span className="readout hidden text-[10.5px] text-ink-3 sm:inline">{sku?.code}</span>
    </Reorder.Item>
  )
}
