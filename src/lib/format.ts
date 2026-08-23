/** Money is always Malaysian Ringgit here; the brand prices in RM. */
export const rm = (n: number, opts: { decimals?: boolean } = {}): string =>
  `RM ${n.toLocaleString('en-MY', {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  })}`

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
