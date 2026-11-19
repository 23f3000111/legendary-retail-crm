/**
 * The files inside a tar archive, as the nightly jobs write them with GNU
 * tar: four regular files at the top level. Just enough of the ustar format
 * to read those back in a browser — no links, no directories kept.
 */
const decoder = new TextDecoder()

const text = (block: Uint8Array, from: number, length: number) => {
  const raw = block.subarray(from, from + length)
  const end = raw.indexOf(0)
  return decoder.decode(end < 0 ? raw : raw.subarray(0, end))
}

export function readTar(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  let at = 0
  let longName: string | null = null
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512)
    if (header.every((b) => b === 0)) break // the two empty blocks that end an archive
    const size = parseInt(text(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 0x30)
    const prefix = text(header, 345, 155)
    const name = longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100))
    const body = bytes.subarray(at + 512, at + 512 + size)
    longName = null
    if (type === 'L') longName = decoder.decode(body).replace(/\0+$/, '') // GNU long name for the next entry
    else if (type === '0') files.set(name.replace(/^\.\//, ''), body)
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}
