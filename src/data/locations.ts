/**
 * Every place Legendary sells, taken from "Legendary Stores for CRM".
 *
 * Channel is the primary dimension in this system, because the four channels
 * genuinely report different things at different frequencies:
 *
 *   main         12 · sales + product + country, per product, daily
 *   dealer       56 · sales + product, daily, no country
 *   consignment   6 · sales + product, monthly, carries an agreed margin
 *   online        4 · sales + product, daily, sold straight from the warehouse
 *
 * The closing form a location gets, what it asks for, and how often it is due
 * are all decided by this field.
 *
 * Online is not in "Legendary Stores for CRM" — that document lists physical
 * places. It is here because the client answered Q5 ("do you sell online, your
 * own website, Shopee, Lazada, TikTok Shop — should those sales appear in this
 * system too?") with "Yes", and Q13 ("should the website and the shops share
 * the same stock numbers?") with "Yes". The storefront names below are the ones
 * the question listed and need confirming against what they actually run.
 */

export type Channel = 'main' | 'dealer' | 'consignment' | 'online'

export type Region =
  | 'Kuala Lumpur'
  | 'Selangor'
  | 'Highlands'
  | 'Melaka'
  | 'Airports'
  | 'Sabah'
  | 'Nationwide'
  | 'Online'
  /** Dealer towns were not supplied; these are pending the client's address list. */
  | 'To confirm'

export interface Location {
  id: string
  code: string
  name: string
  shortName: string
  channel: Channel
  region: Region
  /** "coming" locations appear in the estate but do not trade yet. */
  status: 'open' | 'coming'
  /** How often this location files. Decides which queue chases it. */
  cadence: 'daily' | 'monthly'
  /** Only main stores record which nationality bought which product. */
  recordsCountries: boolean
  /** Relative footfall weight, used by the demo data generator. */
  traffic: number
  /** Main stores carry a monthly target; the rest are not targeted. */
  monthlyTargetMYR?: number
  /** Consignment partners keep an agreed share. Rates still to be supplied. */
  marginPct?: number
  /**
   * Whether this location holds and counts its own stock.
   *
   * Every physical place does. Online does not: the client wants the website
   * and the shops on the same stock numbers (Q13), so an online order is picked
   * from the warehouse and never sits on a shelf of its own. Those locations
   * therefore file sales without a nightly count, and never raise a top-up
   * order — the warehouse is already where their stock is.
   */
  holdsOwnStock: boolean
  /** Nationalities over-represented here, strongest first. Main stores only. */
  originProfile?: string[]
  openedOn?: string
}

// ── Main stores ────────────────────────────────────────────────────────────
// Daily sales, product sold, and country against each product line.

const mainStores: Location[] = [
  {
    id: 'pavilion-5',
    code: 'PV5',
    name: 'Pavilion 5th Floor',
    shortName: 'Pavilion KL',
    channel: 'main',
    region: 'Kuala Lumpur',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 1.0,
    monthlyTargetMYR: 110_000,
    originProfile: ['CN', 'MY', 'ID', 'SG', 'IN'],
    openedOn: '2019-03-14',
  },
  {
    id: 'klcc-isetan',
    code: 'KLC',
    name: 'KLCC Isetan',
    shortName: 'KLCC Isetan',
    channel: 'main',
    region: 'Kuala Lumpur',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.86,
    monthlyTargetMYR: 95_000,
    originProfile: ['MY', 'CN', 'JP', 'KR', 'SG'],
    openedOn: '2020-08-01',
  },
  {
    id: 'parkson-pavilion',
    code: 'PKP',
    name: 'Parkson Pavilion',
    shortName: 'Parkson Pavilion',
    channel: 'main',
    region: 'Kuala Lumpur',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.62,
    monthlyTargetMYR: 66_000,
    originProfile: ['MY', 'CN', 'IN', 'SG', 'AE'],
    openedOn: '2025-11-20',
  },
  {
    id: 'genting',
    code: 'GEN',
    name: 'Genting Sky Avenue',
    shortName: 'Genting',
    channel: 'main',
    region: 'Highlands',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.74,
    monthlyTargetMYR: 80_000,
    originProfile: ['MY', 'SG', 'CN', 'ID', 'IN'],
    openedOn: '2021-06-11',
  },
  {
    id: 'melaka',
    code: 'MLK',
    name: 'Melaka',
    shortName: 'Melaka',
    channel: 'main',
    region: 'Melaka',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.68,
    monthlyTargetMYR: 72_000,
    originProfile: ['SG', 'ID', 'MY', 'CN', 'NL'],
    openedOn: '2018-01-22',
  },
  {
    id: 'klia-t2',
    code: 'KA2',
    name: 'KLIA T2',
    shortName: 'KLIA T2',
    channel: 'main',
    region: 'Airports',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.95,
    monthlyTargetMYR: 108_000,
    originProfile: ['CN', 'IN', 'ID', 'AU', 'GB'],
    openedOn: '2023-02-17',
  },
  {
    id: 'langkawi',
    code: 'LGK',
    name: 'Langkawi Airport',
    shortName: 'Langkawi',
    channel: 'main',
    region: 'Airports',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.52,
    monthlyTargetMYR: 59_000,
    originProfile: ['GB', 'AU', 'CN', 'MY', 'NL'],
    openedOn: '2023-07-08',
  },
  {
    id: 'parkson-imago',
    code: 'IKK',
    name: 'Parkson KK Imago',
    shortName: 'Imago KK',
    channel: 'main',
    region: 'Sabah',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.58,
    monthlyTargetMYR: 61_000,
    originProfile: ['CN', 'KR', 'MY', 'JP', 'AU'],
    openedOn: '2024-04-19',
  },
  {
    // Listed in the stores document without a location. Flagged for the client.
    id: 'bsas',
    code: 'BSA',
    name: 'BSAS',
    shortName: 'BSAS',
    channel: 'main',
    region: 'To confirm',
    status: 'open',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0.44,
    monthlyTargetMYR: 48_000,
    originProfile: ['MY', 'CN', 'SG', 'ID', 'IN'],
    openedOn: '2024-10-02',
  },
  {
    id: 'sogo-118',
    code: 'SG1',
    name: 'Sogo 118',
    shortName: 'Sogo 118',
    channel: 'main',
    region: 'Kuala Lumpur',
    status: 'coming',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0,
    monthlyTargetMYR: 70_000,
    originProfile: ['MY', 'CN', 'ID', 'SG', 'IN'],
  },
  {
    id: 'trx',
    code: 'TRX',
    name: 'TRX',
    shortName: 'TRX',
    channel: 'main',
    region: 'Kuala Lumpur',
    status: 'coming',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0,
    monthlyTargetMYR: 85_000,
    originProfile: ['MY', 'CN', 'SG', 'IN', 'AE'],
  },
  {
    id: 'melaka-parkland',
    code: 'MPM',
    name: 'Melaka Parkland Mall',
    shortName: 'Parkland Melaka',
    channel: 'main',
    region: 'Melaka',
    status: 'coming',
    cadence: 'daily',
    recordsCountries: true,
    holdsOwnStock: true,
    traffic: 0,
    monthlyTargetMYR: 55_000,
    originProfile: ['SG', 'ID', 'MY', 'CN', 'NL'],
  },
]

// ── Consignment ────────────────────────────────────────────────────────────
// Monthly sales and product sold. Each partner keeps an agreed margin; the
// rates below are placeholders until the client supplies the real ones.

const consignmentNames: [string, string, Region][] = [
  ['Sasa', 'SAS', 'Nationwide'],
  ['AirAsia', 'AIR', 'Airports'],
  ['Eraman KLIA T1', 'ER1', 'Airports'],
  ['Eraman KLIA T2', 'ER2', 'Airports'],
  ['Eraman KKIA', 'ERK', 'Airports'],
  ['Watsons', 'WAT', 'Nationwide'],
]

const consignment: Location[] = consignmentNames.map(([name, code, region], i) => ({
  id: `cons-${code.toLowerCase()}`,
  code,
  name,
  shortName: name,
  channel: 'consignment' as const,
  region,
  status: 'open' as const,
  cadence: 'monthly' as const,
  recordsCountries: false,
  holdsOwnStock: true,
  traffic: [0.9, 0.7, 1.1, 1.0, 0.5, 0.8][i],
  // Placeholder — real rates to be confirmed per partner (discovery Q58).
  marginPct: [30, 25, 35, 35, 35, 28][i],
}))

// ── Dealers ────────────────────────────────────────────────────────────────
// Daily sales and product sold, no country capture. Towns were not supplied,
// so region stays "To confirm" rather than being invented.

const dealerNames = [
  'Beauty Scent',
  'Colours & Fragrances',
  'Element Delight',
  'Star Glory',
  'New Hello Market',
  'Beauty & Fragrances',
  'Zapin',
  'Wow Colour & Beauty',
  'Discover Malaysia',
  'Fooyoo Retail',
  'Tung Service',
  'Seawind Trading',
  'Storm Local Product',
  'East Marine Sdn Bhd',
  'Era Prima Sdn Bhd',
  'Hoi Fung Local Products',
  'I Love Malaysia Fruits',
  'Jin Xi Yan Trading Sdn Bhd',
  'Kara Souvenir',
  'Ming And Confectionary Sdn Bhd',
  'Nana House',
  'Old Ko Kee Confectionery Sdn Bhd',
  'Public Chemist',
  'Top United Sdn Bhd',
  'Wright Way',
  'Xiao Hai Yan Trading',
  'Xin Tai Souvenir',
  'Yan Zhi Wu Sdn Bhd',
  'Birdnest Culture',
  'CLDF Enterprise',
  'Kaya Palazzo Enterprise',
  'Monzana',
  'Perfume Desire',
  'Pillbox Pharmacy Sdn Bhd',
  'Secret Perfume Boutique',
  'Summit Perfume House',
  'BT Gourmet Jonker Street Enterprise',
  'U Companion Sdn Bhd',
  'LB Aroma Enterprise',
  'Mi Equipment (M) Sdn Bhd',
  'Tean Ean',
  'Tropical Beauty Enterprise',
  'Mozz Fragrances',
  'Apes Vacationas Sdn Bhd',
  'C&M Star Collections',
  'Euro Classic Fragrances',
  'Fazurah Management',
  'Huang Xin',
  'I Scent Marketing Enterprise',
  'Jelex Marketing',
  'LSL Global Trading PLT',
  'My Happy Pharmacy PLT',
  'Savvy Travel & Tours Sdn Bhd',
  'Silver Beacon',
  'Vac Hub Sdn Bhd',
  'Yen Palace',
]

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const dealers: Location[] = dealerNames.map((name, i) => ({
  id: `dlr-${slug(name)}`,
  code: `D${String(i + 1).padStart(2, '0')}`,
  name,
  shortName: name.replace(/ (Sdn Bhd|PLT|Enterprise)$/i, ''),
  channel: 'dealer' as const,
  region: 'To confirm' as const,
  status: 'open' as const,
  cadence: 'daily' as const,
  recordsCountries: false,
  holdsOwnStock: true,
  // A spread of sizes so the league table is not flat, derived deterministically
  // from position rather than randomly, so it stays stable between runs.
  traffic: 0.08 + ((i * 37) % 23) / 100,
}))

// ── Online ─────────────────────────────────────────────────────────────────
// Daily sales and product sold, picked from the warehouse rather than from a
// shelf. No country: the client capture rule is "main outlets only" (Q29), and
// a marketplace does not tell you the buyer's nationality anyway.

const onlineNames: [string, string][] = [
  ['Legendary Website', 'WEB'],
  ['Shopee', 'SHP'],
  ['Lazada', 'LZD'],
  ['TikTok Shop', 'TTS'],
]

const online: Location[] = onlineNames.map(([name, code], i) => ({
  id: `web-${code.toLowerCase()}`,
  code,
  name,
  shortName: name,
  channel: 'online' as const,
  region: 'Online' as const,
  status: 'open' as const,
  cadence: 'daily' as const,
  recordsCountries: false,
  holdsOwnStock: false,
  traffic: [0.34, 0.52, 0.38, 0.29][i],
}))

export const locations: Location[] = [...mainStores, ...consignment, ...dealers, ...online]

export const CHANNEL_LABEL: Record<Channel, string> = {
  main: 'Main store',
  dealer: 'Dealer',
  consignment: 'Consignment',
  online: 'Online',
}

export const CHANNEL_PLURAL: Record<Channel, string> = {
  main: 'Main stores',
  dealer: 'Dealers',
  consignment: 'Consignment',
  online: 'Online',
}

/** Display order, used by every channel switch and every donut. */
export const CHANNELS: Channel[] = ['main', 'dealer', 'consignment', 'online']

export const regions: Region[] = [
  'Kuala Lumpur',
  'Selangor',
  'Highlands',
  'Melaka',
  'Airports',
  'Sabah',
  'Nationwide',
  'Online',
  'To confirm',
]

export const locationById = (id: string) => locations.find((l) => l.id === id)

export const locationName = (id: string) => locationById(id)?.shortName ?? id

/** Locations actually trading — excludes the three not yet open. */
export const tradingLocations = locations.filter((l) => l.status === 'open')

export const locationsInChannel = (channel: Channel) =>
  locations.filter((l) => l.channel === channel)

/** The three Davy checks first thing every morning (discovery Q71). */
export const MORNING_WATCHLIST = ['pavilion-5', 'klia-t2', 'klcc-isetan']
