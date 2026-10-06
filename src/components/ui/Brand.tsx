/**
 * Legendary's own marks, from the artwork the client supplied in `public/`:
 *
 *   logo-legendary.png   the name, in their lettering with the crown on the L
 *   icon-perfume.png     the perfume bottle, their short form
 *
 * Both are white on transparent. The bottle sits on the CRM's blue, as the
 * client asked — their own version is gold — and the name is shown as it is
 * on a dark band, or filled with the theme's blue on a light page.
 */

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

/** The short form: the bottle, white, in a blue circle. Decorative — the name is always nearby. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-grad-mark shadow-glow ring-1 ring-white/30 ${className}`}
    >
      <img
        src={asset('icon-perfume.png')}
        alt=""
        draggable={false}
        className="relative h-[54%] w-auto select-none"
      />
    </span>
  )
}

/**
 * The name, in Legendary's lettering. Size it by width; the height follows.
 *
 * `white` for the header and footer bands. `theme` for a light page: the
 * artwork is white, so there it is shown through a mask and filled with the
 * header's blue gradient instead.
 */
export function BrandLogo({
  className = 'w-[120px]',
  tone = 'white',
}: {
  className?: string
  tone?: 'white' | 'theme'
}) {
  const src = asset('logo-legendary.png')
  if (tone === 'white') {
    return <img src={src} alt="Legendary" draggable={false} className={`block h-auto select-none ${className}`} />
  }
  const mask = `url("${src}") center / contain no-repeat`
  return (
    <span
      role="img"
      aria-label="Legendary"
      className={`block aspect-[1400/206] bg-grad-command ${className}`}
      style={{ WebkitMask: mask, mask }}
    />
  )
}
