import { describe, expect, it } from 'vitest'
import { moneyInput, rm } from './format'
import { shiftMonth } from './dates'

describe('money', () => {
  it('shows whole ringgit as whole ringgit', () => {
    expect(rm(188)).toBe('RM 188')
    expect(rm(343051)).toBe('RM 343,051')
    expect(rm(0)).toBe('RM 0')
  })

  it('shows the sen when there are any — a price typed as 150.50 stays 150.50', () => {
    expect(rm(150.5)).toBe('RM 150.50')
    expect(rm(1200.05)).toBe('RM 1,200.05')
    expect(rm(0.1 + 0.2)).toBe('RM 0.30')
  })

  it('does not invent sen from rounding noise', () => {
    expect(rm(376.0000001)).toBe('RM 376')
  })

  it('always shows the sen when asked', () => {
    expect(rm(188, { decimals: true })).toBe('RM 188.00')
  })

  it('puts a figure back into a box the way it was typed', () => {
    expect(moneyInput(150.5)).toBe('150.50')
    expect(moneyInput(188)).toBe('188')
    expect(moneyInput(0)).toBe('0')
    expect(moneyInput(0.1 + 0.2)).toBe('0.30')
    expect(moneyInput(376.0000001)).toBe('376')
  })
})

describe('months', () => {
  it('steps back and forward across a year', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-10', -24)).toBe('2024-10')
  })
})
