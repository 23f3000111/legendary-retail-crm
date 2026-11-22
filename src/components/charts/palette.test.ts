import { describe, expect, it } from 'vitest'
import { OTHER, SERIES, seriesColor } from './palette'

/**
 * 22 November, on the Overview's "Main stores · month to date": "make sure
 * they all have different colour boxes". From the seventh store on, every box
 * was the grey kept for "Other".
 */

/** WCAG contrast of a colour against white. */
const onWhite = (hex: string) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (y + 0.05)
}

describe('a colour for every row', () => {
  it('keeps the first six as they were, so nothing already drawn changes colour', () => {
    expect(SERIES.slice(0, 6)).toEqual(['#0369A1', '#EA580C', '#2563EB', '#E11D48', '#5B21B6', '#059669'])
  })

  it('gives the main stores a colour each, none of them the grey kept for Other', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => seriesColor(i))
    expect(new Set(twelve).size).toBe(12)
    expect(twelve).not.toContain(OTHER)
  })

  it('keeps the twelve chart colours readable on the white chart', () => {
    for (const c of SERIES) expect(onWhite(c), c).toBeGreaterThanOrEqual(3)
  })

  it('gives each of the 44 dealers its own colour too', () => {
    const all = Array.from({ length: 48 }, (_, i) => seriesColor(i))
    expect(new Set(all).size).toBe(48)
    expect(all).not.toContain(OTHER)
  })
})
