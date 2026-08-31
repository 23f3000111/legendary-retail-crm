import { useMemo, useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { StockItemDetail } from '../../components/StockItemDetail'
import { ProgressBar } from '../../components/ui/Progress'
import { Select } from '../../components/ui/Field'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { selectStock, type StockRow } from '../../store/selectors'
import { locationById, locationsInChannel } from '../../data/locations'
import { skus } from '../../data/products'
import { downloadCsv } from '../../lib/exportCsv'
import { num } from '../../lib/format'

const STATUS: Record<StockRow['status'], { label: string; tone: 'good' | 'warn' | 'critical' }> = {
  ok: { label: 'Healthy', tone: 'good' },
  low: { label: 'Low', tone: 'warn' },
  critical: { label: 'Very low', tone: 'critical' },
  out: { label: 'Out of stock', tone: 'critical' },
}

/**
 * Stock on hand.
 *
 * A promoter sees their own store; head office sees any store, plus a matrix
 * across the main stores. Nothing here is ever valued — once stock leaves the
 * warehouse it is no longer Legendary's, and SQL Accounting owns the money
 * (Q35). This is a count for visibility, and says so.
 */
export function StockPage() {
  const data = useData()
  const user = useCurrentUser()
  const isPromoter = user?.role === 'promoter'
  const mainStores = locationsInChannel('main').filter((l) => l.status === 'open')

  const [locationId, setLocationId] = useState(
    isPromoter ? (user?.locationId ?? '') : mainStores[0]?.id ?? '',
  )
  const [showMatrix, setShowMatrix] = useState(!isPromoter)
  /** The product whose movements are open. */
  const [item, setItem] = useState<StockRow | null>(null)

  const rows = useMemo(() => selectStock(data, locationId), [data, locationId])
  const low = rows.filter((r) => r.status !== 'ok')
  const totalUnits = rows.reduce((a, r) => a + r.onHand, 0)
  const location = locationById(locationId)

  const matrix = useMemo(
    () => new Map(mainStores.map((l) => [l.id, selectStock(data, l.id)])),
    [data, mainStores],
  )

  const columns: Column<StockRow>[] = [
    {
      key: 'sku',
      header: 'Product',
      render: (r) => (
        <>
          <p className="text-[13px] leading-tight text-ink">{r.label}</p>
          <p className="readout text-[10.5px] text-ink-3">{r.code}</p>
        </>
      ),
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      width: '90px',
      render: (r) => <span className="readout text-[13px] text-ink">{num(r.onHand)}</span>,
    },
    {
      key: 'cover',
      header: 'Days left',
      width: '130px',
      render: (r) => (
        <div>
          <p className="readout text-[12px] text-ink-2">
            {r.daysCover === null ? 'not moving' : `${r.daysCover.toFixed(1)} days`}
          </p>
          <ProgressBar
            className="mt-1"
            value={r.daysCover === null ? 0 : Math.min(1, r.daysCover / 21)}
          />
        </div>
      ),
    },
    {
      key: 'velocity',
      header: 'Per day',
      align: 'right',
      width: '80px',
      render: (r) => (
        <span className="readout text-[12.5px] text-ink-2">{r.velocity.toFixed(1)}</span>
      ),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      width: '92px',
      render: (r) => (
        <span className="readout text-[12.5px] text-ink-3">{num(r.reorderPoint)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      width: '124px',
      render: (r) => (
        <Badge tone={STATUS[r.status].tone} icon={r.status === 'ok' ? 'check' : 'alert'}>
          {STATUS[r.status].label}
        </Badge>
      ),
    },
    {
      key: 'suggested',
      header: 'Suggested',
      align: 'right',
      width: '92px',
      render: (r) =>
        r.suggested > 0 ? (
          <span className="readout text-[13px] text-primary">+{num(r.suggested)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ]

  const tone = (status?: StockRow['status']) =>
    status === 'out'
      ? 'bg-critical/18 text-critical border-critical/40'
      : status === 'critical'
        ? 'bg-critical/10 text-critical border-critical/25'
        : status === 'low'
          ? 'bg-warn/10 text-warn border-warn/25'
          : 'bg-surface-2 text-ink-2 border-line'

  const exportMatrix = () =>
    downloadCsv(
      'legendary-stock.csv',
      ['Product', ...mainStores.map((l) => l.name)],
      skus.map((s) => [
        s.label,
        ...mainStores.map((l) => matrix.get(l.id)?.find((r) => r.skuId === s.id)?.onHand ?? 0),
      ]),
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{isPromoter ? location?.name : 'Head Office'}</p>
          <h1 className="page-title mt-1">
            Stock on hand
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Counted at the last closing. A count for visibility only — SQL Accounting remains the
            record of what stock is worth.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isPromoter && (
            <>
              <Select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-9 w-[190px] text-[12.5px]"
              >
                {mainStores.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Button
                variant={showMatrix ? 'primary' : 'secondary'}
                icon="grid"
                onClick={() => setShowMatrix((s) => !s)}
              >
                All stores
              </Button>
            </>
          )}
          <Button variant="secondary" icon="download" onClick={exportMatrix}>
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Units on hand"
          value={totalUnits}
          format={(n) => num(Math.round(n))}
          tone="violet"
          icon="box"
        />
        <StatTile
          label="At or below reorder"
          value={low.length}
          format={(n) => num(Math.round(n))}
          footnote={low.length ? 'top-up suggested' : 'all healthy'}
          tone="blue"
          icon="alert"
        />
        <StatTile
          label="Out of stock"
          value={rows.filter((r) => r.status === 'out').length}
          format={(n) => num(Math.round(n))}
          tone="cyan"
          icon="alert"
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow={location?.name ?? 'Store'}
          title={`${rows.length} products`}
          meta="Suggested quantities are rounded up to whole cases."
        />
        <Rule />
        <PanelBody>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.skuId}
            onRowClick={setItem}
            dense
          />

          <Modal
            open={item !== null}
            onClose={() => setItem(null)}
            title={item?.label ?? ''}
            subtitle={
              item
                ? `${item.code} · ${item.onHand} on the shelf at ${location?.shortName ?? ''}`
                : undefined
            }
            width="max-w-lg"
          >
            {item && (
              <StockItemDetail locationId={locationId} skuId={item.skuId} row={item} />
            )}
          </Modal>
        </PanelBody>
      </Panel>

      {showMatrix && !isPromoter && (
        <Panel>
          <PanelHeader
            eyebrow="Estate"
            title="Every main store"
            meta="Amber is at the reorder level, red is half of it or less."
          />
          <Rule />
          <PanelBody>
            <div className="scroll-x">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wide2 text-ink-3">
                      Product
                    </th>
                    {mainStores.map((l) => (
                      <th
                        key={l.id}
                        className="pb-2 text-center text-[10px] font-normal text-ink-3"
                        title={l.name}
                      >
                        {l.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skus.map((s) => (
                    <tr key={s.id} className="border-b border-line/70 last:border-0">
                      <td className="py-2 pr-4">
                        <p className="text-[13px] leading-tight text-ink">{s.label}</p>
                        <p className="text-[11px] text-ink-3">reorder at {s.reorderPoint}</p>
                      </td>
                      {mainStores.map((l) => {
                        const cell = matrix.get(l.id)?.find((r) => r.skuId === s.id)
                        return (
                          <td key={l.id} className="px-1 py-2 text-center">
                            <span
                              title={`${l.name} · ${s.label} · ${cell?.onHand ?? 0} on hand`}
                              className={`readout mx-auto flex h-7 min-w-[38px] items-center justify-center rounded-lg border text-[12px] ${tone(cell?.status)}`}
                            >
                              {cell?.onHand ?? 0}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>
      )}
    </div>
  )
}
