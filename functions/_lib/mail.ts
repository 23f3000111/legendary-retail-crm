/**
 * An email to the alert list, through Resend: someone signed in to the
 * Backups page, the page locked itself, or a night's backup is missing.
 *
 * Sent from backups@legendary.com.my, which needs no mailbox to send from;
 * replies go to `ALERT_REPLY_TO`. Never anything secret in the text. A
 * failure to send is logged and swallowed: an alert must never be the reason
 * a sign-in fails.
 */
import type { Env } from './env'

export const FROM = 'Legendary CRM backups <backups@legendary.com.my>'

export async function sendAlert(
  env: Pick<Env, 'RESEND_API_KEY' | 'ALERT_EMAILS' | 'ALERT_REPLY_TO'>,
  subject: string,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const to = (env.ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!to.length || !env.RESEND_API_KEY) return
  try {
    const r = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, ...(env.ALERT_REPLY_TO ? { reply_to: env.ALERT_REPLY_TO } : {}), subject, text }),
    })
    if (!r.ok) console.error(`Resend refused an alert: ${r.status}`)
  } catch (e) {
    console.error('Could not send an alert:', e instanceof Error ? e.message : e)
  }
}
