/**
 * Sets up the Backups page (crm.legendary.com.my/backups/) and its copy of
 * the backups in Cloudflare, or changes its password.
 *
 *   node scripts/backup-page-setup.mjs --alert-emails a@x,b@y --reply-to a@x \
 *        --passphrase-file docs/backup-passphrase.txt [--dry-run]
 *   node scripts/backup-page-setup.mjs --rotate-password [--dry-run]
 *
 * Reads from the environment, or from `.env` in the current folder:
 *   CLOUDFLARE_API_TOKEN      the Pages token the deploy uses (Pages: Edit)
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_BACKUP_TOKEN   Workers KV Storage: Edit and Workers Scripts: Edit.
 *                             Stays on this machine: it makes the namespace and
 *                             deploys the morning check.
 *   CLOUDFLARE_KV_JOB_TOKEN   Workers KV Storage: Edit, nothing else. The only
 *                             Cloudflare key that leaves this machine: the
 *                             nightly job copies each backup with it.
 *   RESEND_API_KEY            the full-access key, to make a sending-only one
 *
 * The first form:
 *   1. finds or makes the KV namespace `legendary-crm-backups`;
 *   2. makes a Resend key that can only send, and only from legendary.com.my;
 *   3. makes the page password and a session secret;
 *   4. puts all of them, the backup passphrase and the alert list in the
 *      Pages project's encrypted production settings, with the KV binding;
 *   5. gives the encrypted backup repository the secrets its nightly job
 *      needs to copy each backup to KV;
 *   6. writes the page password to docs/backup-page-password.txt — move it to
 *      a password manager and delete the file.
 *
 * `--rotate-password` changes the password and signs everybody out; nothing
 * else. Both redeploy the CRM, since Cloudflare applies settings only to new
 * deployments, and then sign in with the new password to prove it took.
 *
 * Prints names, never values. `--dry-run` only reads.
 */
import { createHmac, randomBytes, randomInt } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PROJECT = 'legendary-crm'
const CRM_REPO = '23f3000111/legendary-retail-crm'
const SITE = 'https://crm.legendary.com.my'
const NAMESPACE = 'legendary-crm-backups'
const ENCRYPTED_REPO = '23f3000111/legendary-crm-backups'
const DOMAIN = 'legendary.com.my'
const PASSWORD_FILE = 'docs/backup-page-password.txt'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = flag('--dry-run')
const rotate = flag('--rotate-password')

const dotenv = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}
const env = (name) => {
  const v = process.env[name] ?? dotenv[name]
  if (!v) throw new Error(`${name} is not set (environment or .env).`)
  return v
}

const step = (what) => console.log(`${dryRun ? '[dry run] would ' : ''}${what}`)

async function cf(path, token, init = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body.success === false) {
    throw new Error(`Cloudflare ${init.method ?? 'GET'} ${path.split('?')[0]}: ${r.status} ${(body.errors ?? []).map((e) => e.message).join('; ')}`)
  }
  return body.result
}

async function resend(path, init = {}) {
  const r = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Resend ${init.method ?? 'GET'} ${path}: ${r.status} ${body.message ?? ''}`)
  return body
}

/** Four groups of four, from letters and digits nobody misreads: about 80 bits. */
const newPassword = () =>
  Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-')

/** What the page's server code compares a typed password against (functions/_lib/auth.ts). */
const passwordHmac = (secret, password) => createHmac('sha256', secret).update(`password:${password}`).digest('hex')

const secret = (v) => ({ type: 'secret_text', value: v })

async function setPagesSettings(envVars, kvNamespaceId) {
  const production = { env_vars: envVars, compatibility_date: '2025-01-01' }
  if (kvNamespaceId) production.kv_namespaces = { BACKUPS: { namespace_id: kvNamespaceId } }
  step(`set ${Object.keys(envVars).join(', ')}${kvNamespaceId ? ' and the BACKUPS binding' : ''} on Pages project ${PROJECT}`)
  if (dryRun) return
  await cf(`/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/pages/projects/${PROJECT}`, env('CLOUDFLARE_API_TOKEN'), {
    method: 'PATCH',
    body: JSON.stringify({ deployment_configs: { production } }),
  })
}

function writePassword(password) {
  step(`write the page password to ${PASSWORD_FILE}`)
  if (dryRun) return
  writeFileSync(
    PASSWORD_FILE,
    'The password for https://crm.legendary.com.my/backups/ (19 November design).\n' +
      'Put it in a password manager, give it to whoever should open backups, then delete this file.\n\n' +
      `${password}\n`,
    { mode: 0o600 },
  )
}

async function setup() {
  const alertEmails = value('--alert-emails')
  const replyTo = value('--reply-to')
  const passphraseFile = value('--passphrase-file')
  if (!alertEmails || !replyTo || !passphraseFile) {
    throw new Error('Give --alert-emails, --reply-to and --passphrase-file.')
  }
  const account = env('CLOUDFLARE_ACCOUNT_ID')
  const kvToken = env('CLOUDFLARE_BACKUP_TOKEN')
  // GitHub gets a key that can do one thing: write KV. Never the one that can
  // also deploy Workers (19 November security review).
  const jobToken = env('CLOUDFLARE_KV_JOB_TOKEN')
  if (jobToken === kvToken) {
    throw new Error('CLOUDFLARE_KV_JOB_TOKEN must be its own key, with Workers KV Storage: Edit and nothing else.')
  }

  // 1. The KV namespace.
  const namespaces = await cf(`/accounts/${account}/storage/kv/namespaces?per_page=100`, kvToken)
  let namespace = namespaces.find((n) => n.title === NAMESPACE)
  if (namespace) console.log(`KV namespace ${NAMESPACE} exists.`)
  else {
    step(`create KV namespace ${NAMESPACE}`)
    if (!dryRun) namespace = await cf(`/accounts/${account}/storage/kv/namespaces`, kvToken, {
      method: 'POST',
      body: JSON.stringify({ title: NAMESPACE }),
    })
  }

  // 2. A Resend key that can only send, and only from legendary.com.my.
  const domain = (await resend('/domains')).data.find((d) => d.name === DOMAIN)
  if (!domain || domain.status !== 'verified') throw new Error(`${DOMAIN} is not a verified Resend domain.`)
  step(`make a sending-only Resend key for ${DOMAIN}`)
  const sendingKey = dryRun
    ? 'dry-run'
    : (await resend('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'CRM backups page', permission: 'sending_access', domain_id: domain.id }),
      })).token

  // 3 and 4. The password, the secret, and every setting the page needs.
  const password = newPassword()
  const sessionSecret = randomBytes(32).toString('hex')
  const passphrase = readFileSync(passphraseFile, 'utf8').split(/\r?\n/).filter(Boolean).pop()
  await setPagesSettings(
    {
      BACKUP_PASSWORD_HMAC: secret(passwordHmac(sessionSecret, password)),
      BACKUP_SESSION_SECRET: secret(sessionSecret),
      BACKUP_PASSPHRASE: secret(passphrase),
      RESEND_API_KEY: secret(sendingKey),
      ALERT_EMAILS: secret(alertEmails),
      ALERT_REPLY_TO: secret(replyTo),
    },
    namespace?.id ?? 'dry-run',
  )

  // 5. What the encrypted backup's nightly job needs to copy each backup to KV.
  for (const [name, v] of [
    ['CF_KV_TOKEN', jobToken],
    ['CF_ACCOUNT_ID', account],
    ['CF_KV_NAMESPACE', namespace?.id ?? 'dry-run'],
  ]) {
    step(`set the secret ${name} on ${ENCRYPTED_REPO}`)
    if (!dryRun) execFileSync('gh', ['secret', 'set', name, '-R', ENCRYPTED_REPO], { input: v })
  }

  // 6.
  writePassword(password)
  console.log(`KV namespace id: ${namespace?.id ?? '(dry run)'} — workers/backup-watch/wrangler.toml needs it.`)
  await redeployAndConfirm(password)
}

/**
 * Cloudflare applies new settings only to new deployments, so nothing above
 * counts until the CRM is deployed again — the old password would keep
 * working (final review, 19 November). Deploys it, waits, and then signs in
 * with the new password to prove it took.
 */
async function redeployAndConfirm(password) {
  step("start the CRM's deploy and wait for it, so the new settings take effect")
  if (!dryRun) {
    const started = Date.now()
    execFileSync('gh', ['workflow', 'run', 'deploy.yml', '-R', CRM_REPO, '--ref', 'main'])
    let runId
    for (let i = 0; i < 30 && !runId; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const runs = JSON.parse(
        execFileSync('gh', ['run', 'list', '-R', CRM_REPO, '--workflow', 'deploy.yml', '--event', 'workflow_dispatch',
          '--limit', '1', '--json', 'databaseId,createdAt'], { encoding: 'utf8' }),
      )
      if (runs[0] && Date.parse(runs[0].createdAt) >= started - 5000) runId = runs[0].databaseId
    }
    if (!runId) throw new Error('The deploy did not start. Run the "Build and deploy" workflow by hand.')
    execFileSync('gh', ['run', 'watch', String(runId), '-R', CRM_REPO, '--exit-status'], { stdio: 'inherit' })
  }
  step(`sign in at ${SITE}/backups/ with the new password, to confirm it works`)
  if (!dryRun) {
    const r = await fetch(`${SITE}/api/backups/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (r.status !== 200) {
      throw new Error(`The new password was refused (${r.status}). The deploy may not have reached Cloudflare: check its log.`)
    }
    console.log('The new password works.')
  }
}

async function rotatePassword() {
  const password = newPassword()
  const sessionSecret = randomBytes(32).toString('hex')
  await setPagesSettings({
    BACKUP_PASSWORD_HMAC: secret(passwordHmac(sessionSecret, password)),
    BACKUP_SESSION_SECRET: secret(sessionSecret),
  })
  writePassword(password)
  await redeployAndConfirm(password)
}

try {
  await (rotate ? rotatePassword() : setup())
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
