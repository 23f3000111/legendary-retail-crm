import { describe, expect, it } from 'vitest'
import { filterInWords } from './FilterBar'
import { emptyFilter } from '../store/selectors'
import { skus } from '../data/products'
import { locations } from '../data/locations'

const base = emptyFilter('2026-10-01', '2026-10-30')

describe('the filter in words', () => {
  it('says nothing of a filter that narrows nothing', () => {
    expect(filterInWords(base)).toEqual([])
  })

  it('names the products, not the count of their sizes', () => {
    const wish = skus.filter((s) => s.productId === 'wish-1').map((s) => s.id)
    expect(wish.length).toBeGreaterThan(0)
    expect(filterInWords({ ...base, skuIds: wish })).toEqual(['Wish 1'])
  })

  it('names one store, and counts several', () => {
    const [a, b] = locations.filter((l) => l.channel === 'main')
    expect(filterInWords({ ...base, locationIds: [a.id] })).toEqual([a.shortName])
    expect(filterInWords({ ...base, locationIds: [a.id, b.id] })).toEqual(['2 stores'])
  })

  it('names channels and countries, in the order the bar shows them', () => {
    expect(filterInWords({ ...base, channels: ['main'], countryCodes: ['CN', 'KR'] })).toEqual([
      'Main stores',
      'China, South Korea',
    ])
  })
})
