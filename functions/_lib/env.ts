/**
 * What the Backups page's server code is given by Cloudflare. Every value is
 * an encrypted setting on the Pages project's production environment, put
 * there by `scripts/backup-page-setup.mjs`; none is in this repository.
 */
export interface Env {
  /** Workers KV: `nightly/<stamp>` and `monthly/<day>` backups, and the guard's counters. */
  BACKUPS: KVNamespace
  /** hex HMAC-SHA-256, under BACKUP_SESSION_SECRET, of `password:<the page password>`. */
  BACKUP_PASSWORD_HMAC: string
  /** Signs sessions. Changing it signs everybody out. */
  BACKUP_SESSION_SECRET: string
  /** What every backup is encrypted with, handed to a signed-in browser to unlock one. */
  BACKUP_PASSPHRASE: string
  /** Resend, sending only, legendary.com.my only. */
  RESEND_API_KEY: string
  /** Comma-separated: who is told about sign-ins, lock-outs and missing nights. */
  ALERT_EMAILS: string
  /** Where a reply to an alert goes: backups@legendary.com.my has no mailbox. */
  ALERT_REPLY_TO: string
  /**
   * The nightly job's key, 64 hex characters: it can add a backup and do
   * nothing else. GitHub holds it in place of any Cloudflare key.
   */
  BACKUP_UPLOAD_KEY: string
}
