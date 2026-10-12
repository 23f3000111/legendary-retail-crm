/**
 * Money is always Malaysian Ringgit here; the brand prices in RM.
 *
 * Whole ringgit unless there are sen to show: RM 188, RM 150.50. Rounding
 * every figure to the ringgit made a price typed as 150.50 come back as
 * RM 151, and promoters took it that decimals could not be entered (client,
 * 12 October). `decimals: true` always shows the sen.
 */
export const rm = (n: number, opts: { decimals?: boolean } = {}): string => {
  const sen = opts.decimals ?? Math.round(n * 100) % 100 !== 0
  return `RM ${n.toLocaleString('en-MY', {
    minimumFractionDigits: sen ? 2 : 0,
    maximumFractionDigits: sen ? 2 : 0,
  })}`
}

/**
 * A figure put back into a box to be changed: 150.50 rather than 150.5, and
 * 188 rather than 188.00 — the same rule as `rm`, without the RM.
 */
export const moneyInput = (n: number): string =>
  Math.round(n * 100) % 100 !== 0 ? n.toFixed(2) : String(Math.round(n))

/** Compact money for tight tiles: RM 1.2k, RM 340k, RM 1.4m. */
export const rmCompact = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}m`
  if (abs >= 10_000) return `RM ${Math.round(n / 1000)}k`
  if (abs >= 1_000) return `RM ${(n / 1000).toFixed(1)}k`
  return `RM ${Math.round(n)}`
}

export const num = (n: number): string => n.toLocaleString('en-MY')

export const pct = (n: number, decimals = 0): string =>
  `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(decimals)}%`

/** Signed delta for month-on-month chips. Uses a real minus sign, not a hyphen. */
export const signedPct = (n: number, decimals = 1): string =>
  `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(decimals)}%`

export const share = (part: number, whole: number): number =>
  whole === 0 ? 0 : (part / whole) * 100

/** Percentage change, guarding the divide-by-zero that a new outlet produces. */
export const change = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100

export const initials = (name: string): string =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
