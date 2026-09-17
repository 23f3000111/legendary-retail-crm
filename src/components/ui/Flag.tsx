import { useState } from 'react'
import { countryByCode } from '../../data/countries'

/**
 * A country's flag, as a small picture rather than an emoji.
 *
 * Windows has no flag emoji. Chrome and Edge there print the two letters of
 * the code instead — "CN" where a flag should be — which is exactly what the
 * client saw on his PC. So every flag is a PNG in `public/flags/`, served by
 * the app itself: nothing at the counter depends on a third party, and it
 * looks the same on a Windows laptop, an iPad and a phone.
 *
 * The pictures are the public-domain set from flagpedia.net, 80px wide, which
 * is sharp at twice the largest size used here. Anything that is not a country
 * on the list — the "Other" slice of a chart — falls back to whatever text it
 * was given.
 */
export function Flag({
  code,
  size = 20,
  alt = '',
  fallback,
  className = '',
}: {
  /** ISO 3166-1 alpha-2. */
  code: string
  /** Width in CSS pixels. Flags are 4:3. */
  size?: number
  /** Leave empty where the country's name is printed beside it. */
  alt?: string
  /** What to show where there is no picture for this code. */
  fallback?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const country = countryByCode(code)
  const height = Math.round(size * 0.75)

  if (!country || failed) {
    return (
      <span
        aria-hidden={alt === ''}
        className={`inline-block shrink-0 text-center leading-none ${className}`}
        style={{ width: size, fontSize: height }}
      >
        {fallback ?? code}
      </span>
    )
  }

  return (
    <img
      src={`${import.meta.env.BASE_URL}flags/${code.toLowerCase()}.png`}
      alt={alt}
      title={alt ? undefined : country.name}
      width={size}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${className}`}
      style={{ width: size, height }}
    />
  )
}
