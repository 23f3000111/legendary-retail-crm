/**
 * crm.legendary.com.my/backups — the CRM's backups, from any phone or
 * computer, behind one password (design, 19 November).
 *
 * Signing in buys an hour. The list comes from Cloudflare's copy of the
 * nightly backups. Opening one downloads it still encrypted, asks the server
 * for the key, and unlocks it here, in this tab — in a worker (client.ts),
 * so a phone's page never freezes while it does. Nothing unlocked is sent
 * anywhere or kept anywhere — no local storage, no cache — and the key lives
 * only for as long as the opening takes.
 */
import { memo, useEffect, useRef, useState, type FormEvent } from 'react'
import { Panel, PanelBody, PanelHeader, Rule } from '../components/ui/Panel'
import { Button, buttonClasses } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Icon } from '../components/ui/icons'
import { Notice } from '../components/ui/Notice'
import type { Cell } from '../backup/tables'
import { fetchBackup, fetchKey, fileUrl, listBackups, signIn, SignedOut, signOut, type BackupEntry } from './api'
import { BackupWorker, type Stage } from './client'
import { formatMyt, hoursOld } from './view'
import type { TableSummary } from './worker-core'

const PAGE = 200
const STALE_HOURS = 30

type Screen =
  | { at: 'checking' }
  | { at: 'not-here' }
  | { at: 'sign-in'; error?: string }
  | { at: 'list'; now: string; backups: BackupEntry[]; error?: string }
  | { at: 'opening'; entry: BackupEntry; stage: 'Downloading…' | Stage }
  | { at: 'opened'; entry: BackupEntry; worker: BackupWorker; counts: Record<string, number>; tables: TableSummary[] }

const stampOf = (key: string) => key.split('/')[1] ?? key
const clockOf = (iso: string) => formatMyt(iso).split(', ')[1]
const megabytes = (n?: number) => (n ? `${(n / 1_048_576).toFixed(1)} MB` : '')
const rowsText = (n: number) => `${n.toLocaleString('en-MY')} ${n === 1 ? 'row' : 'rows'}`
const messageOf = (e: unknown, otherwise: string) => (e instanceof Error ? e.message : otherwise)

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
  // The open backup's worker, and a count that moves on whenever the page lets
  // go of it, so an opening that finishes after a sign-out is dropped.
  const worker = useRef<BackupWorker | undefined>(undefined)
  const turn = useRef(0)

  const letGo = () => {
    turn.current++
    worker.current?.close()
    worker.current = undefined
  }

  const showList = async (error?: string) => {
    letGo()
    try {
      const result = await listBackups()
      if (result === 'not-here') return setScreen({ at: 'not-here' })
      if (result === 'signed-out') return setScreen({ at: 'sign-in' })
      setScreen({ at: 'list', ...result, error })
    } catch (e) {
      setScreen({ at: 'sign-in', error: messageOf(e, 'Something went wrong.') })
    }
  }

  useEffect(() => {
    void showList()
  }, [])

  const open = async (entry: BackupEntry) => {
    letGo()
    const mine = turn.current
    const stillMine = () => turn.current === mine
    try {
      setScreen({ at: 'opening', entry, stage: 'Downloading…' })
      const encrypted = await fetchBackup(entry.key)
      const passphrase = await fetchKey()
      if (!stillMine()) return
      const opening = (worker.current = new BackupWorker())
      const { counts, tables } = await opening.open(encrypted, passphrase, (stage) => {
        if (stillMine()) setScreen({ at: 'opening', entry, stage })
      })
      if (stillMine()) setScreen({ at: 'opened', entry, worker: opening, counts, tables })
    } catch (e) {
      if (!stillMine()) return
      if (e instanceof SignedOut) {
        letGo()
        return setScreen({ at: 'sign-in', error: 'Your hour is up. Sign in again.' })
      }
      void showList(messageOf(e, 'That backup did not open.'))
    }
  }

  const leave = () => {
    letGo()
    void signOut().finally(() => setScreen({ at: 'sign-in' }))
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center gap-3">
        <img src="../icon-perfume.png" alt="" className="h-9 w-9 rounded-full bg-grad-mark p-1 shadow-glow" />
        <div className="flex-1">
          <p className="eyebrow">Legendary</p>
          <h1 className="font-display text-[20px] font-semibold tracking-tight text-ink">CRM backups</h1>
        </div>
        {(screen.at === 'list' || screen.at === 'opened' || screen.at === 'opening') && (
          <Button size="sm" variant="ghost" icon="logout" onClick={leave}>
            Sign out
          </Button>
        )}
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
        <Opened
          entry={screen.entry}
          worker={screen.worker}
          counts={screen.counts}
          tables={screen.tables}
          onBack={() => void showList()}
        />
      )}

      <footer className="mt-auto pt-4 text-[11.5px] leading-relaxed text-ink-3">
        A backup is unlocked on this device and never sent anywhere. Sign out when you are done.
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
      <PanelHeader title="Sign in" meta="With the backup password. After an hour, or once the browser closes, you sign in again." />
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
                {/* A link, not a button inside one: Firefox follows no link that holds a button. */}
                <a href={fileUrl(b.key)} download className={buttonClasses('secondary', 'sm')}>
                  <Icon name="download" className="h-4 w-4 shrink-0" />
                  Download the encrypted file
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

/**
 * One page of rows, drawn again only when the rows change — not on every key
 * pressed in the search, which cost a phone ~0.1 s a key for 200 rows of 16
 * columns.
 */
const RowsTable = memo(function RowsTable({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  return (
    <div className="scroll-panel overflow-x-auto">
      <table className="min-w-full text-left text-[12px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2 font-medium text-ink-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
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
  )
})

/** One page of one table's rows, and the search that found them. */
interface Shown {
  table: string
  query: string
  rows: Cell[][]
  matched: number
}

function Opened({
  entry,
  worker,
  counts,
  tables,
  onBack,
}: {
  entry: BackupEntry
  worker: BackupWorker
  counts: Record<string, number>
  tables: TableSummary[]
  onBack: () => void
}) {
  const [chosen, setChosen] = useState(tables[0]?.name ?? '')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [shown, setShown] = useState<Shown | undefined>()
  const [busy, setBusy] = useState<'zip' | 'csv' | undefined>()
  const [problem, setProblem] = useState<string | undefined>()
  const table = tables.find((t) => t.name === chosen)
  const stamp = stampOf(entry.key)

  // The worker searches; the page draws the page of rows it sends back. Only
  // the answer to the latest search is drawn.
  useEffect(() => {
    if (!chosen) return
    let wanted = true
    worker.rows(chosen, query, limit).then(
      (r) => wanted && setShown({ table: chosen, query, ...r }),
      (e) => wanted && setProblem(messageOf(e, 'Those rows did not load.')),
    )
    return () => {
      wanted = false
    }
  }, [worker, chosen, query, limit])

  const choose = (name: string) => {
    setChosen(name)
    setQuery('')
    setLimit(PAGE)
  }

  const download = async (what: 'zip' | 'csv') => {
    if (busy) return
    setBusy(what)
    setProblem(undefined)
    try {
      if (what === 'zip') save(`legendary-crm-${stamp}-tables.zip`, await worker.zip(), 'application/zip')
      else if (table) save(`${table.name}-${stamp}.csv`, await worker.csv(table.name), 'text/csv;charset=utf-8')
    } catch (e) {
      setProblem(messageOf(e, 'That download did not work.'))
    } finally {
      setBusy(undefined)
    }
  }

  const page = shown && shown.table === chosen ? shown : undefined

  return (
    <div className="flex flex-col gap-4">
      {problem && (
        <Notice tone="warn" icon="alert">
          {problem}
        </Notice>
      )}
      <Panel>
        <PanelHeader
          title={`Taken ${entry.takenAt ? formatMyt(entry.takenAt) : stamp}`}
          meta={Object.entries(counts)
            .map(([name, n]) => `${n.toLocaleString('en-MY')} ${name}`)
            .join(' · ')}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="download" disabled={busy !== undefined} onClick={() => void download('zip')}>
                {busy === 'zip' ? 'Preparing…' : 'Download everything'}
              </Button>
              <Button size="sm" variant="ghost" icon="chevronLeft" onClick={onBack}>
                Back to the list
              </Button>
            </div>
          }
        />
        <Rule />
        <PanelBody className="flex flex-wrap gap-2">
          {tables.map((t) => (
            <Button key={t.name} size="sm" variant={t.name === chosen ? 'primary' : 'secondary'} onClick={() => choose(t.name)}>
              {t.name} · {t.rowCount.toLocaleString('en-MY')}
            </Button>
          ))}
        </PanelBody>
      </Panel>

      {table && (
        <Panel>
          <PanelHeader
            title={table.name}
            meta={
              page && page.query.trim()
                ? `${page.matched.toLocaleString('en-MY')} of ${rowsText(table.rowCount)} match`
                : rowsText(table.rowCount)
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
                <Button size="sm" icon="download" disabled={busy !== undefined} onClick={() => void download('csv')}>
                  {busy === 'csv' ? 'Preparing…' : 'Download as spreadsheet'}
                </Button>
              </div>
            }
          />
          <Rule />
          {page ? (
            <RowsTable columns={table.columns} rows={page.rows} />
          ) : (
            <PanelBody>
              <p className="readout text-[12px] text-ink-3">Loading…</p>
            </PanelBody>
          )}
          {page && page.matched > page.rows.length && (
            <PanelBody>
              <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                Load more ({(page.matched - page.rows.length).toLocaleString('en-MY')} left)
              </Button>
            </PanelBody>
          )}
        </Panel>
      )}
    </div>
  )
}
