import { Badge } from '../ui/Badge'
import { priceOf, skuById } from '../../data/products'
import { basisOf } from '../../data/locations'
import { num, rm } from '../../lib/format'
import { effectiveQty } from '../../lib/po-machine'
import type { PoLine, PurchaseOrder } from '../../data/types'

/**
 * Order lines. Requested, approved and shipped sit side by side so a trimmed
 * quantity is visible as a difference rather than hidden behind a single total.
 *
 * On a phone the table becomes a stack of cards. The client reported that this
 * table could not be swiped sideways on a phone, and they were right that it
 * was unusable — but a five-column table on a 390px screen is the wrong shape
 * even when the swipe works. Below `sm` each line gets its own card and there
 * is nothing to swipe; from `sm` up it is the table it always was.
 */
export function PoLines({ po }: { po: PurchaseOrder }) {
  const showApproved = po.lines.some((l) => l.qtyApproved !== null)
  const showShipped = po.lines.some((l) => l.qtyShipped !== null)
  const trimmedAny = po.lines.some(
    (l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested,
  )

  const valueOf = (l: PoLine) => effectiveQty(l) * priceOf(skuById(l.skuId), basisOf(po.locationId))

  return (
    <div>
      {/* ── Phone: one card per line ──────────────────────────────────── */}
      <ul className="space-y-2 sm:hidden">
        {po.lines.map((l) => {
          const sku = skuById(l.skuId)
          const trimmed = l.qtyApproved !== null && l.qtyApproved < l.qtyRequested
          return (
            <li
              key={l.skuId}
              className="rounded-xl border border-line bg-surface-2 px-3.5 py-3"
            >
              <p className="text-[13.5px] leading-tight text-ink">{sku?.label ?? l.skuId}</p>
              <p className="readout text-[10.5px] text-ink-3">{sku?.code}</p>

              <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                <div>
                  <dt className="eyebrow">Requested</dt>
                  <dd className="readout text-[13px] text-ink-2">{num(l.qtyRequested)}</dd>
                </div>
                {showApproved && (
                  <div>
                    <dt className="eyebrow">Approved</dt>
                    <dd
                      className={`readout text-[13px] ${
                        l.qtyApproved === null
                          ? 'text-ink-3'
                          : trimmed
                            ? 'text-warn'
                            : 'text-ink'
                      }`}
                    >
                      {l.qtyApproved === null ? '—' : num(l.qtyApproved)}
                    </dd>
                  </div>
                )}
                {showShipped && (
                  <div>
                    <dt className="eyebrow">Shipped</dt>
                    <dd className="readout text-[13px] text-ink">
                      {l.qtyShipped === null ? '—' : num(l.qtyShipped)}
                    </dd>
                  </div>
                )}
                <div className="ml-auto text-right">
                  <dt className="eyebrow">Value</dt>
                  <dd className="readout text-[13px] font-semibold text-ink">{rm(valueOf(l))}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>

      {/* ── From sm up: the table ─────────────────────────────────────── */}
      <div className="hidden sm:block">
        <div className="scroll-x">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="pb-2 text-left text-[10px] uppercase tracking-wide2 text-ink-3">
                  SKU
                </th>
                <th scope="col" className="pb-2 text-right text-[10px] uppercase tracking-wide2 text-ink-3">
                  Requested
                </th>
                {showApproved && (
                  <th scope="col" className="pb-2 text-right text-[10px] uppercase tracking-wide2 text-ink-3">
                    Approved
                  </th>
                )}
                {showShipped && (
                  <th scope="col" className="pb-2 text-right text-[10px] uppercase tracking-wide2 text-ink-3">
                    Shipped
                  </th>
                )}
                <th scope="col" className="pb-2 text-right text-[10px] uppercase tracking-wide2 text-ink-3">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => {
                const sku = skuById(l.skuId)
                const trimmed = l.qtyApproved !== null && l.qtyApproved < l.qtyRequested
                return (
                  <tr key={l.skuId} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5">
                      <p className="text-[13px] leading-tight text-ink">{sku?.label ?? l.skuId}</p>
                      <p className="font-mono text-[10.5px] text-ink-3">{sku?.code}</p>
                    </td>
                    <td className="tnum py-2.5 text-right font-mono text-[13px] text-ink-2">
                      {num(l.qtyRequested)}
                    </td>
                    {showApproved && (
                      <td className="tnum py-2.5 text-right font-mono text-[13px]">
                        {l.qtyApproved === null ? (
                          <span className="text-ink-3">—</span>
                        ) : trimmed ? (
                          <span className="text-warn">{num(l.qtyApproved)}</span>
                        ) : (
                          <span className="text-ink">{num(l.qtyApproved)}</span>
                        )}
                      </td>
                    )}
                    {showShipped && (
                      <td className="tnum py-2.5 text-right font-mono text-[13px] text-ink">
                        {l.qtyShipped === null ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          num(l.qtyShipped)
                        )}
                      </td>
                    )}
                    <td className="tnum py-2.5 text-right font-mono text-[13px] text-ink">
                      {rm(valueOf(l))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {trimmedAny && (
        <p className="mt-3">
          <Badge tone="warn" icon="alert">
            One or more lines were trimmed at approval. There is no back-order — the store
            re-requests what it still needs.
          </Badge>
        </p>
      )}
    </div>
  )
}
