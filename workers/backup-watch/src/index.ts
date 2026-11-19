/**
 * legendary-crm-backup-watch — every afternoon at 16:00 in Malaysia, the
 * newest backup in the Backups page's KV namespace must be under 30 hours
 * old, or the alert list hears about it (design, 19 November).
 *
 * It runs on Cloudflare on purpose. The nightly backup runs on GitHub's
 * scheduler, which starts late most nights and could skip one without a
 * word; GitHub emails a failed run, but not one that never started.
 */
import { myt } from '../../../functions/_lib/http'
import { sendAlert } from '../../../functions/_lib/mail'

export interface Env {
  BACKUPS: KVNamespace
  RESEND_API_KEY: string
  ALERT_EMAILS: string
  ALERT_REPLY_TO: string
}

export const STALE_HOURS = 30
const ACTIONS = 'https://github.com/23f3000111/legendary-crm-backups/actions'
const PAGE = 'https://crm.legendary.com.my/backups/'

type Key = { name: string; metadata?: unknown }

/** The latest `takenAt` among the keys, or null when there are none. */
export function newestTakenAt(keys: Key[]): string | null {
  let newest: string | null = null
  for (const k of keys) {
    const takenAt = (k.metadata as { takenAt?: string } | undefined)?.takenAt
    if (takenAt && (!newest || takenAt > newest)) newest = takenAt
  }
  return newest
}

export const hoursSince = (iso: string, nowMs: number) => (nowMs - Date.parse(iso)) / 3_600_000

/** Every nightly and monthly backup's key, page by page. */
async function allBackups(kv: KVNamespace): Promise<Key[]> {
  const keys: Key[] = []
  for (const prefix of ['nightly/', 'monthly/']) {
    let cursor: string | undefined
    do {
      const page = await kv.list({ prefix, cursor })
      keys.push(...page.keys)
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
  }
  return keys
}

/**
 * Looks once, and emails the alert list when the newest backup is too old,
 * or when it cannot read the backups at all: a check that fails without a
 * word is no check (final review M10, 19 November). It still fails the run
 * then, so Cloudflare's own log shows it too.
 */
export async function check(env: Env, nowMs: number): Promise<'fresh' | 'stale'> {
  const keys = await allBackups(env.BACKUPS).catch(async (e: unknown) => {
    await sendAlert(
      env,
      'CRM backup check could not run',
      `The daily check at ${myt(nowMs)} (Malaysia time) could not read the list of backups in Cloudflare, ` +
        `so it cannot tell whether last night's backup arrived.\n\n` +
        `Cloudflare said: ${e instanceof Error ? e.message : String(e)}\n\n` +
        `The backups may well be fine. To see them, sign in at ${PAGE}, or look at the nightly runs: ${ACTIONS}`,
    )
    throw e
  })
  const newest = newestTakenAt(keys)
  if (newest && hoursSince(newest, nowMs) <= STALE_HOURS) return 'fresh'

  const subject = newest ? `No CRM backup for ${Math.floor(hoursSince(newest, nowMs))} hours` : 'No CRM backup in Cloudflare'
  const text = newest
    ? `The newest backup in Cloudflare was taken at ${myt(Date.parse(newest))} (Malaysia time), more than ` +
      `${STALE_HOURS} hours ago. The nightly backup has stopped, or has stopped copying here.\n\n` +
      `A failed run on GitHub says why: ${ACTIONS}`
    : `There is no backup at all in the Backups page's copy in Cloudflare.\n\nThe nightly runs are at ${ACTIONS}`
  await sendAlert(env, subject, text)
  return 'stale'
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(check(env, Date.now()))
  },
} satisfies ExportedHandler<Env>
