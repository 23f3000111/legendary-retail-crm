import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { originSlicesFrom } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { products, skuById, sellableSkus, VARIANT_LABEL } from '../../data/products'
import { countries, countryByCode } from '../../data/countries'
import { formatDate } from '../../lib/dates'
import { num, rm } from '../../lib/format'

/**
 * Recording a sale at the counter.
 *
 * This is the screen that makes "exactly which nationality bought which
 * perfume" (Q29) possible without anyone doing an hour of recall at 11pm: the
 * promoter taps the perfume, then the country, as the sale happens. Everything
 * is sized for a finger on an iPad (Q78) rather than a mouse.
 */
export function Sell() {
  const user = useCurrentUser()
  const data = useData()
  const addSaleLine = useData((s) => s.addSaleLine)
  const removeSaleLine = useData((s) => s.removeSaleLine)
  const push = useToasts((s) => s.push)

  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  const lines = data.liveLines[locationId] ?? []

  const [skuId, setSkuId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [showAllCountries, setShowAllCountries] = useState(false)

  const sku = skuId ? skuById(skuId) : null
  const needsCountry = location?.recordsCountries ?? false

  // The store's usual nationalities first — the rest are one tap further away.
  const quickCountries = location?.originProfile ?? ['MY', 'CN', 'SG', 'ID', 'IN']
  const otherCountries = countries.filter((c) => !quickCountries.includes(c.code))

  const todayTotal = lines.reduce(
    (a, l) => a + l.qty * (skuById(l.skuId)?.priceMYR ?? 0),
    0,
  )
  const todayUnits = lines.reduce((a, l) => a + l.qty, 0)

  const mix = useMemo(() => {
    const tally = new Map<string, { units: number; revenue: number }>()
    for (const l of lines) {
      if (!l.countryCode) continue
      const b = tally.get(l.countryCode) ?? { units: 0, revenue: 0 }
      b.units += l.qty
      b.revenue += l.qty * (skuById(l.skuId)?.priceMYR ?? 0)
      tally.set(l.countryCode, b)
    }
    return originSlicesFrom(tally)
  }, [lines])

  const record = (countryCode?: string) => {
    if (!skuId) return
    addSaleLine(locationId, { skuId, qty, ...(countryCode ? { countryCode } : {}) })
    push(
      `${qty} × ${sku?.label}${countryCode ? ` · ${countryByCode(countryCode)?.name}` : ''} recorded`,
      'good',
    )
    setSkuId(null)
    setQty(1)
    setShowAllCountries(false)
  }

  if (!location || !user) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{location.name}</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">
            Record a sale
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {formatDate(data.today)} · tap the perfume, then the country
          </p>
        </div>
        <Link to="/close">
          <Button variant="secondary" icon="clipboard">
            Close the day
          </Button>
        </Link>
      </div>

      {/* ── Running total ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-grad-violet px-4 py-3.5 text-white shadow-tile">
          <p className="eyebrow text-white/75">Today so far</p>
          <p className="readout mt-2 font-display text-[26px] font-semibold leading-none">
            {rm(todayTotal)}
          </p>
        </div>
        <div className="rounded-2xl bg-grad-blue px-4 py-3.5 text-white shadow-tile">
          <p className="eyebrow text-white/75">Units</p>
          <p className="readout mt-2 font-display text-[26px] font-semibold leading-none">
            {num(todayUnits)}
          </p>
        </div>
        <div className="rounded-2xl bg-grad-cyan px-4 py-3.5 text-white shadow-tile">
          <p className="eyebrow text-white/75">Sales logged</p>
          <p className="readout mt-2 font-display text-[26px] font-semibold leading-none">
            {num(lines.length)}
          </p>
        </div>
      </div>

      {/* ── Step 1: the perfume ───────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Step 1"
          title="Which perfume?"
          meta={sku ? `${sku.label} — now choose how many` : 'Tap one to start a sale.'}
          action={
            sku ? (
              <Button size="sm" variant="ghost" icon="x" onClick={() => setSkuId(null)}>
                Change
              </Button>
            ) : undefined
          }
        />
        <Rule />
        <PanelBody>
          {!sku ? (
            <div className="space-y-4">
              {products.map((p) => {
                const variants = sellableSkus.filter((s) => s.productId === p.id)
                if (!variants.length) return null
                return (
                  <div key={p.id}>
                    <p className="eyebrow mb-2">{p.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setSkuId(v.id)}
                          className="min-h-[54px] rounded-xl border border-line bg-surface px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-glass"
                        >
                          <span className="block text-[13.5px] font-medium text-ink">
                            {v.variant === 'retail' ? v.size : VARIANT_LABEL[v.variant]}
                          </span>
                          <span className="readout block text-[11.5px] text-ink-3">
                            {rm(v.priceMYR)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[18px] font-semibold text-ink">{sku.label}</p>
                <p className="readout text-[13px] text-ink-2">
                  {rm(sku.priceMYR)} each · {rm(sku.priceMYR * qty)} for {qty}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <IconButton
                  name="minus"
                  label="One fewer"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="h-12 w-12 border border-line bg-surface"
                />
                <span className="readout w-10 text-center font-display text-[24px] font-semibold text-ink">
                  {qty}
                </span>
                <IconButton
                  name="plus"
                  label="One more"
                  onClick={() => setQty((q) => q + 1)}
                  className="h-12 w-12 border border-primary/40 bg-primary/10 text-primary"
                />
              </div>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* ── Step 2: the country ───────────────────────────────────────── */}
      <AnimatePresence>
        {sku && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <Panel>
              <PanelHeader
                eyebrow="Step 2"
                title={needsCountry ? 'Where is the customer from?' : 'Confirm the sale'}
                meta={
                  needsCountry
                    ? 'Tap the country to record the sale. Ask if you are not sure.'
                    : 'This store does not record customer countries.'
                }
              />
              <Rule />
              <PanelBody>
                {needsCountry ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {quickCountries.map((code) => {
                        const c = countryByCode(code)
                        return (
                          <button
                            key={code}
                            onClick={() => record(code)}
                            className="min-h-[56px] min-w-[124px] rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/14"
                          >
                            <span className="block text-[19px] leading-none">{c?.flag}</span>
                            <span className="mt-1 block text-[13px] font-medium text-ink">
                              {c?.name}
                            </span>
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setShowAllCountries((s) => !s)}
                        className="min-h-[56px] rounded-xl border border-line bg-surface px-4 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {showAllCountries ? 'Fewer' : 'Somewhere else…'}
                      </button>
                    </div>

                    {showAllCountries && (
                      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                        {otherCountries.map((c) => (
                          <button
                            key={c.code}
                            onClick={() => record(c.code)}
                            className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-[13px] text-ink transition-colors hover:border-primary/45"
                          >
                            {c.flag} {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button variant="primary" icon="check" onClick={() => record()}>
                    Record {qty} × {sku.label}
                  </Button>
                )}
              </PanelBody>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Today's log ───────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader
            eyebrow="Today"
            title={`${lines.length} sales logged`}
            meta="Tap the cross to remove a mistake."
          />
          <Rule />
          <PanelBody className="space-y-2">
            {lines.length === 0 ? (
              <EmptyState
                icon="plus"
                title="Nothing logged yet"
                body="Record each sale as it happens and tonight's closing becomes a quick check."
              />
            ) : (
              [...lines].reverse().map((l, revIndex) => {
                const index = lines.length - 1 - revIndex
                const s = skuById(l.skuId)
                const c = l.countryCode ? countryByCode(l.countryCode) : null
                return (
                  <div
                    key={`${index}-${l.skuId}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                  >
                    <span className="readout text-[13px] font-semibold text-ink">{l.qty} ×</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s?.label}</span>
                    {c && (
                      <Badge tone="active">
                        {c.flag} {c.name}
                      </Badge>
                    )}
                    <span className="readout text-[12.5px] text-ink-2">
                      {rm(l.qty * (s?.priceMYR ?? 0))}
                    </span>
                    <IconButton
                      name="x"
                      label="Remove this sale"
                      onClick={() => {
                        removeSaleLine(locationId, index)
                        push('Sale removed', 'info')
                      }}
                    />
                  </div>
                )
              })
            )}
          </PanelBody>
        </Panel>

        <Panel className="h-fit">
          <PanelHeader eyebrow="Live" title="Countries today" />
          <Rule />
          <PanelBody>
            <OriginRibbon slices={mix} height={40} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}
