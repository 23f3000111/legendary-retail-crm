/**
 * In front of every /api/backups/* route: a session or nothing, except for
 * signing in, and for the nightly job adding a backup with its own key (a
 * session cannot add one, and that key opens nothing else); and nothing this
 * server sends is ever cached, indexed, or reported to another site.
 */
import { sessionValid, uploadKeyValid } from '../../_lib/auth'
import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

const HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const path = new URL(request.url).pathname
  const open = request.method === 'POST' && (path.endsWith('/api/backups/sign-in') || path.endsWith('/api/backups/sign-out'))
  const upload = request.method === 'PUT' && path.startsWith('/api/backups/upload/')
  const allowed =
    open ||
    (upload
      ? await uploadKeyValid(env, request.headers.get('authorization'))
      : await sessionValid(env, request.headers.get('cookie'), Date.now()))
  const response = allowed
    ? await context.next()
    : json(401, { error: upload ? 'That is not the nightly job’s key.' : 'Sign in again.' })
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries(HEADERS)) out.headers.set(name, value)
  return out
}
