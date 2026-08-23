/**
 * Chart colour, decided once and validated rather than eyeballed.
 *
 * The categorical set was searched and checked as an *ordered* set against the
 * white chart surface:
 *
 *   lightness band     all 6 inside OKLCH L 0.43–0.77
 *   chroma floor       all 6 ≥ 0.10 (none reads gray)
 *   CVD separation     worst adjacent pair ΔE 21.0 (protan), target ≥ 8
 *   normal vision      worst adjacent pair ΔE 33.0, floor ≥ 15
 *   contrast           all 6 ≥ 3:1 against white — no relief rule needed
 *
 * Slots are assigned in order and never cycled. A seventh category folds into
 * OTHER rather than inventing a hue.
 */
export const SERIES = [
  '#0369A1', // 1 · deep cyan
  '#EA580C', // 2 · orange
  '#2563EB', // 3 · blue
  '#E11D48', // 4 · rose
  '#5B21B6', // 5 · violet
  '#059669', // 6 · emerald
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

/** Colour follows the entity, so a filter that drops series never repaints the survivors. */
export const seriesColor = (index: number): string =>
  index < SERIES.length ? SERIES[index] : OTHER

/** Position on the sequential ramp for a 0–1 magnitude. */
export const rampColor = (t: number): string => {
  if (!Number.isFinite(t) || t <= 0) return '#E7EDF8'
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length))
  return SEQUENTIAL[i]
}
