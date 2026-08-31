import { describe, expect, it } from 'vitest'
import {
  byInitial,
  countries,
  countriesAlphabetical,
  countryByCode,
  countryName,
  searchCountries,
  topCountries,
  MALAYSIA,
  MALAYSIA_SEGMENTS,
} from './countries'

/**
 * The list is the client's own (`docs/Zeoniq Countries.md`), so these tests are
 * really checking that we transcribed it faithfully and that a promoter can
 * find a country with a customer waiting.
 */

describe('the client’s list', () => {
  it('carries all 200 countries', () => {
    expect(countries).toHaveLength(200)
  })

  it('keeps their top twenty, in their order', () => {
    expect(topCountries).toHaveLength(20)
    expect(topCountries.map((c) => c.name).slice(0, 5)).toEqual([
      'China',
      'Malaysia',
      'Indonesia',
      'South Korea',
      'Saudi Arabia',
    ])
    expect(topCountries[19].name).toBe('Yemen')
  })

  it('gives every country a unique ISO code', () => {
    const codes = countries.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of countries) expect(c.code, c.name).toMatch(/^[A-Z]{2}$/)
  })

  it('derives a flag for every one', () => {
    for (const c of countries) expect(c.flag.length, c.name).toBeGreaterThan(0)
    expect(countryByCode('MY')?.flag).toBe('🇲🇾')
    expect(countryByCode('JP')?.flag).toBe('🇯🇵')
  })

  it('keeps the codes the seeded history already uses', () => {
    for (const code of ['MY', 'CN', 'IN', 'SG', 'ID', 'GB', 'AU', 'AE', 'JP', 'KR', 'TH', 'NL', 'SA', 'US', 'VN']) {
      expect(countryByCode(code), code).toBeDefined()
    }
    // The old list called this one "England".
    expect(countryName('GB')).toBe('United Kingdom')
  })
})

describe('finding one', () => {
  it('puts a name that starts with the query first', () => {
    const [first] = searchCountries('ban')
    expect(first.name).toBe('Bangladesh')
  })

  it('still finds one the query only appears inside', () => {
    expect(searchCountries('ban').map((c) => c.name)).toContain('Albania')
  })

  it('matches the two-letter code', () => {
    expect(searchCountries('my')[0].name).toBe('Malaysia')
  })

  it('is not case sensitive', () => {
    expect(searchCountries('JAPAN')[0].name).toBe('Japan')
    expect(searchCountries('japan')[0].name).toBe('Japan')
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(searchCountries('zzzz')).toHaveLength(0)
  })

  it('offers the whole list, A→Z, before anything is typed', () => {
    const all = searchCountries('', 300)
    expect(all).toHaveLength(200)
    expect(all[0].name.localeCompare(all[199].name)).toBeLessThan(0)
  })

  it('groups by first letter for the alphabet rail', () => {
    const groups = byInitial(countriesAlphabetical)
    expect(groups[0][0]).toBe('A')
    expect(groups.every(([letter, list]) => list.every((c) => c.name.startsWith(letter)))).toBe(true)
    // Every country lands in exactly one group.
    expect(groups.reduce((a, [, list]) => a + list.length, 0)).toBe(200)
  })
})

describe('Malaysia', () => {
  it('is the only country with a further breakdown', () => {
    expect(MALAYSIA).toBe('MY')
    expect(MALAYSIA_SEGMENTS.map((s) => s.label)).toEqual([
      'Malay',
      'Chinese',
      'Indian',
      'Others',
    ])
  })
})
