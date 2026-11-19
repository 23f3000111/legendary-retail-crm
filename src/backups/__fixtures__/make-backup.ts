/**
 * For the tests only: a backup built and encrypted here, with OpenPGP.js,
 * at the settings the nightly job's gpg uses (AES-256, iterated and salted
 * SHA-512 key derivation at its highest count, integrity-protected).
 */
import { gzipSync, strToU8 } from 'fflate'
import { createMessage, encrypt, enums } from 'openpgp'

/** A plain ustar archive of regular files. */
export function tarOf(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const [name, text] of Object.entries(files)) {
    const body = strToU8(text)
    const header = new Uint8Array(512)
    const put = (at: number, value: string) => header.set(strToU8(value), at)
    put(0, name)
    put(100, '0000644\0')
    put(108, '0000000\0')
    put(116, '0000000\0')
    put(124, body.length.toString(8).padStart(11, '0') + '\0')
    put(136, '00000000000\0')
    put(148, '        ')
    put(156, '0')
    put(257, 'ustar\0')
    put(263, '00')
    const sum = header.reduce((a, b) => a + b, 0)
    put(148, sum.toString(8).padStart(6, '0') + '\0 ')
    blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((a, b) => a + b.length, 0))
  let at = 0
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  return out
}

export async function makeBackup(files: Record<string, string>, passphrase: string): Promise<Uint8Array> {
  const message = await createMessage({ binary: gzipSync(tarOf(files)) })
  return (await encrypt({
    message,
    passwords: [passphrase],
    format: 'binary',
    config: {
      preferredSymmetricAlgorithm: enums.symmetric.aes256,
      s2kIterationCountByte: 255,
      aeadProtect: false,
    },
  })) as Uint8Array
}
