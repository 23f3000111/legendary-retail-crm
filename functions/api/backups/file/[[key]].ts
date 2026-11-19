/**
 * GET /api/backups/file/<nightly|monthly>/<stamp> — one encrypted backup,
 * passed through from KV as it is. Only the two backup folders can be
 * reached; the guard's counters and anything else in KV cannot.
 */
import type { Env } from '../../../_lib/env'
import { json } from '../../../_lib/http'

const KEY = /^(nightly|monthly)\/[0-9_-]+$/

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const key = ([] as string[]).concat(params.key ?? []).join('/')
  if (!KEY.test(key)) return json(400, { error: 'That is not a backup.' })
  const { value } = await env.BACKUPS.getWithMetadata(key, 'stream')
  if (!value) return json(404, { error: 'That backup is not here.' })
  return new Response(value, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="legendary-crm-${key.split('/')[1]}.tar.gz.gpg"`,
    },
  })
}
