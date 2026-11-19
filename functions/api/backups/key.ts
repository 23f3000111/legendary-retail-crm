/**
 * GET /api/backups/key — the passphrase every backup is encrypted with, for
 * a signed-in browser to unlock one on the device itself. The free plan's
 * 10 ms of CPU a request could never unlock one here.
 */
import type { Env } from '../../_lib/env'
import { json } from '../../_lib/http'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => json(200, { passphrase: env.BACKUP_PASSPHRASE })
