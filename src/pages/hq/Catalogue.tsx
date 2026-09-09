import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { StatTile } from '../../components/ui/StatTile'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Icon } from '../../components/ui/icons'
import { useCan } from '../../store/useAuth'
import {
  collections,
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
 * Chloe adds and edits products, and no approval is needed (Q56). Every variant
 * is its own line because that is how they are counted (Q54) — the sizes,
 * refills, gift sets and testers each have their own reorder level.
 *
 * The banner is deliberate: we have nine of the nineteen products confirmed, and
 * the screen says so rather than quietly showing a short list.
 */
export function Catalogue() {
  const capability = useCan()
  const sellableCount = skus.filter((s) => s.sellable).length

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
      header: 'Retail · Promotion',
      align: 'right',
      width: '170px',
      render: (s) =>
        s.sellable ? (
          <div>
            <span className="readout text-[13px] text-ink">{rm(s.promotionPriceMYR)}</span>
            <p className="readout text-[10.5px] text-ink-3">was {rm(s.retailPriceMYR)}</p>
          </div>
        ) : (
          <span className="text-[12px] text-ink-3">not sold</span>
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
  ]

  const exportRows = () =>
    downloadCsv(
      'legendary-products.csv',
      ['Product', 'Variant', 'Size', 'Code', 'Collection', 'Revenue MYR', 'Reorder at', 'Case size'],
      skus.map((s) => [
        productById(s.productId)?.name ?? s.productId,
        VARIANT_LABEL[s.variant],
        s.size,
        s.code,
        productById(s.productId)?.collection ?? '',
        s.sellable ? s.retailPriceMYR : '',
        s.sellable ? s.promotionPriceMYR : '',
        s.offerMYR ?? '',
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
          {capability.manageCatalogue && (
            <Button variant="primary" icon="plus">
              Add a product
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-[12.5px] leading-relaxed text-ink-2">
          Every line carries two prices. Which one a location's revenue is counted on comes from
          the store list — BSAS and Sasa are on the retail price, everywhere else is on the
          promotion price.
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
          value={skus.length}
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
          title={`${skus.length} lines`}
          meta="Only revenue is held against a product — cost and profit stay in SQL Accounting."
        />
        <Rule />
        <PanelBody>
          <DataTable columns={columns} rows={skus} rowKey={(s) => s.id} dense />
        </PanelBody>
      </Panel>
    </div>
  )
}
