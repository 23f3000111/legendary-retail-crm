import { useMemo } from 'react'
import { useData } from '../store/useData'
import { basisOf } from '../data/locations'
import { selectPricesAt, selectSkuMovements, type StockRow } from '../store/selectors'
import { skuById, TIER_LABEL } from '../data/products'
import { formatDate } from '../lib/dates'
import { num, rm } from '../lib/format'

/**
 * One product at one store: what came in, what went out, and what the count
 * said afterwards.
 *
 * It is the answer to the question the stock table always provokes — "why is
 * that number what it is?" — and it is derived from closings and delivered
 * orders rather than kept as a separate ledger, so it can never drift away
 * from the figure that sent you here.
 */
export function StockItemDetail({
  locationId,
  skuId,
  row,
}: {
  locationId: string
  skuId: string
  row: StockRow
}) {
  const data = useData()
  const moves = useMemo(
    () => selectSkuMovements(data, locationId, skuId, 30),
    [data, locationId, skuId],
  )

  // The same price the stock table shows: what it went for, off the sales.
  const prices = useMemo(() => selectPricesAt(data, locationId)(skuId), [data, locationId, skuId])
  const basis = basisOf(locationId)

  const inTotal = moves.filter((m) => m.change > 0).reduce((a, m) => a + m.change, 0)
  const outTotal = -moves.filter((m) => m.change < 0).reduce((a, m) => a + m.change, 0)
  const sku = skuById(skuId)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <p className="eyebrow mb-1">Came in</p>
          <p className="readout text-[17px] font-semibold text-good">+{num(inTotal)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <p className="eyebrow mb-1">Went out</p>
          <p className="readout text-[17px] font-semibold text-critical">−{num(outTotal)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <p className="eyebrow mb-1">On hand</p>
          <p className="readout text-[17px] font-semibold text-ink">{row.counted ? num(row.onHand) : '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span>
          Sells about{' '}
          <span className="readout text-ink-2">{row.velocity.toFixed(1)}</span> a day
        </span>
        <span>
          Reorder at <span className="readout text-ink-2">{num(row.reorderPoint)}</span>
        </span>
        {sku && (
          <span>
            {prices.map((p, i) => (
              <span key={`${p.tier}:${p.unitPrice}`}>
                {i > 0 && ' or '}
                <span className="readout text-ink-2">{p.tier === 'foc' ? 'FOC' : rm(p.unitPrice)}</span>
                {p.tier !== basis && p.tier !== 'foc' && ` (${TIER_LABEL[p.tier].toLowerCase()})`}
              </span>
            ))}
            {prices[0]?.tier !== 'foc' && ' each'}
          </span>
        )}
        {row.suggested > 0 && (
          <span className="text-primary">Suggest asking for {num(row.suggested)}</span>
        )}
      </div>

      <div>
        <p className="eyebrow mb-2">Last 30 days</p>
        {moves.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-ink-3">
            Nothing has moved in the last 30 days.
          </p>
        ) : (
          <ol className="max-h-[280px] space-y-1 overflow-y-auto">
            {moves.map((m, i) => (
              <li
                key={`${m.date}-${m.kind}-${i}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 odd:bg-surface-2"
              >
                <span className="readout w-[86px] shrink-0 text-[11.5px] text-ink-3">
                  {formatDate(m.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                  {m.kind === 'counted' ? 'Counted' : m.kind[0].toUpperCase() + m.kind.slice(1)}
                  {m.note ? ` · ${m.note}` : ''}
                </span>
                <span
                  className={`readout shrink-0 text-[12.5px] font-semibold ${
                    m.change > 0 ? 'text-good' : m.change < 0 ? 'text-critical' : 'text-ink-3'
                  }`}
                >
                  {m.change === 0 ? '—' : m.change > 0 ? `+${m.change}` : m.change}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
