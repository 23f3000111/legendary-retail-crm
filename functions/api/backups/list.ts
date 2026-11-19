/**
 * GET /api/backups/list — every backup in Cloudflare, newest first, with the
 * server's own time, so a phone with the wrong clock still sees how old the
 * newest one is.
 */
import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

interface Meta {
  takenAt?: string
  sizeBytes?: number
  counts?: Record<string, number>
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const backups: ({ key: string; kind: 'nightly' | 'monthly' } & Meta)[] = []
  for (const kind of ['nightly', 'monthly'] as const) {
    let cursor: string | undefined
    do {
      const page = await env.BACKUPS.list<Meta>({ prefix: `${kind}/`, cursor })
      for (const k of page.keys) backups.push({ key: k.name, kind, ...(k.metadata ?? {}) })
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
  }
  backups.sort((a, b) => ((a.takenAt ?? '') < (b.takenAt ?? '') ? 1 : -1))
  return json(200, { now: new Date().toISOString(), backups })
}
