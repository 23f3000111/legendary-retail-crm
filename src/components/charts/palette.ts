/**
 * Chart colour, decided once and validated rather than eyeballed.
 *
 * The categorical set was searched and checked as an *ordered* set against the
 * white chart surface (the dataviz skill's validator):
 *
 *   lightness band     all 12 inside OKLCH L 0.43–0.77
 *   chroma floor       all 12 ≥ 0.10 (none reads gray)
 *   CVD separation     worst adjacent pair ΔE 18.5 (deutan), target ≥ 8 —
 *                      the ring's last-to-first pair too (20.0)
 *   normal vision      worst adjacent pair ΔE 19.2, floor ≥ 15; each of
 *                      slots 7–12 at least 15.8 from every other slot
 *   contrast           all 12 ≥ 3:1 against white — no relief rule needed
 *
 * Slots 1–6 are the original six, unchanged, so nothing already drawn changes
 * colour. Slots 7–12 came on 22 November, when the client asked of the
 * Overview's main stores, grey from the seventh on, to "make sure they all
 * have different colour boxes". A table names every row beside its swatch,
 * so the colour never carries identity alone.
 */
export const SERIES = [
  '#0369A1', // 1 · deep cyan
  '#EA580C', // 2 · orange
  '#2563EB', // 3 · blue
  '#E11D48', // 4 · rose
  '#5B21B6', // 5 · violet
  '#059669', // 6 · emerald
  '#DF59FC', // 7 · orchid
  '#B0039B', // 8 · magenta
  '#AB9017', // 9 · olive gold
  '#813C0B', // 10 · brown
  '#009EDB', // 11 · sky
  '#1C6402', // 12 · forest
] as const

/**
 * Past twelve, for the long tables only (the dealers keyed in, say), so every
 * row still has a box of its own. Picked one at a time from the sRGB gamut,
 * each the farthest from all before it (worst pair of all 48: ΔE 8.4). A
 * chart folds anything past twelve into "Other".
 */
export const SERIES_EXTRA = [
  '#D8A6C2', '#33D977', '#9B7090', '#702562', '#FD9E32', '#5DCBD1',
  '#F562A2', '#9B8BFB', '#8851D1', '#7B6F3D', '#B4C074', '#035160',
  '#03409C', '#56AA14', '#69537C', '#D58873', '#FB84ED', '#C451B8',
  '#67B184', '#6679CD', '#2E7065', '#4B4A18', '#4B8B9B', '#9D4576',
  '#CA80C7', '#8F0D35', '#3E8201', '#61B9FD', '#C4A4FE', '#7F3999',
  '#9FCA13', '#A67C5B', '#4A3B78', '#CD677D', '#D9AD8A', '#9C066A',
] as const

export const OTHER = '#94A3B8'

/**
 * The UI's own accent. A single-series chart wears this rather than taking slot
 * 1, so the categorical order stays reserved for charts that actually encode
 * identity. 6.29:1 against white.
 */
export const PRIMARY = '#4F46E5'
export const PRIMARY_BRIGHT = '#6366F1'

/** Single hue, monotone lightness, light end clears the surface at 2.55:1. */
export const SEQUENTIAL = ['#8E9CF7', '#6C77E8', '#4F52D0', '#3A38A8', '#272470'] as const

/** Reserved. Never reused as a series colour, always paired with an icon and a word. */
export const STATUS = {
  good: '#059669',
  warn: '#B45309',
  serious: '#C2410C',
  critical: '#BE123C',
} as const

export const INK = {
  primary: '#0F1B33',
  secondary: '#4A5B7A',
  muted: '#8494B2',
  grid: 'rgba(15,27,51,0.07)',
  axis: 'rgba(15,27,51,0.14)',
  surface: '#FFFFFF',
  canvas: '#EEF2FA',
} as const

/**
 * The colour of a table's row and its slice: the twelve, then the long
 * tables' 36. Never the grey kept for "Other".
 */
export const seriesColor = (index: number): string =>
  index < SERIES.length ? SERIES[index] : SERIES_EXTRA[(index - SERIES.length) % SERIES_EXTRA.length]

/** Position on the sequential ramp for a 0–1 magnitude. */
export const rampColor = (t: number): string => {
  if (!Number.isFinite(t) || t <= 0) return '#E7EDF8'
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length))
  return SEQUENTIAL[i]
}
