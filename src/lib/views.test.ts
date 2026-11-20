import { describe, expect, it } from 'vitest'
import { restoreDates, restoreFilter, restoreRules } from './views'
import { emptyFilter } from '../store/selectors'

/**
 * 20 November, on Analytics: "when we click on any clickable button that goes
 * to another page and then comeback to analytics then the filter I put gone".
 * What a page was set to is kept for the tab, and read back safely: a value
 * kept yesterday, or by an older version of the page, must not break it.
 */

const today = '2026-11-20'

describe('a filter kept for when you come back', () => {
  it('comes back as it was left', () => {
    const f = { ...emptyFilter('2026-11-01', '2026-11-07'), locationIds: ['pavilion-5'], countryCodes: ['CN'] }
    expect(restoreFilter(JSON.parse(JSON.stringify(f)), today)).toEqual(f)
  })

  it('fills in what an older version did not keep, and keeps the dates in order and up to today', () => {
    expect(restoreFilter({ from: '2026-11-25', to: '2026-11-03', skuIds: ['orchid-retail', 7] }, today)).toEqual({
      ...emptyFilter('2026-11-03', today),
      skuIds: ['orchid-retail'],
    })
  })

  it('gives nothing back for something that is not a filter', () => {
    expect(restoreFilter(null, today)).toBeNull()
    expect(restoreFilter('2026-11-01', today)).toBeNull()
    expect(restoreFilter({ from: 'yesterday', to: today }, today)).toBeNull()
  })
})

// 20 November, later: Revenue's consignment, dealers and By channel each keep
// their own From and To.
describe('a section’s dates, kept', () => {
  it('comes back in order and never past today', () => {
    expect(restoreDates({ from: '2026-10-01', to: '2026-10-31' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(restoreDates({ from: '2026-12-01', to: '2026-11-02' }, today)).toEqual({ from: '2026-11-02', to: today })
  })

  it('gives nothing back for something that is not two dates', () => {
    expect(restoreDates(undefined, today)).toBeNull()
    expect(restoreDates({ from: '2026-10-01' }, today)).toBeNull()
  })
})

describe('the sales report’s rules, kept', () => {
  it('keeps the business date as between two dates, and each choice as a list', () => {
    expect(
      restoreRules(
        [
          { id: 'a', field: 'date', span: { op: 'equal', from: '2026-11-19', to: '2026-11-19' } },
          { id: 'b', field: 'item', op: 'not_equal', skuIds: ['orchid-retail'] },
          { id: 'c', field: 'nationality', countryCodes: ['CN', 3] },
          { id: 'd', field: 'colour' },
          { field: 'store', locationIds: [] },
        ],
        today,
      ),
    ).toEqual([
      { id: 'a', field: 'date', span: { op: 'between', from: '2026-11-19', to: '2026-11-19' } },
      { id: 'b', field: 'item', op: 'equal', skuIds: ['orchid-retail'] },
      { id: 'c', field: 'nationality', op: 'equal', countryCodes: ['CN'] },
    ])
  })

  it('gives nothing back for something that is not a list of rules', () => {
    expect(restoreRules(undefined, today)).toBeNull()
    expect(restoreRules({ id: 'a' }, today)).toBeNull()
  })
})
