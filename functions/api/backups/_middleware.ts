/**
 * In front of every /api/backups/* route: a session or nothing, except for
 * signing in; and nothing this server sends is ever cached, indexed, or
 * reported to another site.
 */
import { sessionValid } from '../../_lib/auth'
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
  const signingIn = request.method === 'POST' && new URL(request.url).pathname.endsWith('/api/backups/sign-in')
  const response =
    signingIn || (await sessionValid(env, request.headers.get('cookie'), Date.now()))
      ? await context.next()
      : json(401, { error: 'Sign in again.' })
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries(HEADERS)) out.headers.set(name, value)
  return out
}
