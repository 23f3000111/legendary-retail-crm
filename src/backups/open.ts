/**
 * A backup, unlocked and read on the device itself.
 *
 * The nightly job encrypts each backup with gpg (AES-256, the passphrase
 * stretched by 65 million rounds of SHA-512). The Backups page's server hands
 * a signed-in browser the encrypted bytes and the passphrase, and this does
 * the rest — the server is allowed 10 ms of CPU a request, and this takes
 * seconds on a phone. Nothing it unlocks leaves the tab.
 */
import { gunzipSync, strFromU8 } from 'fflate'
import { decrypt, readMessage } from 'openpgp'
import { parseDump } from '../backup/dump'
import { readTar } from '../backup/tar'
import { tablesFrom, type Table } from '../backup/tables'

export class CannotUnlock extends Error {
  constructor() {
    super("This backup can't be unlocked with the key the page holds.")
  }
}

export interface OpenedBackup {
  /** The job's own count of each table, taken just before the dump. */
  counts: Record<string, number>
  tables: Table[]
}

/** `people|40` lines, as the job writes them. */
const countsOf = (text: string) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, n] = line.split('|')
        return [name, Number(n)]
      }),
  )

export async function openBackup(encrypted: Uint8Array, passphrase: string): Promise<OpenedBackup> {
  let plain: Uint8Array
  try {
    const message = await readMessage({ binaryMessage: encrypted })
    const { data } = await decrypt({ message, passwords: [passphrase], format: 'binary' })
    plain = data as Uint8Array
  } catch {
    throw new CannotUnlock()
  }
  const files = readTar(gunzipSync(plain))
  const dataSql = files.get('data.sql')
  if (!dataSql) throw new Error('This backup has no data.sql in it.')
  const counts = files.get('counts-before.txt')
  return {
    counts: counts ? countsOf(strFromU8(counts)) : {},
    tables: tablesFrom(parseDump(strFromU8(dataSql))),
  }
}
