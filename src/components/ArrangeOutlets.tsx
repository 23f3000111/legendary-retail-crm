import { useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Icon } from './ui/icons'
import { useToasts } from './ui/Toast'
import { useAuth } from '../store/useAuth'
import { useOutletOrders } from '../store/useOutletOrder'
import { inOutletOrder } from '../lib/outletOrder'
import { CHANNEL_PLURAL, locationById, tradingLocations, type Channel } from '../data/locations'

type Lists = Partial<Record<Channel, string[]>>

/**
 * Putting the outlets in your own order (20 November: "a drag option for all
 * the outlets, Consignment, Dealers, stores ... so client can drag the things
 * and placed as per their choice"). The products' Arrange again: drag a line
 * by its handle, or move it with the arrow keys, or send it to the top. Each
 * kind keeps to its own list. Saved for the person on this device, it orders
 * every list set to "My order", here and on every other page.
 */
export function ArrangeOutlets({
  channels,
  onClose,
  onSaved,
}: {
  channels: Channel[]
  onClose: () => void
  /** After saving: the list it was opened from switches to "My order". */
  onSaved?: () => void
}) {
  const personId = useAuth((s) => s.personId) ?? 'nobody'
  const mine = useOutletOrders((s) => s.byPerson[personId])
  const saved = mine?.order ?? {}
  const arrange = useOutletOrders((s) => s.arrange)
  const push = useToasts((s) => s.push)
  const usual = (c: Channel) => tradingLocations.filter((l) => l.channel === c).map((l) => l.id)
  const [lists, setLists] = useState<Lists>(() =>
    Object.fromEntries(channels.map((c) => [c, inOutletOrder(usual(c), (id) => id, saved)])),
  )

  const move = (c: Channel, id: string, to: number | 'top') =>
    setLists((all) => {
      const list = [...(all[c] ?? [])]
      const from = list.indexOf(id)
      const at = to === 'top' ? 0 : from + to
      if (from < 0 || at < 0 || at >= list.length) return all
      list.splice(from, 1)
      list.splice(at, 0, id)
      return { ...all, [c]: list }
    })

  const save = () => {
    for (const c of channels) arrange(personId, c, lists[c] ?? null)
    push('Your order is saved on this device', 'good')
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Arrange in your own order"
      subtitle="Drag a line by its handle, use the arrow keys on it, or send it to the top. Every list set to “My order” follows it, on every page. It is yours alone: nobody else's lists change."
      width="max-w-xl"
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            className="mr-auto"
            onClick={() => setLists(Object.fromEntries(channels.map((c) => [c, usual(c)])))}
          >
            Back to the usual order
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" icon="check" onClick={save}>
            Save my order
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {channels.map((c) => (
          <section key={c}>
            {channels.length > 1 && <p className="eyebrow mb-2">{CHANNEL_PLURAL[c]}</p>}
            <Reorder.Group
              as="ol"
              axis="y"
              values={lists[c] ?? []}
              onReorder={(ids: string[]) => setLists((all) => ({ ...all, [c]: ids }))}
              className="space-y-1.5"
            >
              {(lists[c] ?? []).map((id, i, all) => (
                <Line
                  key={id}
                  id={id}
                  place={i + 1}
                  first={i === 0}
                  last={i === all.length - 1}
                  onMove={(by) => move(c, id, by)}
                />
              ))}
            </Reorder.Group>
          </section>
        ))}
      </div>
    </Modal>
  )
}

function Line({
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
  onMove: (by: -1 | 1 | 'top') => void
}) {
  const controls = useDragControls()
  const l = locationById(id)
  const name = l?.shortName ?? id
  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 py-1.5 pl-1.5 pr-2"
    >
      <button
        type="button"
        aria-label={`Move ${name}: drag, or use the arrow keys`}
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
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{name}</span>
      <span className="readout hidden text-[10.5px] text-ink-3 sm:inline">{l?.code}</span>
      {!first && (
        <button
          type="button"
          onClick={() => onMove('top')}
          aria-label={`Send ${name} to the top`}
          title="To the top"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-primary"
        >
          <Icon name="arrowUp" className="h-3.5 w-3.5" />
        </button>
      )}
    </Reorder.Item>
  )
}
