import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Icon } from '../../components/ui/icons'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/DataTable'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { CountryPicker } from '../../components/CountryPicker'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { originSlicesFrom } from '../../store/selectors'
import { locationById } from '../../data/locations'
import { products, skuById, sellableSkus, VARIANT_LABEL } from '../../data/products'
import {
  countryByCode,
  topCountries,
  MALAYSIA_SEGMENT_LABEL,
  type MalaysiaSegment,
} from '../../data/countries'
import { formatDate } from '../../lib/dates'
import { num, rm } from '../../lib/format'
import type { SaleLine } from '../../data/types'

/**
 * Recording a sale at the counter.
 *
 * One customer is one sale, however many bottles they buy. Everything they are
 * taking goes into the basket first, and the country is asked **once** at the
 * end — the client was clear that a person buying three things should not be
 * recorded three times over.
 *
 * That ordering is also what makes "exactly which nationality bought which
 * perfume" (Q29) survive a busy Saturday: the promoter is answering one
 * question per customer, not one per bottle. Everything is sized for a finger
 * on an iPad (Q78).
 */
export function Sell() {
  const user = useCurrentUser()
  const data = useData()
  const recordSale = useData((s) => s.recordSale)
  const removeSaleLine = useData((s) => s.removeSaleLine)
  const push = useToasts((s) => s.push)

  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  const lines = data.liveLines[locationId] ?? []

  /** What this customer is buying, before it is committed. */
  const [basket, setBasket] = useState<SaleLine[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const needsCountry = location?.recordsCountries ?? false

  // The store's usual nationalities first; everything else is behind search.
  const quickCodes = (location?.originProfile ?? topCountries.slice(0, 5).map((c) => c.code)).slice(
    0,
    5,
  )

  const basketUnits = basket.reduce((a, l) => a + l.qty, 0)
  const basketTotal = basket.reduce(
    (a, l) => a + l.qty * (skuById(l.skuId)?.priceMYR ?? 0),
    0,
  )

  const todayTotal = lines.reduce((a, l) => a + l.qty * (skuById(l.skuId)?.priceMYR ?? 0), 0)
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

  const add = (skuId: string) =>
    setBasket((b) => {
      const found = b.find((l) => l.skuId === skuId)
      return found
        ? b.map((l) => (l.skuId === skuId ? { ...l, qty: l.qty + 1 } : l))
        : [...b, { skuId, qty: 1 }]
    })

  const bump = (skuId: string, by: number) =>
    setBasket((b) =>
      b
        .map((l) => (l.skuId === skuId ? { ...l, qty: l.qty + by } : l))
        .filter((l) => l.qty > 0),
    )

  const commit = (countryCode?: string, segment?: MalaysiaSegment) => {
    if (basket.length === 0) return
    recordSale({ locationId, lines: basket, countryCode, segment })
    const where = countryCode
      ? ` · ${countryByCode(countryCode)?.name}${segment ? ` (${MALAYSIA_SEGMENT_LABEL[segment]})` : ''}`
      : ''
    push(`Sale recorded — ${basketUnits} ${basketUnits === 1 ? 'unit' : 'units'}${where}`, 'good')
    setBasket([])
    setPickerOpen(false)
  }

  if (!location || !user) return null

  return (
    <div className="space-y-5">
      <CountryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(code, segment) => commit(code, segment)}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{location.name}</p>
          <h1 className="page-title mt-1">
            Record a sale
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {formatDate(data.today)} · add everything they are buying, then the country
          </p>
        </div>
        <Link to="/close" className="shrink-0">
          <Button variant="secondary" icon="clipboard">
            Close the day
          </Button>
        </Link>
      </div>

      {/* ── Running total ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl bg-grad-violet px-4 py-3.5 text-white shadow-tile">
          <p className="eyebrow text-white/75">Today so far</p>
          <p className="readout mt-2 font-display text-[22px] font-semibold leading-none sm:text-[26px]">
            {rm(todayTotal)}
          </p>
        </div>
        <div className="rounded-2xl bg-grad-blue px-4 py-3.5 text-white shadow-tile">
          <p className="eyebrow text-white/75">Units</p>
          <p className="readout mt-2 font-display text-[22px] font-semibold leading-none sm:text-[26px]">
            {num(todayUnits)}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl bg-grad-cyan px-4 py-3.5 text-white shadow-tile sm:col-span-1">
          <p className="eyebrow text-white/75">Customers served</p>
          <p className="readout mt-2 font-display text-[22px] font-semibold leading-none sm:text-[26px]">
            {num(lines.length)}
          </p>
        </div>
      </div>

      {/* ── Step 1: everything they are buying ────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Step 1"
          title="What are they buying?"
          meta="Tap each item. Tap again for a second one."
          action={
            basket.length > 0 ? (
              <Button size="sm" variant="ghost" icon="x" onClick={() => setBasket([])}>
                Start again
              </Button>
            ) : undefined
          }
        />
        <Rule />
        <PanelBody>
          <div className="space-y-4">
            {products.map((p) => {
              const variants = sellableSkus.filter((s) => s.productId === p.id)
              if (!variants.length) return null
              return (
                <div key={p.id}>
                  <p className="eyebrow mb-2">{p.name}</p>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {variants.map((v) => {
                      const inBasket = basket.find((l) => l.skuId === v.id)
                      return (
                        <button
                          key={v.id}
                          onClick={() => add(v.id)}
                          className={`relative min-h-[56px] rounded-xl border px-4 py-2.5 text-left transition-all duration-200 active:scale-[0.98] sm:min-w-[130px] sm:hover:-translate-y-0.5 ${
                            inBasket
                              ? 'border-primary bg-primary/12 shadow-glass'
                              : 'border-line bg-surface sm:hover:border-primary/45 sm:hover:shadow-glass'
                          }`}
                        >
                          <span className="block text-[13.5px] font-medium text-ink">
                            {v.variant === 'retail' ? v.size : VARIANT_LABEL[v.variant]}
                          </span>
                          <span className="readout block text-[11.5px] text-ink-3">
                            {rm(v.priceMYR)}
                          </span>
                          {inBasket && (
                            <span className="readout absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                              {inBasket.qty}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </PanelBody>
      </Panel>

      {/* ── The basket, and step 2 ────────────────────────────────────── */}
      <AnimatePresence>
        {basket.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            <Panel>
              <PanelHeader
                eyebrow="This customer"
                title={`${basketUnits} ${basketUnits === 1 ? 'item' : 'items'} · ${rm(basketTotal)}`}
                meta="Adjust the quantities if you need to."
              />
              <Rule />
              <PanelBody className="space-y-2">
                {basket.map((l) => {
                  const s = skuById(l.skuId)
                  return (
                    <div
                      key={l.skuId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                    >
                      <span className="min-w-0 flex-1 basis-full truncate text-[13.5px] text-ink sm:basis-auto">
                        {s?.label}
                      </span>
                      <span className="readout text-[12.5px] text-ink-2">
                        {rm(l.qty * (s?.priceMYR ?? 0))}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <IconButton
                          name="minus"
                          label="One fewer"
                          onClick={() => bump(l.skuId, -1)}
                          className="h-10 w-10 border border-line bg-surface"
                        />
                        <span className="readout w-8 text-center font-display text-[19px] font-semibold text-ink">
                          {l.qty}
                        </span>
                        <IconButton
                          name="plus"
                          label="One more"
                          onClick={() => bump(l.skuId, 1)}
                          className="h-10 w-10 border border-primary/40 bg-primary/10 text-primary"
                        />
                      </div>
                    </div>
                  )
                })}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                eyebrow="Step 2"
                title={needsCountry ? 'Where is the customer from?' : 'Confirm the sale'}
                meta={
                  needsCountry
                    ? 'One answer for the whole basket. Ask if you are not sure.'
                    : 'This store does not record customer countries.'
                }
              />
              <Rule />
              <PanelBody>
                {needsCountry ? (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {quickCodes.map((code) => {
                      const c = countryByCode(code)
                      if (!c) return null
                      return (
                        <button
                          key={code}
                          onClick={() =>
                            c.code === 'MY' ? setPickerOpen(true) : commit(c.code)
                          }
                          className="min-h-[62px] rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5 text-left transition-all duration-200 active:scale-[0.98] sm:min-w-[128px] sm:hover:-translate-y-0.5 sm:hover:border-primary/60 sm:hover:bg-primary/14"
                        >
                          <span className="block text-[19px] leading-none">{c.flag}</span>
                          <span className="mt-1 block truncate text-[13px] font-medium text-ink">
                            {c.name}
                          </span>
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="col-span-2 flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-primary/45 hover:text-ink sm:col-span-1 sm:min-w-[150px]"
                    >
                      <Icon name="search" className="h-4 w-4" />
                      Search all countries
                    </button>
                  </div>
                ) : (
                  <Button variant="primary" icon="check" onClick={() => commit()}>
                    Record this sale · {rm(basketTotal)}
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
            title={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} logged`}
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
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5"
                  >
                    <span className="readout text-[13px] font-semibold text-ink">{l.qty} ×</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s?.label}</span>
                    {c && (
                      <Badge tone="active">
                        {c.flag} {c.name}
                        {l.segment ? ` · ${MALAYSIA_SEGMENT_LABEL[l.segment]}` : ''}
                      </Badge>
                    )}
                    <span className="readout text-[12.5px] text-ink-2">
                      {rm(l.qty * (s?.priceMYR ?? 0))}
                    </span>
                    <IconButton
                      name="x"
                      label="Remove this line"
                      onClick={() => {
                        removeSaleLine(locationId, index)
                        push('Line removed', 'info')
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
