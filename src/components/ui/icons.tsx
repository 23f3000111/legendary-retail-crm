/**
 * One stroke weight, one corner treatment, one 24-grid. Icons here are quiet by
 * design — the primary is spent on data, not on decoration.
 */
export type IconName =
  | 'grid'
  | 'clipboard'
  | 'globe'
  | 'box'
  | 'doc'
  | 'clock'
  | 'chart'
  | 'truck'
  | 'wallet'
  | 'bell'
  | 'search'
  | 'plus'
  | 'minus'
  | 'check'
  | 'x'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'download'
  | 'printer'
  | 'logout'
  | 'alert'
  | 'sparkle'
  | 'users'
  | 'refresh'
  | 'filter'
  | 'trophy'
  | 'command'
  | 'lock'
  | 'eye'
  | 'eyeOff'

const paths: Record<IconName, JSX.Element> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4h6v3H9z" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7a1.5 1.5 0 0 0-1.5-1.5H15" />
      <path d="m8.5 13 2.2 2.2 4.8-4.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  box: (
    <>
      <path d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4Z" />
      <path d="m4 7.4 8 4.2 8-4.2M12 11.6v9.2" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5Z" />
      <path d="M14 3.5V7.5H18M9 12.5h6M9 16h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.5h16" />
      <path d="M6.5 16V11M11 16V6.5M15.5 16v-6M20 16v-8" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h10v9H3zM13 9.5h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 18H5.5A1.5 1.5 0 0 1 4 16.5Z" />
      <path d="M15.5 12h2.5M4 9.5h15.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 16.5H6l1.4-2.2V11a4.6 4.6 0 0 1 9.2 0v3.3Z" />
      <path d="M10.2 19.2a2 2 0 0 0 3.6 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  check: <path d="m5.5 12.5 4.2 4.2L18.5 8" />,
  x: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  chevronRight: <path d="m9.5 5.5 7 6.5-7 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 7 6.5-7" />,
  chevronLeft: <path d="m14.5 5.5-7 6.5 7 6.5" />,
  arrowUp: <path d="M12 19V5.5M6 11l6-5.5 6 5.5" />,
  arrowDown: <path d="M12 5v13.5M6 13l6 5.5 6-5.5" />,
  download: (
    <>
      <path d="M12 4v10M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v1.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-1.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V4.5h10V9M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 14h10v5.5H7z" />
    </>
  ),
  logout: (
    <>
      <path d="M14 7.5V5.5a1 1 0 0 0-1-1H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H13a1 1 0 0 0 1-1v-2" />
      <path d="M9.5 12h10M16 8.5l3.5 3.5L16 15.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4M12 16.6v.1" />
    </>
  ),
  sparkle: <path d="M12 4.5 13.8 10 19.5 12 13.8 14 12 19.5 10.2 14 4.5 12 10.2 10Z" />,
  users: (
    <>
      <circle cx="9.5" cy="9" r="3.2" />
      <path d="M4 19c0-3 2.5-4.6 5.5-4.6S15 16 15 19" />
      <path d="M16 6.6a3.2 3.2 0 0 1 0 5.6M17.5 14.8c1.7.6 2.5 2 2.5 4.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19.5 4.5V9H15" />
    </>
  ),
  filter: <path d="M4 6h16l-6 7v5.5l-4 1.5V13Z" />,
  trophy: (
    <>
      <path d="M8 4.5h8v5a4 4 0 0 1-8 0Z" />
      <path d="M8 6H5.5v1.5A3 3 0 0 0 8 10.4M16 6h2.5v1.5A3 3 0 0 1 16 10.4" />
      <path d="M12 13.5V17M9 19.5h6" />
    </>
  ),
  command: (
    <path d="M8.5 6a2 2 0 1 0-2 2h11a2 2 0 1 0-2-2v12a2 2 0 1 0 2-2h-11a2 2 0 1 0 2 2Z" />
  ),
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.75 12 5.75 21.5 12 21.5 12 18 18.25 12 18.25 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.6 3.4M6.3 7.8A16.6 16.6 0 0 0 2.5 12S6 18.1 12 18.1a9.3 9.3 0 0 0 3.6-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
}

export function Icon({
  name,
  className = 'h-4 w-4',
  strokeWidth = 1.6,
  style,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

/** The house mark: an L on a gradient chip, with a scanning highlight. */
export function Wordmark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lgd-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="55%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#lgd-mark)" />
      <path d="M0 26 L40 6 L40 14 L0 34 Z" fill="rgba(255,255,255,0.14)" />
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontFamily="Sora, Inter, sans-serif"
        fontSize="21"
        fontWeight="700"
        fill="#FFFFFF"
      >
        L
      </text>
    </svg>
  )
}
