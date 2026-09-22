/**
 * Ids that are unique across every device, not only within one browser.
 *
 * Two promoters can ring up a sale in the same second on two phones, so
 * nothing that is written to the shared server may be numbered by a counter.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A few characters nobody will mistake for each other — no 0/O, 1/I. */
export const shortCode = (length = 4): string => {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${shortCode(10)}`

/**
 * An order number a person can read out over the phone: the day it was
 * raised and four characters. `PO-260922-K7QM`.
 */
export const newOrderId = (day: string): string => `PO-${day.replace(/-/g, '').slice(2)}-${shortCode(4)}`
