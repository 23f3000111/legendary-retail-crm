import { useState } from 'react'
import { Icon } from './ui/icons'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { ChipToggle, SegmentedControl, TextInput } from './ui/Field'
import { Flag } from './ui/Flag'
import {
  locations,
  regions,
  CHANNELS,
  CHANNEL_PLURAL,
  type Region,
} from '../data/locations'
import { collections, products, skus, VARIANT_LABEL, type CollectionId, type Variant } from '../data/products'
import { countries } from '../data/countries'
import { formatDate } from '../lib/dates'
import { activeRange, chooseDates, rangeDates, RANGES, type RangeKey } from '../lib/periods'
import { inOutletOrder } from '../lib/outletOrder'
import { useOutletSort } from '../store/useOutletOrder'
import {
  activeFilterCount,
  isDimensionless,
  METRIC_LABEL,
  type Filter,
  type Metric,
} from '../store/selectors'
import type { DateStr } from '../data/types'

const VARIANTS: Variant[] = ['retail', 'set', 'travel', 'vial', 'tester']

/**
 * What the filter narrows to, in words: the bar's own summary line, the line
 * over the sales boxes, and the rules on the PDF report.
 */
export const filterInWords = (filter: Filter): string[] => {
  const names = <T,>(list: T[], name: (v: T) => string | undefined) =>
    list.map(name).filter(Boolean).join(', ')
  // The product chips choose every size of a product at once, so the words
  // name the products rather than counting their sizes.
  const productIds = [...new Set(filter.skuIds.map((id) => skus.find((s) => s.id === id)?.productId))]
  return [
    names(filter.channels, (c) => CHANNEL_PLURAL[c]),
    filter.locationIds.length === 1
      ? (locations.find((l) => l.id === filter.locationIds[0])?.shortName ?? '1 store')
      : filter.locationIds.length
        ? `${filter.locationIds.length} stores`
        : '',
    filter.regions.join(', '),
    names(filter.collectionIds, (id) => collections.find((c) => c.id === id)?.name),
    names(productIds, (id) => products.find((p) => p.id === id)?.name),
    names(filter.variants, (v) => VARIANT_LABEL[v]),
    names(filter.countryCodes, (code) => countries.find((x) => x.code === code)?.name),
  ].filter(Boolean)
}

/**
 * One control surface for the whole page. Every panel below reads the same
 * filter, so a change here moves everything at once rather than leaving one
 * chart disagreeing with its neighbour — the dates included: the usual
 * periods, last month, or any dates chosen, From and To (16 November: "when
 * I want to go analytics I'm supposed to choose the date here"). From and To
 * are always there, beside the periods (20 November: "please put calendars
 * to select start date and end date").
 *
 * The nationality row carries a warning, because only main stores record it —
 * choosing a country silently drops dealers and consignment from the answer,
 * and the page says so rather than quietly returning a smaller number.
 */
export function FilterBar({
  filter,
  onChange,
  metric,
  onMetricChange,
  today,
  coverage,
}: {
  filter: Filter
  onChange: (f: Filter) => void
  metric: Metric
  onMetricChange: (m: Metric) => void
  today: DateStr
  /** How much of the filtered estate can answer a nationality question. */
  coverage?: { capableLocations: number; totalLocations: number; partial: boolean }
}) {
  const [expanded, setExpanded] = useState(false)

  const setRange = (key: RangeKey) => {
    if (key !== 'dates') onChange({ ...filter, ...rangeDates(key, today) })
  }
  // Dates that are no period light none of the buttons: From and To say them.
  const range: RangeKey = activeRange(filter.from, filter.to, today)

  const toggle = <K extends keyof Filter>(key: K, value: string) => {
    const list = filter[key] as unknown as string[]
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    onChange({ ...filter, [key]: next } as Filter)
  }

  const count = activeFilterCount(filter)

  const clear = () =>
    onChange({
      ...filter,
      locationIds: [],
      channels: [],
      regions: [],
      collectionIds: [],
      skuIds: [],
      variants: [],
      countryCodes: [],
    })

  // The chips in the person's own order, where they have arranged one.
  const { order } = useOutletSort('filter', 'mine')
  const mainStores = inOutletOrder(locations.filter((l) => l.channel === 'main'), (l) => l.id, order)
  const consignment = inOutletOrder(locations.filter((l) => l.channel === 'consignment'), (l) => l.id, order)

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <div>
          <p className="eyebrow mb-1.5">Period</p>
          <SegmentedControl<RangeKey> value={range} onChange={setRange} options={RANGES.filter((r) => r.value !== 'dates')} />
        </div>

        {/* The calendars, always in view (20 November). */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="eyebrow mb-1.5 block">From</span>
            <TextInput
              type="date"
              aria-label="From"
              value={filter.from}
              max={today}
              onChange={(e) => onChange({ ...filter, ...chooseDates(e.target.value, filter.to, today) })}
              className="h-9 w-[156px] text-[12.5px]"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">To</span>
            <TextInput
              type="date"
              aria-label="To"
              value={filter.to}
              max={today}
              onChange={(e) => onChange({ ...filter, ...chooseDates(filter.from, e.target.value, today) })}
              className="h-9 w-[156px] text-[12.5px]"
            />
          </label>
        </div>

        <div className="hidden h-9 w-px bg-line sm:block" />

        <div>
          <p className="eyebrow mb-1.5">Measure</p>
          <SegmentedControl<Metric>
            value={metric}
            onChange={onMetricChange}
            options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({
              value: m,
              label: METRIC_LABEL[m],
            }))}
          />
        </div>

        {/* Bigger and plainer, at the client's request (1 November). */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {count > 0 && (
            <Button variant="secondary" icon="x" onClick={clear}>
              Clear {count}
            </Button>
          )}
          <Button
            variant="primary"
            icon="filter"
            iconRight={expanded ? 'chevronDown' : 'chevronRight'}
            onClick={() => setExpanded((s) => !s)}
          >
            Filter by store, product, country
          </Button>
        </div>
      </div>

      <div className="rule mx-5" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2.5 text-[12px] text-ink-3">
        <Icon name="clock" className="h-3.5 w-3.5" />
        {formatDate(filter.from)} — {formatDate(filter.to)}
        {isDimensionless(filter) ? (
          <span>· every store, every product</span>
        ) : (
          filterInWords(filter).map((w, i) => <span key={i}>· {w}</span>)
        )}
      </div>

      {filter.countryCodes.length > 0 && coverage?.partial && (
        <div className="mx-5 mb-3 flex flex-wrap items-start gap-2 rounded-xl border border-warn/30 bg-warn/8 px-3.5 py-2.5">
          <Badge tone="warn" icon="alert">
            Main stores only
          </Badge>
          <p className="flex-1 text-[12px] leading-relaxed text-ink-2">
            Only main stores record which country bought what. This answer covers{' '}
            <b>{coverage.capableLocations} of {coverage.totalLocations}</b> stores in view — dealers
            and consignment partners are left out rather than estimated.
          </p>
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t border-line px-5 py-4">
          <Group label="Channel">
            {CHANNELS.map((c) => (
              <ChipToggle
                key={c}
                label={CHANNEL_PLURAL[c]}
                active={filter.channels.includes(c)}
                onClick={() => toggle('channels', c)}
              />
            ))}
          </Group>

          <Group label="Main stores">
            {mainStores.map((l) => (
              <ChipToggle
                key={l.id}
                label={l.shortName}
                active={filter.locationIds.includes(l.id)}
                onClick={() => toggle('locationIds', l.id)}
              />
            ))}
          </Group>

          <Group label="Consignment partners">
            {consignment.map((l) => (
              <ChipToggle
                key={l.id}
                label={l.shortName}
                active={filter.locationIds.includes(l.id)}
                onClick={() => toggle('locationIds', l.id)}
              />
            ))}
          </Group>

          <Group label="Region">
            {regions.map((r) => (
              <ChipToggle
                key={r}
                label={r}
                active={filter.regions.includes(r as Region)}
                onClick={() => toggle('regions', r)}
              />
            ))}
          </Group>

          <Group label="Collection">
            {collections.map((c) => (
              <ChipToggle
                key={c.id}
                label={c.name}
                active={filter.collectionIds.includes(c.id as CollectionId)}
                onClick={() => toggle('collectionIds', c.id)}
              />
            ))}
          </Group>

          <Group label="Variant">
            {VARIANTS.map((v) => (
              <ChipToggle
                key={v}
                label={VARIANT_LABEL[v]}
                active={filter.variants.includes(v)}
                onClick={() => toggle('variants', v)}
              />
            ))}
          </Group>

          <Group label="Product">
            {products.map((p) => {
              const ids = skus.filter((s) => s.productId === p.id).map((s) => s.id)
              const active = ids.every((id) => filter.skuIds.includes(id)) && ids.length > 0
              return (
                <ChipToggle
                  key={p.id}
                  label={p.name}
                  active={active}
                  onClick={() =>
                    onChange({
                      ...filter,
                      skuIds: active
                        ? filter.skuIds.filter((id) => !ids.includes(id))
                        : [...new Set([...filter.skuIds, ...ids])],
                    })
                  }
                />
              )
            })}
          </Group>

          <Group label="Nationality">
            {countries.map((c) => (
              <ChipToggle
                key={c.code}
                label={
                  <>
                    <Flag code={c.code} size={14} />
                    {c.name}
                  </>
                }
                active={filter.countryCodes.includes(c.code)}
                onClick={() => toggle('countryCodes', c.code)}
              />
            ))}
          </Group>
        </div>
      )}
    </section>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
