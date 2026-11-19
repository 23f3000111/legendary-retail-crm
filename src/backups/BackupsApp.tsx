/**
 * crm.legendary.com.my/backups — the CRM's backups, from any phone or
 * computer, behind one password (design, 19 November).
 *
 * Signing in buys an hour. The list comes from Cloudflare's copy of the
 * nightly backups. Opening one downloads it still encrypted, asks the server
 * for the key, and unlocks it here, in this tab: nothing unlocked is sent
 * anywhere or kept anywhere — no local storage, no cache — and the key lives
 * only in a variable for as long as the opening takes.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { strToU8, zipSync } from 'fflate'
import { Panel, PanelBody, PanelHeader, Rule } from '../components/ui/Panel'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { csvFiles, toCsv } from '../backup/csv'
import type { Table } from '../backup/tables'
import { fetchBackup, fetchKey, fileUrl, listBackups, signIn, SignedOut, type BackupEntry } from './api'
import { CannotUnlock, openBackup, type OpenedBackup } from './open'
import { formatMyt, hoursOld, visibleRows } from './view'

const PAGE = 200
const STALE_HOURS = 30

type Screen =
  | { at: 'checking' }
  | { at: 'not-here' }
  | { at: 'sign-in'; error?: string }
  | { at: 'list'; now: string; backups: BackupEntry[]; error?: string }
  | { at: 'opening'; entry: BackupEntry; stage: 'Downloading…' | 'Unlocking…' | 'Reading…' }
  | { at: 'opened'; entry: BackupEntry; backup: OpenedBackup }

const stampOf = (key: string) => key.split('/')[1] ?? key
const clockOf = (iso: string) => formatMyt(iso).split(', ')[1]
const megabytes = (n?: number) => (n ? `${(n / 1_048_576).toFixed(1)} MB` : '')
const rowsText = (n: number) => `${n.toLocaleString('en-MY')} ${n === 1 ? 'row' : 'rows'}`

/** Hands the browser a file to save. */
function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function BackupsApp() {
  const [screen, setScreen] = useState<Screen>({ at: 'checking' })

  const showList = async (error?: string) => {
    try {
      const result = await listBackups()
      if (result === 'not-here') return setScreen({ at: 'not-here' })
      if (result === 'signed-out') return setScreen({ at: 'sign-in' })
      setScreen({ at: 'list', ...result, error })
    } catch (e) {
      setScreen({ at: 'sign-in', error: e instanceof Error ? e.message : 'Something went wrong.' })
    }
  }

  useEffect(() => {
    void showList()
  }, [])

  const open = async (entry: BackupEntry) => {
    try {
      setScreen({ at: 'opening', entry, stage: 'Downloading…' })
      const bytes = await fetchBackup(entry.key)
      setScreen({ at: 'opening', entry, stage: 'Unlocking…' })
      const backup = await openBackup(bytes, await fetchKey())
      setScreen({ at: 'opening', entry, stage: 'Reading…' })
      setScreen({ at: 'opened', entry, backup })
    } catch (e) {
      if (e instanceof SignedOut) return setScreen({ at: 'sign-in', error: 'Your hour is up. Sign in again.' })
      void showList(e instanceof CannotUnlock ? e.message : e instanceof Error ? e.message : 'That backup did not open.')
    }
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center gap-3">
        <img src="../icon-perfume.png" alt="" className="h-9 w-9 rounded-full bg-grad-mark p-1 shadow-glow" />
        <div>
          <p className="eyebrow">Legendary</p>
          <h1 className="font-display text-[20px] font-semibold tracking-tight text-ink">CRM backups</h1>
        </div>
      </header>

      {screen.at === 'checking' && <p className="readout text-[12px] text-ink-3">Opening…</p>}

      {screen.at === 'not-here' && (
        <Notice tone="warn" icon="alert">
          Open this page at crm.legendary.com.my/backups.
        </Notice>
      )}

      {screen.at === 'sign-in' && <SignInForm error={screen.error} onIn={() => void showList()} />}

      {screen.at === 'list' && <BackupList screen={screen} onOpen={(e) => void open(e)} />}

      {screen.at === 'opening' && (
        <Panel>
          <PanelHeader title={`Taken ${screen.entry.takenAt ? formatMyt(screen.entry.takenAt) : stampOf(screen.entry.key)}`} />
          <Rule />
          <PanelBody>
            <p className="readout text-[13px] text-ink-2" aria-live="polite">
              {screen.stage}
            </p>
          </PanelBody>
        </Panel>
      )}

      {screen.at === 'opened' && (
        <Opened entry={screen.entry} backup={screen.backup} onBack={() => void showList()} />
      )}

      <footer className="mt-auto pt-4 text-[11.5px] leading-relaxed text-ink-3">
        A backup is unlocked on this device and never sent anywhere. Close the tab when you are done.
      </footer>
    </div>
  )
}

function SignInForm({ error, onIn }: { error?: string; onIn: () => void }) {
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | undefined>(error)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(undefined)
    try {
      const r = await signIn(password)
      if (r.ok) return onIn()
      setPassword('')
      if (r.status === 429 && r.until) {
        setProblem(
          r.lock === 'page'
            ? `The page is locked after too many wrong tries. Try again after ${clockOf(r.until)}.`
            : `Too many wrong tries. Try again after ${clockOf(r.until)}.`,
        )
      } else if (r.status === 503) setProblem('Sign-in is paused. Try again later.')
      else if (r.status === 400) setProblem('Type the backup password.')
      else if (r.status === 401) setProblem('That password is not right.')
      else setProblem(r.error)
    } catch {
      setProblem('No connection. Check the internet and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="max-w-md">
      <PanelHeader title="Sign in" meta="With the backup password. An hour later you sign in again." />
      <Rule />
      <PanelBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Backup password" error={problem}>
            <TextInput
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          <Button variant="primary" type="submit" disabled={busy || !password} icon="lock">
            Open
          </Button>
        </form>
      </PanelBody>
    </Panel>
  )
}

function BackupList({
  screen,
  onOpen,
}: {
  screen: Extract<Screen, { at: 'list' }>
  onOpen: (e: BackupEntry) => void
}) {
  const newest = screen.backups.find((b) => b.takenAt)
  const age = newest?.takenAt ? hoursOld(newest.takenAt, screen.now) : Infinity
  return (
    <div className="flex flex-col gap-4">
      {age > STALE_HOURS && (
        <Notice tone="warn" icon="alert">
          {Number.isFinite(age)
            ? `No backup has been taken for ${Math.floor(age)} hours. Check the backups repository on GitHub.`
            : 'There are no backups here yet. Check the backups repository on GitHub.'}
        </Notice>
      )}
      {screen.error && (
        <Notice tone="warn" icon="alert">
          {screen.error}
        </Notice>
      )}
      <Panel>
        <PanelHeader
          title="Backups"
          meta="Every night for 30 days, and the first of each month for good. Newest first."
        />
        <Rule />
        <ul className="divide-y divide-line">
          {screen.backups.map((b) => (
            <li key={b.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">
                  Taken {b.takenAt ? formatMyt(b.takenAt) : stampOf(b.key)}
                </p>
                <p className="readout text-[11.5px] text-ink-3">
                  {b.kind === 'monthly' ? 'Kept for good' : 'Nightly'}
                  {b.sizeBytes ? ` · ${megabytes(b.sizeBytes)}` : ''}
                  {b.counts?.docs ? ` · ${b.counts.docs.toLocaleString('en-MY')} records` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => onOpen(b)}>
                  Open
                </Button>
                <a href={fileUrl(b.key)} download>
                  <Button size="sm" icon="download" tabIndex={-1}>
                    Download the encrypted file
                  </Button>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function Opened({ entry, backup, onBack }: { entry: BackupEntry; backup: OpenedBackup; onBack: () => void }) {
  const [chosen, setChosen] = useState(backup.tables[0]?.name ?? '')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const table: Table | undefined = backup.tables.find((t) => t.name === chosen)
  const shown = useMemo(() => (table ? visibleRows(table, query, limit) : { rows: [], matched: 0 }), [table, query, limit])
  const stamp = stampOf(entry.key)

  const choose = (name: string) => {
    setChosen(name)
    setQuery('')
    setLimit(PAGE)
  }

  const downloadEverything = () => {
    const files = csvFiles(backup.tables)
    const zip = zipSync(Object.fromEntries([...files].map(([path, csv]) => [path, strToU8(csv)])))
    save(`legendary-crm-${stamp}-tables.zip`, zip, 'application/zip')
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title={`Taken ${entry.takenAt ? formatMyt(entry.takenAt) : stamp}`}
          meta={Object.entries(backup.counts)
            .map(([name, n]) => `${n.toLocaleString('en-MY')} ${name}`)
            .join(' · ')}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="download" onClick={downloadEverything}>
                Download everything
              </Button>
              <Button size="sm" variant="ghost" icon="chevronLeft" onClick={onBack}>
                Back to the list
              </Button>
            </div>
          }
        />
        <Rule />
        <PanelBody className="flex flex-wrap gap-2">
          {backup.tables.map((t) => (
            <Button key={t.name} size="sm" variant={t.name === chosen ? 'primary' : 'secondary'} onClick={() => choose(t.name)}>
              {t.name} · {t.rows.length.toLocaleString('en-MY')}
            </Button>
          ))}
        </PanelBody>
      </Panel>

      {table && (
        <Panel>
          <PanelHeader
            title={table.name}
            meta={
              query.trim()
                ? `${shown.matched.toLocaleString('en-MY')} of ${rowsText(table.rows.length)} match`
                : rowsText(table.rows.length)
            }
            action={
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  type="search"
                  placeholder="Search this table"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setLimit(PAGE)
                  }}
                  className="!h-8 !text-[12.5px] sm:!w-56"
                />
                <Button size="sm" icon="download" onClick={() => save(`${table.name}-${stamp}.csv`, toCsv(table), 'text/csv;charset=utf-8')}>
                  Download as spreadsheet
                </Button>
              </div>
            }
          />
          <Rule />
          <div className="scroll-panel overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2 font-medium text-ink-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((row, i) => (
                  <tr key={i} className="odd:bg-surface-2/50">
                    {row.map((cell, j) => (
                      <td key={j} className="max-w-[28rem] truncate whitespace-nowrap px-3 py-1.5 text-ink" title={cell === null ? '' : String(cell)}>
                        {cell === null ? '' : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.matched > shown.rows.length && (
            <PanelBody>
              <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                Load more ({(shown.matched - shown.rows.length).toLocaleString('en-MY')} left)
              </Button>
            </PanelBody>
          )}
        </Panel>
      )}
    </div>
  )
}
