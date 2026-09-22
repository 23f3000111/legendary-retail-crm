import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, PanelBody, PanelHeader, Rule } from '../../components/ui/Panel'
import { Button, IconButton } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, NumberInput } from '../../components/ui/Field'
import { Icon } from '../../components/ui/icons'
import { Badge } from '../../components/ui/Badge'
import { Flag } from '../../components/ui/Flag'
import { EmptyState } from '../../components/ui/DataTable'
import { OriginRibbon } from '../../components/charts/OriginRibbon'
import { CountryPicker } from '../../components/CountryPicker'
import { useData } from '../../store/useData'
import { useCurrentUser } from '../../store/useAuth'
import { useToasts } from '../../components/ui/Toast'
import { originSlicesFrom } from '../../store/selectors'
import { locationById } from '../../data/locations'
import {
  lineUnitPrice,
  priceAtTier,
  products,
  skuById,
  sellableSkus,
  tiersFor,
  TIER_LABEL,
  type PriceTier,
} from '../../data/products'
import {
  countryByCode,
  topCountries,
  MALAYSIA_SEGMENT_LABEL,
  type MalaysiaSegment,
} from '../../data/countries'
import { formatDate, formatTimestamp } from '../../lib/dates'
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
 *
 * Every item is offered at each price it can go for — promotion, retail, and
 * the offer price on the Wishes — because the same bottle is rung up at more
 * than one price in a day and the takings are only right if the line records
 * which. The same item at two prices is two lines in the basket.
 */
export function Sell() {
  const user = useCurrentUser()
  const data = useData()
  const recordSale = useData((s) => s.recordSale)
  const removeSaleLine = useData((s) => s.removeSaleLine)
  const removeSale = useData((s) => s.removeSale)
  const push = useToasts((s) => s.push)

  const locationId = user?.locationId ?? ''
  const location = locationById(locationId)
  const lines = data.liveLines[locationId] ?? []

  /** What this customer is buying, before it is committed. */
  const [basket, setBasket] = useState<SaleLine[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The "Other" price being typed for an item, before it goes in the basket. */
  const [otherFor, setOtherFor] = useState<string | null>(null)
  const [otherAmount, setOtherAmount] = useState('')

  const needsCountry = location?.recordsCountries ?? false
  // Which of the two prices this store's revenue is counted on (Revision 2).
  const basis = location?.priceBasis ?? 'promotion'

  // The store's usual nationalities first; everything else is behind search.
  const quickCodes = (location?.originProfile ?? topCountries.slice(0, 5).map((c) => c.code)).slice(
    0,
    5,
  )

  const basketUnits = basket.reduce((a, l) => a + l.qty, 0)
  const basketTotal = basket.reduce(
    (a, l) => a + l.qty * lineUnitPrice(l, basis),
    0,
  )

  const todayTotal = lines.reduce((a, l) => a + l.qty * lineUnitPrice(l, basis), 0)
  const todayUnits = lines.reduce((a, l) => a + l.qty, 0)
  // A customer is a basket, however many bottles were in it.
  const customers = new Set(lines.map((l) => l.saleId ?? l.id)).size

  /** The day's sales, one group per customer, newest first. */
  const sales = useMemo(() => {
    const groups = new Map<string, SaleLine[]>()
    for (const l of lines) {
      const k = l.saleId ?? l.id ?? String(lines.indexOf(l))
      ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(l)
    }
    return [...groups.entries()].reverse()
  }, [lines])

  const mix = useMemo(() => {
    const tally = new Map<string, { units: number; revenue: number }>()
    for (const l of lines) {
      if (!l.countryCode) continue
      const b = tally.get(l.countryCode) ?? { units: 0, revenue: 0 }
      b.units += l.qty
      b.revenue += l.qty * lineUnitPrice(l, basis)
      tally.set(l.countryCode, b)
    }
    return originSlicesFrom(tally)
  }, [lines])

  // A basket line is an item *at a price*, so the same bottle at retail and at
  // promotion sit side by side rather than merging — and two "other" prices
  // are two lines as well.
  const same = (l: SaleLine, skuId: string, tier: PriceTier, unitPrice: number) =>
    l.skuId === skuId && l.priceTier === tier && l.unitPriceMYR === unitPrice

  const add = (skuId: string, tier: PriceTier, unitPrice: number) =>
    setBasket((b) => {
      const found = b.find((l) => same(l, skuId, tier, unitPrice))
      return found
        ? b.map((l) => (same(l, skuId, tier, unitPrice) ? { ...l, qty: l.qty + 1 } : l))
        : [...b, { skuId, qty: 1, priceTier: tier, unitPriceMYR: unitPrice }]
    })

  /** A named price goes straight in; "Other" asks for the figure first. */
  const tap = (skuId: string, tier: PriceTier) => {
    if (tier === 'other') {
      setOtherFor(skuId)
      setOtherAmount('')
      return
    }
    add(skuId, tier, priceAtTier(skuById(skuId), tier))
  }

  const confirmOther = () => {
    const amount = Math.round(Number(otherAmount) * 100) / 100
    if (!otherFor || !(amount > 0)) return
    add(otherFor, 'other', amount)
    setOtherFor(null)
  }

  const bump = (line: SaleLine, by: number) =>
    setBasket((b) =>
      b
        .map((l) => (l === line ? { ...l, qty: l.qty + by } : l))
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

      <Modal
        open={otherFor !== null}
        onClose={() => setOtherFor(null)}
        title="What did it go for?"
        subtitle={otherFor ? skuById(otherFor)?.label : undefined}
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOtherFor(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={confirmOther} disabled={!(Number(otherAmount) > 0)}>
              Add to the basket
            </Button>
          </>
        }
      >
        <Field label="Price for one" hint="The amount the customer actually paid for one unit.">
          <NumberInput
            prefix="RM"
            min={0}
            step={1}
            value={otherAmount}
            onChange={(e) => setOtherAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmOther()
            }}
            placeholder="0.00"
            autoFocus
          />
        </Field>
      </Modal>

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
            {num(customers)}
          </p>
        </div>
      </div>

      {/* ── Step 1: everything they are buying ────────────────────────── */}
      <Panel>
        <PanelHeader
          eyebrow="Step 1"
          title="What are they buying?"
          meta="Tap the price they paid. Tap again for a second one."
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
                  <div className="space-y-2">
                    {variants.map((v) => {
                      const tiers = tiersFor(v, basis)
                      const taken = basket
                        .filter((l) => l.skuId === v.id)
                        .reduce((a, l) => a + l.qty, 0)
                      return (
                        <div
                          key={v.id}
                          className={`rounded-xl border p-2 transition-colors sm:flex sm:items-center sm:gap-3 sm:p-2.5 ${
                            taken ? 'border-primary/40 bg-primary/6' : 'border-line bg-surface-2'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2 px-1 sm:mb-0 sm:w-[112px] sm:shrink-0">
                            <span className="text-[13.5px] font-medium text-ink">
                              {v.variant === 'set' ? 'Set' : v.variant === 'travel' ? 'Travel Kit' : v.size}
                            </span>
                            {taken > 0 && (
                              <span className="readout flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                                {taken}
                              </span>
                            )}
                          </div>
                          <div
                            className={`grid gap-2 sm:flex sm:flex-1 sm:flex-wrap ${
                              tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                            }`}
                          >
                            {tiers.map((t) => {
                              const inBasket = basket.filter((l) => l.skuId === v.id && l.priceTier === t)
                              const inQty = inBasket.reduce((a, l) => a + l.qty, 0)
                              const usual = t === basis
                              return (
                                <button
                                  key={t}
                                  onClick={() => tap(v.id, t)}
                                  className={`relative min-h-[56px] rounded-lg border px-2.5 py-2 text-left transition-all duration-200 active:scale-[0.98] sm:min-w-[124px] sm:px-3.5 sm:hover:-translate-y-0.5 ${
                                    inQty
                                      ? 'border-primary bg-primary/14 shadow-glass'
                                      : usual
                                        ? 'border-primary/35 bg-surface sm:hover:border-primary/60 sm:hover:shadow-glass'
                                        : 'border-line bg-surface sm:hover:border-primary/45 sm:hover:shadow-glass'
                                  }`}
                                >
                                  <span
                                    className={`block text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                                      inQty || usual ? 'text-primary' : 'text-ink-3'
                                    }`}
                                  >
                                    {TIER_LABEL[t]}
                                  </span>
                                  <span className="readout mt-0.5 block text-[14px] font-semibold text-ink">
                                    {t === 'other' ? 'RM …' : rm(priceAtTier(v, t))}
                                  </span>
                                  {inQty > 0 && (
                                    <span className="readout absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                                      {inQty}
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
                {basket.map((l, i) => {
                  const s = skuById(l.skuId)
                  const tier = l.priceTier ?? basis
                  return (
                    <div
                      key={`${l.skuId}-${tier}-${l.unitPriceMYR ?? ''}-${i}`}
                      className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 sm:flex sm:items-center sm:gap-3"
                    >
                      {/* Phone: name and total on one row, price and quantity on the next. */}
                      <div className="flex items-center justify-between gap-3 sm:min-w-0 sm:flex-1">
                        <span className="min-w-0 truncate text-[13.5px] text-ink">{s?.label}</span>
                        <span className="readout text-[12.5px] text-ink-2 sm:hidden">
                          {rm(l.qty * lineUnitPrice(l, basis))}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 sm:mt-0">
                        <Badge tone={tier === basis ? 'neutral' : 'active'}>
                          {TIER_LABEL[tier]} · {rm(lineUnitPrice(l, basis))}
                        </Badge>
                        <span className="readout hidden text-[12.5px] text-ink-2 sm:inline">
                          {rm(l.qty * lineUnitPrice(l, basis))}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <IconButton
                            name="minus"
                            label="One fewer"
                            onClick={() => bump(l, -1)}
                            className="h-10 w-10 border border-line bg-surface"
                          />
                          <span className="readout w-8 text-center font-display text-[19px] font-semibold text-ink">
                            {l.qty}
                          </span>
                          <IconButton
                            name="plus"
                            label="One more"
                            onClick={() => bump(l, 1)}
                            className="h-10 w-10 border border-primary/40 bg-primary/10 text-primary"
                          />
                        </div>
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
                          <Flag code={c.code} size={28} className="block" />
                          <span className="mt-1.5 block truncate text-[13px] font-medium text-ink">
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
            title={`${customers} ${customers === 1 ? 'customer' : 'customers'} · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`}
            meta="Every sale recorded at this store today, by anyone. Take back a line, or a whole sale, if something was keyed in wrongly."
          />
          <Rule />
          <PanelBody className="space-y-2.5">
            {lines.length === 0 ? (
              <EmptyState
                icon="plus"
                title="Nothing logged yet"
                body="Record each sale as it happens and tonight's closing becomes a quick check."
              />
            ) : (
              sales.map(([saleId, group]) => {
                const first = group[0]
                const c = first.countryCode ? countryByCode(first.countryCode) : null
                const total = group.reduce((a, l) => a + l.qty * lineUnitPrice(l, basis), 0)
                return (
                  <div key={saleId} className="rounded-xl border border-line bg-surface-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/70 px-3.5 py-2">
                      {c ? (
                        <Badge tone="active">
                          <Flag code={c.code} size={14} />
                          {c.name}
                          {first.segment ? ` · ${MALAYSIA_SEGMENT_LABEL[first.segment]}` : ''}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Customer</Badge>
                      )}
                      <span className="text-[11.5px] text-ink-3">
                        {first.at ? formatTimestamp(first.at).split(' · ').pop() : ''}
                        {first.byName ? ` · ${first.byName}` : ''}
                      </span>
                      <span className="readout ml-auto text-[12.5px] font-semibold text-ink">{rm(total)}</span>
                      <button
                        onClick={() => {
                          removeSale(saleId)
                          push('Sale taken back', 'info')
                        }}
                        className="flex items-center gap-1 text-[11.5px] text-critical hover:underline"
                      >
                        <Icon name="x" className="h-3 w-3" />
                        Delete sale
                      </button>
                    </div>
                    <div className="space-y-1 px-3.5 py-2">
                      {group.map((l) => {
                        const s = skuById(l.skuId)
                        return (
                          <div key={l.id ?? `${saleId}-${l.skuId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="readout text-[13px] font-semibold text-ink">{l.qty} ×</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s?.label}</span>
                            {l.priceTier && l.priceTier !== basis && (
                              <Badge tone="neutral">
                                {TIER_LABEL[l.priceTier]}
                                {l.priceTier === 'other' ? ` · ${rm(lineUnitPrice(l, basis))}` : ''}
                              </Badge>
                            )}
                            <span className="readout text-[12.5px] text-ink-2">
                              {rm(l.qty * lineUnitPrice(l, basis))}
                            </span>
                            {group.length > 1 && l.id && (
                              <IconButton
                                name="x"
                                label="Remove this line"
                                className="h-8 w-8"
                                onClick={() => {
                                  removeSaleLine(l.id!)
                                  push('Line removed', 'info')
                                }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
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
