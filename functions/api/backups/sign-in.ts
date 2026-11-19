/**
 * POST /api/backups/sign-in {password}
 *
 * The one way in. Every try is counted before its password is looked at,
 * so a page whose counter cannot be written turns everyone away; a right
 * password is forgiven its try, gets a one-hour session, and tells the alert
 * list somebody is in.
 */
import { newSession, passwordMatches, sessionCookie } from '../../_lib/auth'
import type { Env } from '../../_lib/env'
import { countAttempt, forgiveAttempt, lockedFor } from '../../_lib/guard'
import { json, myt, whereFrom } from '../../_lib/http'
import { sendAlert } from '../../_lib/mail'

const PAUSED = { error: 'Sign-in is paused. Try again later.' }
const ROTATE = 'node scripts/backup-page-setup.mjs --rotate-password'

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const now = Date.now()

  const locked = await lockedFor(env.BACKUPS, ip, now)
  if (locked.lock === 'unavailable') return json(503, PAUSED)
  if (locked.lock) {
    return json(429, {
      error: locked.lock === 'page' ? 'The page is locked after too many wrong tries.' : 'Too many wrong tries.',
      lock: locked.lock,
      until: new Date(locked.untilMs!).toISOString(),
    })
  }

  let password = ''
  try {
    const body = (await request.json()) as { password?: unknown }
    if (typeof body?.password === 'string') password = body.password
  } catch {
    // Not JSON: treated as no password.
  }
  if (!password || password.length > 200) return json(400, { error: 'Type the backup password.' })

  let tried
  try {
    tried = await countAttempt(env.BACKUPS, ip, now)
  } catch {
    return json(503, PAUSED)
  }

  if (await passwordMatches(env, password)) {
    waitUntil(forgiveAttempt(env.BACKUPS, ip).catch(() => undefined))
    waitUntil(
      sendAlert(
        env,
        'Backups page opened',
        `Someone signed in to the CRM's Backups page at ${myt(now)} (Malaysia time), from ${whereFrom(request)}.\n\n` +
          `If that was not you or someone you gave the password to, change the password at once:\n  ${ROTATE}`,
      ),
    )
    return json(200, { ok: true }, { 'set-cookie': sessionCookie(await newSession(env, now)) })
  }

  if (tried.lock === 'page') {
    waitUntil(
      sendAlert(
        env,
        'Backups page locked',
        `Twenty wrong passwords within an hour: the CRM's Backups page is locked until ${myt(tried.untilMs!)} ` +
          `(Malaysia time). The last try came from ${whereFrom(request)}.\n\n` +
          `If nobody you know was trying, change the password:\n  ${ROTATE}`,
      ),
    )
  }
  return json(401, { error: 'That password is not right.' })
}
