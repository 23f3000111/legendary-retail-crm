/**
 * PUT /api/backups/upload/<nightly|monthly>/<stamp> — how the nightly job
 * (legendary-crm-backups) puts each new backup here: the encrypted file as
 * it is, and the job's own description of it in X-Backup-Meta.
 *
 * Only with the job's key, which the middleware checks. That key can add a
 * backup and nothing else: it cannot list, read or delete one, or touch the
 * guard's counters. A Cloudflare key in GitHub could have done all of that,
 * changed the site, and sent mail as legendary.com.my (go-live, 19 November).
 */
import type { Env } from '../../../_lib/env'
import { json } from '../../../_lib/http'

const NIGHTLY = /^nightly\/\d{4}-\d{2}-\d{2}_\d{4}$/
const MONTHLY = /^monthly\/\d{4}-\d{2}-\d{2}$/
/** One KV value holds 25 MiB; the job stops at 24. */
const MAX_BYTES = 24 * 1024 * 1024
/** Thirty-one nights, then KV deletes a nightly one by itself. */
const NIGHTLY_TTL = 31 * 86_400
/** KV keeps at most 1,024 bytes of metadata with a value. */
const MAX_META = 1024

interface Meta {
  takenAt: string
  counts: Record<string, number>
}

/** The Describe step's JSON — when it was taken, and the job's counts — or null. */
function readMeta(header: string | null): Meta | null {
  if (!header) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(header)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { takenAt, counts } = parsed as Record<string, unknown>
  if (typeof takenAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(takenAt)) return null
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return null
  const entries = Object.entries(counts)
  const fine = entries.every(([table, n]) => /^[a-z_]{1,40}$/.test(table) && Number.isSafeInteger(n) && (n as number) >= 0)
  return fine ? { takenAt, counts: Object.fromEntries(entries) as Record<string, number> } : null
}

/**
 * Whether the file starts as every gpg backup does, with a password-encrypted
 * session key (packet tag 3, old or new format): so an unencrypted backup is
 * never kept here by mistake.
 */
const looksEncrypted = (first: number | undefined) => first !== undefined && ((first & 0xfc) === 0x8c || first === 0xc3)

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const key = ([] as string[]).concat(params.key ?? []).join('/')
  const nightly = NIGHTLY.test(key)
  if (!nightly && !MONTHLY.test(key)) return json(400, { error: 'That is not a backup’s name.' })
  const meta = readMeta(request.headers.get('x-backup-meta'))
  if (!meta) return json(400, { error: 'X-Backup-Meta is missing, or not as the job writes it.' })
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return json(413, { error: 'Over 24 MiB.' })

  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return json(413, { error: 'Over 24 MiB.' })
  if (!looksEncrypted(new Uint8Array(body)[0])) return json(400, { error: 'Only an encrypted backup is kept here.' })
  const metadata = { ...meta, sizeBytes: body.byteLength }
  if (JSON.stringify(metadata).length > MAX_META) return json(400, { error: 'X-Backup-Meta is too long.' })

  try {
    await env.BACKUPS.put(key, body, { metadata, ...(nightly ? { expirationTtl: NIGHTLY_TTL } : {}) })
  } catch {
    return json(503, { error: 'Cloudflare would not keep it. Try again later.' })
  }
  return json(200, { kept: key, sizeBytes: body.byteLength })
}
