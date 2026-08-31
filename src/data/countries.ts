/**
 * Every country the counter can record, taken from the client's own Zeoniq
 * list (`docs/Zeoniq Countries.md`) so the two systems agree.
 *
 * The order in that document is deliberate and is kept: the twenty they
 * actually see most, in their order, then the rest alphabetically. The keypad
 * shows the first five, and everything else is found by typing.
 *
 * Flags are derived from the ISO code rather than pasted in, because 200
 * hand-typed emoji is 200 chances to get one wrong.
 */

export type Bloc =
  | 'Domestic'
  | 'Greater China'
  | 'North Asia'
  | 'ASEAN'
  | 'South Asia'
  | 'Middle East'
  | 'Central Asia'
  | 'Europe'
  | 'Africa'
  | 'Americas'
  | 'Oceania'

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string
  name: string
  flag: string
  /** Grouping for the analytics region filter. */
  bloc: Bloc
  /** Position in the client's top twenty, 1-based. Undefined for the rest. */
  rank?: number
}

/** Regional-indicator pair. Falls back to a plain flag for codes with no emoji. */
const flagOf = (code: string): string => {
  const cps = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return cps.every((n) => n >= 0x1f1e6 && n <= 0x1f1ff) ? String.fromCodePoint(...cps) : '🏳️'
}

type Row = [code: string, name: string, bloc: Bloc]

/** The twenty they see most, in the client's own order. */
const TOP: Row[] = [
  ['CN', 'China', 'Greater China'],
  ['MY', 'Malaysia', 'Domestic'],
  ['ID', 'Indonesia', 'ASEAN'],
  ['KR', 'South Korea', 'North Asia'],
  ['SA', 'Saudi Arabia', 'Middle East'],
  ['TH', 'Thailand', 'ASEAN'],
  ['FR', 'France', 'Europe'],
  ['JP', 'Japan', 'North Asia'],
  ['HK', 'Hong Kong', 'Greater China'],
  ['TW', 'Taiwan', 'Greater China'],
  ['SG', 'Singapore', 'ASEAN'],
  ['OM', 'Oman', 'Middle East'],
  ['IN', 'India', 'South Asia'],
  ['AU', 'Australia', 'Oceania'],
  ['QA', 'Qatar', 'Middle East'],
  ['US', 'United States', 'Americas'],
  ['MA', 'Morocco', 'Africa'],
  ['PH', 'Philippines', 'ASEAN'],
  ['AE', 'United Arab Emirates', 'Middle East'],
  ['YE', 'Yemen', 'Middle East'],
]

/** The rest, alphabetically, exactly as the client's list has them. */
const REST: Row[] = [
  ['AF', 'Afghanistan', 'South Asia'],
  ['AL', 'Albania', 'Europe'],
  ['DZ', 'Algeria', 'Africa'],
  ['AD', 'Andorra', 'Europe'],
  ['AO', 'Angola', 'Africa'],
  ['AG', 'Antigua and Barbuda', 'Americas'],
  ['AR', 'Argentina', 'Americas'],
  ['AM', 'Armenia', 'Central Asia'],
  ['AT', 'Austria', 'Europe'],
  ['AZ', 'Azerbaijan', 'Central Asia'],
  ['BS', 'Bahamas', 'Americas'],
  ['BH', 'Bahrain', 'Middle East'],
  ['BD', 'Bangladesh', 'South Asia'],
  ['BB', 'Barbados', 'Americas'],
  ['BY', 'Belarus', 'Europe'],
  ['BE', 'Belgium', 'Europe'],
  ['BZ', 'Belize', 'Americas'],
  ['BJ', 'Benin', 'Africa'],
  ['BT', 'Bhutan', 'South Asia'],
  ['BO', 'Bolivia', 'Americas'],
  ['BA', 'Bosnia and Herzegovina', 'Europe'],
  ['BW', 'Botswana', 'Africa'],
  ['BR', 'Brazil', 'Americas'],
  ['BN', 'Brunei', 'ASEAN'],
  ['BG', 'Bulgaria', 'Europe'],
  ['BF', 'Burkina Faso', 'Africa'],
  ['BI', 'Burundi', 'Africa'],
  ['CV', 'Cabo Verde', 'Africa'],
  ['KH', 'Cambodia', 'ASEAN'],
  ['CM', 'Cameroon', 'Africa'],
  ['CA', 'Canada', 'Americas'],
  ['CF', 'Central African Republic', 'Africa'],
  ['TD', 'Chad', 'Africa'],
  ['CL', 'Chile', 'Americas'],
  ['CO', 'Colombia', 'Americas'],
  ['KM', 'Comoros', 'Africa'],
  ['CD', 'Democratic Republic of the Congo', 'Africa'],
  ['CG', 'Republic of the Congo', 'Africa'],
  ['CR', 'Costa Rica', 'Americas'],
  ['CI', 'Côte d’Ivoire', 'Africa'],
  ['HR', 'Croatia', 'Europe'],
  ['CU', 'Cuba', 'Americas'],
  ['CY', 'Cyprus', 'Europe'],
  ['CZ', 'Czechia', 'Europe'],
  ['DK', 'Denmark', 'Europe'],
  ['DJ', 'Djibouti', 'Africa'],
  ['DM', 'Dominica', 'Americas'],
  ['DO', 'Dominican Republic', 'Americas'],
  ['EC', 'Ecuador', 'Americas'],
  ['EG', 'Egypt', 'Africa'],
  ['SV', 'El Salvador', 'Americas'],
  ['GQ', 'Equatorial Guinea', 'Africa'],
  ['ER', 'Eritrea', 'Africa'],
  ['EE', 'Estonia', 'Europe'],
  ['SZ', 'Eswatini', 'Africa'],
  ['ET', 'Ethiopia', 'Africa'],
  ['FJ', 'Fiji', 'Oceania'],
  ['FI', 'Finland', 'Europe'],
  ['GA', 'Gabon', 'Africa'],
  ['GM', 'Gambia', 'Africa'],
  ['GE', 'Georgia', 'Central Asia'],
  ['DE', 'Germany', 'Europe'],
  ['GH', 'Ghana', 'Africa'],
  ['GR', 'Greece', 'Europe'],
  ['GD', 'Grenada', 'Americas'],
  ['GT', 'Guatemala', 'Americas'],
  ['GN', 'Guinea', 'Africa'],
  ['GW', 'Guinea-Bissau', 'Africa'],
  ['GY', 'Guyana', 'Americas'],
  ['HT', 'Haiti', 'Americas'],
  ['HN', 'Honduras', 'Americas'],
  ['HU', 'Hungary', 'Europe'],
  ['IS', 'Iceland', 'Europe'],
  ['IR', 'Iran', 'Middle East'],
  ['IQ', 'Iraq', 'Middle East'],
  ['IE', 'Ireland', 'Europe'],
  ['IL', 'Israel', 'Middle East'],
  ['IT', 'Italy', 'Europe'],
  ['JM', 'Jamaica', 'Americas'],
  ['JO', 'Jordan', 'Middle East'],
  ['KZ', 'Kazakhstan', 'Central Asia'],
  ['KE', 'Kenya', 'Africa'],
  ['KI', 'Kiribati', 'Oceania'],
  ['XK', 'Kosovo', 'Europe'],
  ['KW', 'Kuwait', 'Middle East'],
  ['KG', 'Kyrgyzstan', 'Central Asia'],
  ['LA', 'Laos', 'ASEAN'],
  ['LV', 'Latvia', 'Europe'],
  ['LB', 'Lebanon', 'Middle East'],
  ['LS', 'Lesotho', 'Africa'],
  ['LR', 'Liberia', 'Africa'],
  ['LY', 'Libya', 'Africa'],
  ['LI', 'Liechtenstein', 'Europe'],
  ['LT', 'Lithuania', 'Europe'],
  ['LU', 'Luxembourg', 'Europe'],
  ['MO', 'Macau', 'Greater China'],
  ['MG', 'Madagascar', 'Africa'],
  ['MW', 'Malawi', 'Africa'],
  ['MV', 'Maldives', 'South Asia'],
  ['ML', 'Mali', 'Africa'],
  ['MT', 'Malta', 'Europe'],
  ['MH', 'Marshall Islands', 'Oceania'],
  ['MR', 'Mauritania', 'Africa'],
  ['MU', 'Mauritius', 'Africa'],
  ['MX', 'Mexico', 'Americas'],
  ['FM', 'Micronesia', 'Oceania'],
  ['MD', 'Moldova', 'Europe'],
  ['MC', 'Monaco', 'Europe'],
  ['MN', 'Mongolia', 'North Asia'],
  ['ME', 'Montenegro', 'Europe'],
  ['MZ', 'Mozambique', 'Africa'],
  ['MM', 'Myanmar', 'ASEAN'],
  ['NA', 'Namibia', 'Africa'],
  ['NR', 'Nauru', 'Oceania'],
  ['NP', 'Nepal', 'South Asia'],
  ['NL', 'Netherlands', 'Europe'],
  ['NZ', 'New Zealand', 'Oceania'],
  ['NI', 'Nicaragua', 'Americas'],
  ['NE', 'Niger', 'Africa'],
  ['NG', 'Nigeria', 'Africa'],
  ['KP', 'North Korea', 'North Asia'],
  ['MK', 'North Macedonia', 'Europe'],
  ['NO', 'Norway', 'Europe'],
  ['PK', 'Pakistan', 'South Asia'],
  ['PW', 'Palau', 'Oceania'],
  ['PS', 'Palestine', 'Middle East'],
  ['PA', 'Panama', 'Americas'],
  ['PG', 'Papua New Guinea', 'Oceania'],
  ['PY', 'Paraguay', 'Americas'],
  ['PE', 'Peru', 'Americas'],
  ['PL', 'Poland', 'Europe'],
  ['PT', 'Portugal', 'Europe'],
  ['RO', 'Romania', 'Europe'],
  ['RU', 'Russia', 'Europe'],
  ['RW', 'Rwanda', 'Africa'],
  ['KN', 'Saint Kitts and Nevis', 'Americas'],
  ['LC', 'Saint Lucia', 'Americas'],
  ['VC', 'Saint Vincent and the Grenadines', 'Americas'],
  ['WS', 'Samoa', 'Oceania'],
  ['SM', 'San Marino', 'Europe'],
  ['ST', 'São Tomé and Príncipe', 'Africa'],
  ['SN', 'Senegal', 'Africa'],
  ['RS', 'Serbia', 'Europe'],
  ['SC', 'Seychelles', 'Africa'],
  ['SL', 'Sierra Leone', 'Africa'],
  ['SK', 'Slovakia', 'Europe'],
  ['SI', 'Slovenia', 'Europe'],
  ['SB', 'Solomon Islands', 'Oceania'],
  ['SO', 'Somalia', 'Africa'],
  ['ZA', 'South Africa', 'Africa'],
  ['SS', 'South Sudan', 'Africa'],
  ['ES', 'Spain', 'Europe'],
  ['LK', 'Sri Lanka', 'South Asia'],
  ['SD', 'Sudan', 'Africa'],
  ['SR', 'Suriname', 'Americas'],
  ['SE', 'Sweden', 'Europe'],
  ['CH', 'Switzerland', 'Europe'],
  ['SY', 'Syria', 'Middle East'],
  ['TJ', 'Tajikistan', 'Central Asia'],
  ['TZ', 'Tanzania', 'Africa'],
  ['TL', 'Timor-Leste', 'ASEAN'],
  ['TG', 'Togo', 'Africa'],
  ['TO', 'Tonga', 'Oceania'],
  ['TT', 'Trinidad and Tobago', 'Americas'],
  ['TN', 'Tunisia', 'Africa'],
  ['TR', 'Türkiye', 'Middle East'],
  ['TM', 'Turkmenistan', 'Central Asia'],
  ['TV', 'Tuvalu', 'Oceania'],
  ['UG', 'Uganda', 'Africa'],
  ['UA', 'Ukraine', 'Europe'],
  ['GB', 'United Kingdom', 'Europe'],
  ['UY', 'Uruguay', 'Americas'],
  ['UZ', 'Uzbekistan', 'Central Asia'],
  ['VU', 'Vanuatu', 'Oceania'],
  ['VA', 'Vatican City', 'Europe'],
  ['VE', 'Venezuela', 'Americas'],
  ['VN', 'Vietnam', 'ASEAN'],
  ['EH', 'Western Sahara', 'Africa'],
  ['ZM', 'Zambia', 'Africa'],
  ['ZW', 'Zimbabwe', 'Africa'],
]

const toCountry = ([code, name, bloc]: Row, rank?: number): Country => ({
  code,
  name,
  bloc,
  flag: flagOf(code),
  ...(rank ? { rank } : {}),
})

/** The client's twenty, in their order. The counter's keypad starts here. */
export const topCountries: Country[] = TOP.map((r, i) => toCountry(r, i + 1))

/** All 200, in the client's document order: the top twenty, then the rest. */
export const countries: Country[] = [...topCountries, ...REST.map((r) => toCountry(r))]

/** Everything, A→Z. What the search box walks. */
export const countriesAlphabetical: Country[] = [...countries].sort((a, b) =>
  a.name.localeCompare(b.name),
)

export const countryByCode = (code: string) => countries.find((c) => c.code === code)

export const countryName = (code: string) => countryByCode(code)?.name ?? code

export const countryFlag = (code: string) => countryByCode(code)?.flag ?? '🏳️'

/**
 * Search, the way somebody at a counter would expect.
 *
 * A name that *starts* with what you typed comes before one that merely
 * contains it, so typing "in" offers India and Indonesia before Argentina. The
 * two-letter code matches too, because "MY" is faster than "Malaysia".
 */
export const searchCountries = (query: string, limit = 40): Country[] => {
  const q = query.trim().toLowerCase()
  if (!q) return countriesAlphabetical.slice(0, limit)

  const starts: Country[] = []
  const contains: Country[] = []
  for (const c of countriesAlphabetical) {
    const name = c.name.toLowerCase()
    if (name.startsWith(q) || c.code.toLowerCase() === q) starts.push(c)
    else if (name.includes(q)) contains.push(c)
  }
  return [...starts, ...contains].slice(0, limit)
}

/** Grouped A, B, C… for the picker's alphabet rail. */
export const byInitial = (list: Country[]): [string, Country[]][] => {
  const groups = new Map<string, Country[]>()
  for (const c of list) {
    const letter = c.name[0].toUpperCase()
    groups.set(letter, [...(groups.get(letter) ?? []), c])
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0]))
}

// ── Malaysia ────────────────────────────────────────────────────────────────

/**
 * Malaysian customers are recorded one level finer than everyone else.
 *
 * The client asked for it and it is the one place where "which country" is not
 * the interesting question — Malaysia is the home market, so what the buying
 * mix looks like inside it is worth more than the headcount. Nowhere else gets
 * this: it is a Malaysia-only field, and it is never guessed.
 */
export type MalaysiaSegment = 'malay' | 'chinese' | 'indian' | 'other'

export const MALAYSIA_SEGMENTS: { value: MalaysiaSegment; label: string }[] = [
  { value: 'malay', label: 'Malay' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'indian', label: 'Indian' },
  { value: 'other', label: 'Others' },
]

export const MALAYSIA_SEGMENT_LABEL: Record<MalaysiaSegment, string> = {
  malay: 'Malay',
  chinese: 'Chinese',
  indian: 'Indian',
  other: 'Others',
}

export const MALAYSIA = 'MY'

export const blocs: Bloc[] = [
  'Domestic',
  'Greater China',
  'North Asia',
  'ASEAN',
  'South Asia',
  'Middle East',
  'Central Asia',
  'Europe',
  'Africa',
  'Americas',
  'Oceania',
]
