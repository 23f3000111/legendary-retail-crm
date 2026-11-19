/**
 * POST /api/backups/sign-out — this browser forgets its session at once,
 * for whoever borrows the phone or computer next. Answered with or without
 * a session, so a page that has already timed out can still clear it.
 */
import { signOutCookie } from '../../_lib/auth'
import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

export const onRequestPost: PagesFunction<Env> = async () => json(200, { ok: true }, { 'set-cookie': signOutCookie() })
