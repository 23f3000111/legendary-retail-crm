import { Badge } from '../ui/Badge'
import { skuById } from '../../data/products'
import { num, rm } from '../../lib/format'
import { effectiveQty } from '../../lib/po-machine'
import type { PurchaseOrder } from '../../data/types'

/**
 * Order lines. Requested, approved and shipped sit side by side so a trimmed
 * quantity is visible as a difference rather than hidden behind a single total.
 */
export function PoLines({ po }: { po: PurchaseOrder }) {
  const showApproved = po.lines.some((l) => l.qtyApproved !== null)
  const showShipped = po.lines.some((l) => l.qtyShipped !== null)

  return (
    <div className="-mx-5 overflow-x-auto px-5">
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
              Retail value
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
                    {l.qtyShipped === null ? <span className="text-ink-3">—</span> : num(l.qtyShipped)}
                  </td>
                )}
                <td className="tnum py-2.5 text-right font-mono text-[13px] text-ink">
                  {rm(effectiveQty(l) * (sku?.priceMYR ?? 0))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {po.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested) && (
        <p className="mt-3">
          <Badge tone="warn" icon="alert">
            One or more lines were trimmed at approval. There is no back-order — the store re-requests what it still needs.
          </Badge>
        </p>
      )}
    </div>
  )
}
