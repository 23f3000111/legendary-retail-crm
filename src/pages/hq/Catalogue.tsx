import { useState } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToasts } from '../../components/ui/Toast'
import { ProductEditor } from '../../components/ProductEditor'
import { useData } from '../../store/useData'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Icon } from '../../components/ui/icons'
import { useCan } from '../../store/useAuth'
import {
  collections,
  hasListPrice,
  products,
  productById,
  skus,
  VARIANT_LABEL,
  type Sku,
} from '../../data/products'
import { downloadCsv } from '../../lib/exportCsv'
import { num, rm } from '../../lib/format'

/**
 * The product list.
 *
 * Every variant is its own line because that is how they are counted (Q54) —
 * the sizes, refills, gift sets and testers each have their own reorder level.
 *
 * Davy, Kelly and Chloe add products, change their prices and reorder levels,
 * and take them off, with no approval needed (Q56; client, 20 October). A
 * product taken off leaves the counter, the count and ordering, and is listed
 * at the foot of the page, where it can be put back.
 */
export function Catalogue() {
  // Re-read whenever the records change: the range is rebuilt from them.
  useData()
  const capability = useCan()
  const push = useToasts((s) => s.push)
  const removeProduct = useData((s) => s.removeProduct)
  const restoreProduct = useData((s) => s.restoreProduct)
  const keeps = capability.canEdit && capability.manageCatalogue
  const [editing, setEditing] = useState<Sku | 'new' | null>(null)
  const [takingOff, setTakingOff] = useState<Sku | null>(null)

  const onRange = skus.filter((s) => !s.removed)
  const takenOff = skus.filter((s) => s.removed)
  const sellableCount = onRange.filter((s) => s.sellable).length

  const columns: Column<Sku>[] = [
    {
      key: 'label',
      header: 'Product',
      render: (s) => (
        <>
          <p className="text-[13px] leading-tight text-ink">{productById(s.productId)?.name}</p>
          <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
        </>
      ),
    },
    {
      key: 'variant',
      header: 'Variant',
      render: (s) => (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-ink-2">{VARIANT_LABEL[s.variant]}</span>
          {!s.sellable && <Badge tone="neutral">Not for sale</Badge>}
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (s) => <span className="text-[12.5px] text-ink-2">{s.size}</span>,
    },
    {
      key: 'collection',
      header: 'Collection',
      render: (s) => (
        <span className="text-[12.5px] text-ink-2">
          {productById(s.productId)?.collection ?? '—'}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Prices',
      align: 'right',
      width: '170px',
      render: (s) =>
        !s.sellable ? (
          <span className="text-[12px] text-ink-3">not sold</span>
        ) : hasListPrice(s) ? (
          <div>
            <span className="readout text-[13px] text-ink">{rm(s.promotionPriceMYR)}</span>
            <p className="readout text-[10.5px] text-ink-3">was {rm(s.retailPriceMYR)}</p>
            {/* Every price the counter offers (client, 15 October). */}
            {s.promotion2MYR !== undefined && (
              <p className="readout text-[10.5px] text-ink-3">promotion 2 {rm(s.promotion2MYR)}</p>
            )}
            {s.canGoFree && <p className="readout text-[10.5px] text-ink-3">or FOC</p>}
          </div>
        ) : (
          // A vial: always given free (client, 6 October).
          <span className="text-[12px] font-semibold text-ink-2">FOC</span>
        ),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      render: (s) => <span className="readout text-[12.5px] text-ink-2">{num(s.reorderPoint)}</span>,
    },
    {
      key: 'case',
      header: 'Case size',
      align: 'right',
      render: (s) => <span className="readout text-[12.5px] text-ink-3">{num(s.caseSize)}</span>,
    },
    ...(keeps
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '96px',
            render: (s: Sku) => (
              <div className="flex justify-end gap-0.5">
                <IconButton name="pencil" label={`Change ${s.label}`} onClick={() => setEditing(s)} />
                <IconButton name="x" label={`Take ${s.label} off the range`} onClick={() => setTakingOff(s)} />
              </div>
            ),
          },
        ]
      : []),
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-products.csv',
      [
        'Product',
        'Variant',
        'Size',
        'Code',
        'Collection',
        'Retail MYR',
        'Promotion MYR',
        'Promotion 2 MYR',
        'Can go FOC',
        'Reorder at',
        'Case size',
      ],
      onRange.map((s) => [
        productById(s.productId)?.name ?? s.productId,
        VARIANT_LABEL[s.variant],
        s.size,
        s.code,
        productById(s.productId)?.collection ?? '',
        hasListPrice(s) ? s.retailPriceMYR : '',
        hasListPrice(s) ? s.promotionPriceMYR : '',
        s.promotion2MYR ?? '',
        s.canGoFree ? 'Yes' : '',
        s.reorderPoint,
        s.caseSize,
      ]),
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Head Office</p>
          <h1 className="page-title mt-1">
            Products
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Every size, refill, gift set and tester is counted separately, so each one has its own
            line and its own reorder level.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="download" onClick={exportRows}>
            Export
          </Button>
          {keeps && (
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              Add a product
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-[12.5px] leading-relaxed text-ink-2">
          Every line carries a promotion and a retail price; everything at RM 188 can also go at RM 198,
          Promotion 2. Which price a location's revenue is counted on comes from the store list — BSAS
          and Sasa are on the retail price, everywhere else is on the promotion price.
          {keeps && ' Change a line with the pencil, or take it off the range with the cross.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Products"
          value={products.length}
          format={(n) => `${Math.round(n)}`}
          footnote={`${sellableCount} sellable lines`}
          tone="violet"
          icon="sparkle"
        />
        <StatTile
          label="Countable lines"
          value={onRange.length}
          format={(n) => num(Math.round(n))}
          footnote="every size and variant"
          tone="blue"
          icon="box"
        />
        <StatTile
          label="Collections"
          value={collections.length}
          format={(n) => num(Math.round(n))}
          tone="cyan"
          icon="grid"
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Catalogue"
          title={`${onRange.length} lines`}
          meta="Only revenue is held against a product — cost and profit stay in SQL Accounting."
        />
        <Rule />
        <PanelBody>
          <DataTable columns={columns} rows={onRange} rowKey={(s) => s.id} dense />
        </PanelBody>
      </Panel>

      {takenOff.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Taken off"
            title={`${takenOff.length} ${takenOff.length === 1 ? 'line' : 'lines'} off the range`}
            meta="Not sold, counted or ordered any more. Every sale, count and order already made still shows them."
          />
          <Rule />
          <PanelBody className="space-y-2">
            {takenOff.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{s.label}</p>
                  <p className="readout text-[10.5px] text-ink-3">{s.code}</p>
                </div>
                {keeps && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="refresh"
                    onClick={() => {
                      const result = restoreProduct(s.id)
                      push(result.ok ? `${s.label} is back on the range` : (result.error ?? 'That did not work.'), result.ok ? 'good' : 'critical')
                    }}
                  >
                    Put back
                  </Button>
                )}
              </div>
            ))}
          </PanelBody>
        </Panel>
      )}

      <ProductEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        sku={editing && editing !== 'new' ? editing : undefined}
        onSaved={(message) => push(message, 'good')}
      />

      <Modal
        open={takingOff !== null}
        onClose={() => setTakingOff(null)}
        title={`Take ${takingOff?.label ?? 'this'} off the range?`}
        subtitle="It leaves Record a sale, the nightly count and the order list, at every store. Past sales, counts and orders keep it, and it can be put back."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTakingOff(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="x"
              onClick={() => {
                if (!takingOff) return
                const result = removeProduct(takingOff.id)
                push(
                  result.ok ? `${takingOff.label} taken off the range` : (result.error ?? 'That did not work.'),
                  result.ok ? 'info' : 'critical',
                )
                setTakingOff(null)
              }}
            >
              Take it off
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">
          Any stock of it still at a store stays where it is; it is simply no longer counted or sold.
        </p>
      </Modal>
    </div>
  )
}
