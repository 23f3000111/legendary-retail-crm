/**
 * Nationalities the outlets actually serve. Three of nine Legendary stores are
 * airport locations, so country of origin is a primary reporting dimension
 * rather than a nice-to-have.
 */
export interface Country {
  code: string
  name: string
  flag: string
  /** Grouping used by the owner dashboard's region filter. */
  bloc: 'Domestic' | 'Greater China' | 'South Asia' | 'ASEAN' | 'Europe' | 'Oceania' | 'Middle East' | 'North Asia' | 'Americas'
}

export const countries: Country[] = [
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', bloc: 'Domestic' },
  { code: 'CN', name: 'China', flag: '🇨🇳', bloc: 'Greater China' },
  { code: 'IN', name: 'India', flag: '🇮🇳', bloc: 'South Asia' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', bloc: 'ASEAN' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', bloc: 'ASEAN' },
  { code: 'GB', name: 'England', flag: '🇬🇧', bloc: 'Europe' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', bloc: 'Oceania' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', bloc: 'Middle East' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', bloc: 'North Asia' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', bloc: 'North Asia' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', bloc: 'ASEAN' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', bloc: 'Europe' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', bloc: 'Middle East' },
  { code: 'US', name: 'United States', flag: '🇺🇸', bloc: 'Americas' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', bloc: 'ASEAN' },
]

export const countryByCode = (code: string) => countries.find((c) => c.code === code)

export const countryName = (code: string) => countryByCode(code)?.name ?? code

export const countryFlag = (code: string) => countryByCode(code)?.flag ?? '🏳️'

export const blocs = [
  'Domestic',
  'Greater China',
  'South Asia',
  'ASEAN',
  'Europe',
  'Oceania',
  'Middle East',
  'North Asia',
  'Americas',
] as const
