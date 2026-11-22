import { useEffect, useMemo, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { NumberInput, TextInput } from './ui/Field'
import { Icon } from './ui/icons'
import { useData } from '../store/useData'
import { skus } from '../data/products'
import { priceChanges, priceDraft, pricedLines, type PriceDraft } from '../lib/prices'

/**
 * Adjust prices (22 November: "Add, remove and adjust price option added top
 * right"): every line sold at a list price on one sheet, its Promotion, Retail
 * and Promotion 2 in boxes. Davy, Kelly and Chloe only.
 *
 * Only the lines changed are saved, each as a change of its own on the
 * activity log, with its reorder level, case size and FOC as they were. A box
 * that is not a price holds the whole sheet back and names its line, so
 * nothing is half saved. Sales already made keep the price they went at.
 */
export function PriceSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const saveProduct = useData((s) => s.saveProduct)
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({})
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [note, setNote] = useState<string | null>(null)

  // What is on record each time it opens.
  useEffect(() => {
    if (!open) return
    setDrafts(Object.fromEntries(pricedLines(skus).map((s) => [s.id, priceDraft(s)])))
    setProblems({})
    setQuery('')
    setNote(null)
  }, [open])

  const lines = pricedLines(skus)
  const changed = useMemo(() => {
    const out = new Set<string>()
    for (const s of lines) {
      const d = drafts[s.id]
      const was = priceDraft(s)
      if (d && (d.promotion !== was.promotion || d.retail !== was.retail || d.promotion2 !== was.promotion2)) out.add(s.id)
    }
    return out
  }, [lines, drafts])
  const q = query.trim().toLowerCase()
  const shown = q ? lines.filter((s) => `${s.label} ${s.code}`.toLowerCase().includes(q)) : lines

  const set = (id: string, key: keyof PriceDraft, value: string) => {
    setDrafts((all) => ({ ...all, [id]: { ...all[id], [key]: value } }))
    setProblems((all) => {
      if (!all[id]) return all
      const { [id]: _gone, ...rest } = all
      void _gone
      return rest
    })
    setNote(null)
  }

  const save = () => {
    const { changes, problems: wrong } = priceChanges(lines, drafts)
    if (Object.keys(wrong).length) {
      setProblems(wrong)
      setQuery('')
      return setNote(`${Object.keys(wrong).length === 1 ? 'One line needs' : `${Object.keys(wrong).length} lines need`} a price before anything is saved.`)
    }
    if (!changes.length) return setNote('Nothing has been changed.')
    let done = 0
    const failed: Record<string, string> = {}
    for (const c of changes) {
      const result = saveProduct(c)
      if (result.ok) done++
      else failed[c.skuId ?? ''] = result.error ?? 'That could not be saved.'
    }
    if (Object.keys(failed).length) {
      setProblems(failed)
      if (done) onSaved(`New prices on ${done} ${done === 1 ? 'line' : 'lines'}`)
      return setNote('Some lines could not be saved: see the red ones.')
    }
    onSaved(`New prices on ${done} ${done === 1 ? 'line' : 'lines'}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust prices"
      subtitle="Every line sold at a list price. Change any box and save: only the lines changed are saved, and sales already made keep the price they went at."
      width="max-w-3xl"
      footer={
        <>
          <p className="mr-auto text-[12px] text-ink-2">
            {note ?? (changed.size ? `${changed.size} ${changed.size === 1 ? 'line' : 'lines'} changed` : 'Nothing changed yet')}
          </p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon="check" onClick={save}>
            Save prices
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a product"
          aria-label="Find a product"
          className="h-9 text-[12.5px] sm:w-[260px]"
        />
        <div className="scroll-x">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {['Product', 'Promotion', 'Retail', 'Promotion 2'].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${i ? 'w-[132px] text-left' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const d = drafts[s.id]
                if (!d) return null
                const wrong = problems[s.id]
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-line/70 last:border-0 ${wrong ? 'bg-critical/6' : changed.has(s.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-1.5 pr-3 align-top">
                      <p className="text-[13px] leading-tight text-ink">{s.label}</p>
                      <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                      {wrong && (
                        <p className="mt-1 flex items-start gap-1 text-[11.5px] text-critical">
                          <Icon name="alert" className="mt-0.5 h-3 w-3 shrink-0" />
                          {wrong.replace(`${s.label}: `, '')}
                        </p>
                      )}
                    </td>
                    {(['promotion', 'retail', 'promotion2'] as const).map((k) => (
                      <td key={k} className="py-1.5 pr-2 align-top">
                        <NumberInput
                          prefix="RM"
                          min={0}
                          step="any"
                          value={d[k]}
                          placeholder={k === 'promotion2' ? 'none' : undefined}
                          aria-label={`${s.label}: ${k === 'promotion' ? 'Promotion' : k === 'retail' ? 'Retail' : 'Promotion 2'}`}
                          onChange={(e) => set(s.id, k, e.target.value)}
                          className="h-9 text-[13px]"
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="text-[12.5px] text-ink-3">No product matches “{query}”.</p>}
        <p className="text-[11.5px] text-ink-3">
          The vials are given free and the testers never sold, so neither has a price. A line’s reorder level and case size
          change with the pencil on its row.
        </p>
      </div>
    </Modal>
  )
}
