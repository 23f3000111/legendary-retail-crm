/**
 * Every place Legendary sells, from "Legendary Stores for CRM" as revised in
 * "CRM Revision 2".
 *
 * Channel is the primary dimension in this system, because the four channels
 * genuinely report different things at different frequencies. The section
 * headings below are the client's own, and the Stores screen uses them
 * verbatim:
 *
 *   Main Stores (Daily sales, SKU sold, countries) .. 12
 *   Dealer (Daily sales, SKU sold) .................. 44
 *   Consignment (Monthly sales, SKU sold) ............ 6
 *   Online .......................................... 4
 *
 * ── The two things Revision 2 added ─────────────────────────────────────────
 *
 * **Legendary Margin.** What Legendary keeps. Dealers are all 70%; consignment
 * runs 48.5% to 70% and differs per partner.
 *
 * **Count based on.** Whether that location's revenue is counted on the retail
 * price or the promotion price. BSAS and Sasa are on retail; everybody else is
 * on promotion. This is not cosmetic — the two differ by more than 20%, so a
 * figure computed on the wrong one is simply wrong.
 */

import type { PriceBasis } from './products'

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
  /** Which price this location's revenue is counted on (Revision 2). */
  priceBasis: PriceBasis
  /** Relative footfall weight, used by the demo data generator. */
  traffic: number
  /** Main stores carry a monthly target; the rest are not targeted. */
  monthlyTargetMYR?: number
  /** What Legendary keeps, where the client gave a figure. */
  marginPct?: number
  /** Nationalities over-represented here, strongest first. Main stores only. */
  originProfile?: string[]
  /**
   * Whether this location holds and counts its own stock.
   *
   * Every physical place does. Online does not: the client wants the website
   * and the shops on the same stock numbers (Q13), so an online order is picked
   * from the warehouse and never sits on a shelf of its own.
   */
  holdsOwnStock: boolean
  openedOn?: string
}

/** The client's own section headings, used verbatim on screen. */
export const CHANNEL_HEADING: Record<Channel, string> = {
  main: 'Main Stores (Daily sales, SKU sold, countries)',
  dealer: 'Dealer (Daily sales, SKU sold)',
  consignment: 'Consignment (Monthly sales, SKU sold)',
  online: 'Online (Daily sales, SKU sold)',
}

// ── Main stores ────────────────────────────────────────────────────────────
// In the client's own order. Daily sales, product sold, and country against
// each product line.

interface MainSeed {
  id: string
  code: string
  name: string
  shortName: string
  region: Region
  basis: PriceBasis
  status?: 'coming'
  traffic: number
  target?: number
  origins?: string[]
  openedOn?: string
}

const mainSeeds: MainSeed[] = [
  { id: 'pavilion-5', code: 'PV5', name: 'Pavilion 5th Floor', shortName: 'Pavilion KL', region: 'Kuala Lumpur', basis: 'promotion', traffic: 1.0, target: 110_000, origins: ['CN', 'MY', 'ID', 'SG', 'IN'], openedOn: '2019-03-14' },
  { id: 'genting', code: 'GEN', name: 'Genting Sky Avenue', shortName: 'Genting', region: 'Highlands', basis: 'promotion', traffic: 0.74, target: 80_000, origins: ['MY', 'SG', 'CN', 'ID', 'IN'], openedOn: '2021-06-11' },
  { id: 'melaka', code: 'MLK', name: 'Melaka', shortName: 'Melaka', region: 'Melaka', basis: 'promotion', traffic: 0.68, target: 72_000, origins: ['SG', 'ID', 'MY', 'CN', 'NL'], openedOn: '2018-01-22' },
  { id: 'langkawi', code: 'LGK', name: 'Langkawi Airport', shortName: 'Langkawi', region: 'Airports', basis: 'promotion', traffic: 0.52, target: 59_000, origins: ['GB', 'AU', 'CN', 'MY', 'NL'], openedOn: '2023-07-08' },
  { id: 'klia-t2', code: 'KA2', name: 'KLIA T2', shortName: 'KLIA T2', region: 'Airports', basis: 'promotion', traffic: 0.95, target: 108_000, origins: ['CN', 'IN', 'ID', 'AU', 'GB'], openedOn: '2023-02-17' },
  // Listed in the stores document without a location, and the one main store
  // counted on the retail price. Both flagged for the client.
  { id: 'bsas', code: 'BSA', name: 'BSAS', shortName: 'BSAS', region: 'To confirm', basis: 'retail', traffic: 0.44, target: 48_000, origins: ['MY', 'CN', 'SG', 'ID', 'IN'], openedOn: '2024-10-02' },
  { id: 'parkson-pavilion', code: 'PKP', name: 'Parkson Pavilion', shortName: 'Parkson Pavilion', region: 'Kuala Lumpur', basis: 'promotion', traffic: 0.62, target: 66_000, origins: ['MY', 'CN', 'IN', 'SG', 'AE'], openedOn: '2025-11-20' },
  { id: 'parkson-imago', code: 'IKK', name: 'Parkson KK Imago', shortName: 'Imago KK', region: 'Sabah', basis: 'promotion', traffic: 0.58, target: 61_000, origins: ['CN', 'KR', 'MY', 'JP', 'AU'], openedOn: '2024-04-19' },
  { id: 'klcc-isetan', code: 'KLC', name: 'KLCC Isetan', shortName: 'KLCC Isetan', region: 'Kuala Lumpur', basis: 'promotion', traffic: 0.86, target: 95_000, origins: ['MY', 'CN', 'JP', 'KR', 'SG'], openedOn: '2020-08-01' },
  { id: 'sogo-118', code: 'SG1', name: 'Sogo 118', shortName: 'Sogo 118', region: 'Kuala Lumpur', basis: 'promotion', status: 'coming', traffic: 0, target: 70_000, origins: ['MY', 'CN', 'ID', 'SG', 'IN'] },
  { id: 'trx', code: 'TRX', name: 'TRX', shortName: 'TRX', region: 'Kuala Lumpur', basis: 'promotion', status: 'coming', traffic: 0, target: 85_000, origins: ['MY', 'CN', 'SG', 'IN', 'AE'] },
  { id: 'melaka-parkland', code: 'MPM', name: 'Melaka Parkland Mall', shortName: 'Parkland Melaka', region: 'Melaka', basis: 'promotion', status: 'coming', traffic: 0, target: 55_000, origins: ['SG', 'ID', 'MY', 'CN', 'NL'] },
]

const mainStores: Location[] = mainSeeds.map((m) => ({
  id: m.id,
  code: m.code,
  name: m.name,
  shortName: m.shortName,
  channel: 'main',
  region: m.region,
  status: m.status ?? 'open',
  cadence: 'daily',
  recordsCountries: true,
  priceBasis: m.basis,
  traffic: m.traffic,
  monthlyTargetMYR: m.target,
  originProfile: m.origins,
  holdsOwnStock: true,
  openedOn: m.openedOn,
}))

// ── Consignment ────────────────────────────────────────────────────────────
// Monthly sales and product sold. Margins and price basis from Revision 2.

const consignmentSeeds: [name: string, code: string, region: Region, margin: number, basis: PriceBasis][] = [
  ['Sasa', 'SAS', 'Nationwide', 48.5, 'retail'],
  ['Airasia', 'AIR', 'Airports', 50, 'promotion'],
  ['Eraman KLIA T1', 'ER1', 'Airports', 50, 'promotion'],
  ['Eraman KLIA T2', 'ER2', 'Airports', 50, 'promotion'],
  ['Eraman KKIA', 'ERK', 'Airports', 50, 'promotion'],
  ['Watsons', 'WAT', 'Nationwide', 70, 'promotion'],
]

const consignment: Location[] = consignmentSeeds.map(([name, code, region, margin, basis], i) => ({
  id: `cons-${code.toLowerCase()}`,
  code,
  name,
  shortName: name,
  channel: 'consignment' as const,
  region,
  status: 'open' as const,
  cadence: 'monthly' as const,
  recordsCountries: false,
  priceBasis: basis,
  traffic: [0.9, 0.7, 1.1, 1.0, 0.5, 0.8][i],
  marginPct: margin,
  holdsOwnStock: true,
}))

// ── Dealers ────────────────────────────────────────────────────────────────
// The revised list from "CRM Revision 2" — 44, replacing the 56 in the original
// stores document. All at 70%, all counted on the promotion price. Towns were
// not supplied, so region stays "To confirm" rather than being invented.

const dealerNames = [
  'Beauty Scent',
  'Colours & Fragrances',
  'Star Glory',
  'New Hello Market',
  'Beauty & Fragrances',
  'Zapin',
  'Discover Malaysia (Vac Hub)',
  'Fooyoo Retail',
  'Tung Service',
  'Seawind Trading',
  'Storm Local Product',
  'East Marine Sdn Bhd',
  'Era Prima Sdn Bhd',
  'Hoi Fung Local Products',
  'I Love Malaysia Fruits',
  'Kaara Brown',
  'Kaara Green',
  'Kaara Orange',
  'Kaara Pink',
  'Kaara Imago',
  'Kaara Gaya Street',
  'Kaara Suria',
  'Kaara Yellow',
  'Ming And Confectionary Sdn Bhd',
  'Nana House',
  'Old Ko Kee Confectionery Sdn Bhd',
  'Public Chemist',
  'Top United Sdn Bhd',
  'Xin Tai Souvenir',
  'CLDF Enterprise',
  'Kaya Palazzo Enterprise',
  'Monzana',
  'Perfume Desire',
  'Secret Perfume Boutique',
  'Summit Perfume House',
  'Tean Ean',
  'Tropical Beauty Enterprise',
  'Euro Classic Fragrances',
  'Fazurah Management',
  'I Scent Marketing Enterprise',
  'My Happy Pharmacy PLT',
  'Savvy Travel & Tours Sdn Bhd',
  'Silver Beacon',
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
  priceBasis: 'promotion' as const,
  marginPct: 70,
  holdsOwnStock: true,
  // A spread of sizes so the league table is not flat, derived deterministically
  // from position rather than randomly, so it stays stable between runs.
  traffic: 0.08 + ((i * 37) % 23) / 100,
}))

// ── Online ─────────────────────────────────────────────────────────────────
// Daily sales and product sold, picked from the warehouse rather than from a
// shelf. No country: the capture rule is "main outlets only" (Q29).

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
  priceBasis: 'promotion' as const,
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

/** Which price a location's revenue is counted on. Promotion unless stated. */
export const basisOf = (locationId: string): PriceBasis =>
  locationById(locationId)?.priceBasis ?? 'promotion'

/** Locations actually trading — excludes the three not yet open. */
export const tradingLocations = locations.filter((l) => l.status === 'open')

export const locationsInChannel = (channel: Channel) =>
  locations.filter((l) => l.channel === channel)

/**
 * Stores grouped under the client's own headings, for every store picker.
 *
 * A flat list of 66 names in a dropdown is unusable — you cannot tell a dealer
 * from a main store, and the one you want is somewhere in the middle.
 */
export const locationGroups = (
  only: (l: Location) => boolean = (l) => l.status === 'open',
): { channel: Channel; heading: string; locations: Location[] }[] =>
  CHANNELS.map((channel) => ({
    channel,
    heading: CHANNEL_HEADING[channel],
    locations: locations.filter((l) => l.channel === channel && only(l)),
  })).filter((g) => g.locations.length > 0)

/** The three Davy checks first thing every morning (discovery Q71). */
export const MORNING_WATCHLIST = ['pavilion-5', 'klia-t2', 'klcc-isetan']
