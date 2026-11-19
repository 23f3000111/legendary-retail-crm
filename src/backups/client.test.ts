import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reply, Request } from './worker-core'
import { BackupWorker } from './client'

/** Stands in for the browser's Worker, which Node lacks: keeps what the page posts, and lets a test answer. */
class FakeWorker {
  static last: FakeWorker
  onmessage: ((event: { data: Reply }) => void) | null = null
  onerror: ((event: { preventDefault: () => void }) => void) | null = null
  posted: { message: Request; transfer: Transferable[] }[] = []
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(message: Request, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer })
  }
  terminate() {
    this.terminated = true
  }
  answer(reply: Reply) {
    this.onmessage?.({ data: reply })
  }
}

/** The promise, or 'still waiting' if it has not settled in a moment. */
const within = <T,>(p: Promise<T>, ms = 50) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('still waiting')), ms))])

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
})

describe('the page’s side of the worker', () => {
  it('hands the encrypted bytes over without copying them, passes the stages on, and resolves with the tables', async () => {
    const worker = new BackupWorker()
    const fake = FakeWorker.last
    const stages: string[] = []
    const encrypted = new Uint8Array([1, 2, 3])
    const opening = worker.open(encrypted, 'the-passphrase', (stage) => stages.push(stage))

    expect(fake.posted).toEqual([
      { message: { id: 1, kind: 'open', encrypted, passphrase: 'the-passphrase' }, transfer: [encrypted.buffer] },
    ])
    fake.answer({ id: 1, kind: 'stage', stage: 'Unlocking…' })
    fake.answer({ id: 1, kind: 'stage', stage: 'Reading…' })
    const tables = [{ name: 'outlets', columns: ['id'], rowCount: 1 }]
    fake.answer({ id: 1, kind: 'opened', counts: { docs: 3 }, tables })

    await expect(within(opening)).resolves.toEqual({ counts: { docs: 3 }, tables })
    expect(stages).toEqual(['Unlocking…', 'Reading…'])
  })

  it('matches each answer to its question, whatever order the answers come in', async () => {
    const worker = new BackupWorker()
    const fake = FakeWorker.last
    const rows = worker.rows('outlets', 'klia', 200)
    const csv = worker.csv('outlets')
    const zip = worker.zip()

    expect(fake.posted.map((p) => p.message)).toEqual([
      { id: 1, kind: 'rows', table: 'outlets', query: 'klia', limit: 200 },
      { id: 2, kind: 'csv', table: 'outlets' },
      { id: 3, kind: 'zip' },
    ])
    fake.answer({ id: 3, kind: 'zip', zip: new Uint8Array([80, 75]) })
    fake.answer({ id: 2, kind: 'csv', csv: 'id\r\nklia-t2\r\n' })
    fake.answer({ id: 1, kind: 'rows', rows: [['klia-t2']], matched: 1 })

    await expect(within(rows)).resolves.toEqual({ rows: [['klia-t2']], matched: 1 })
    await expect(within(csv)).resolves.toBe('id\r\nklia-t2\r\n')
    await expect(within(zip)).resolves.toEqual(new Uint8Array([80, 75]))
  })

  it('throws what the worker says went wrong', async () => {
    const worker = new BackupWorker()
    const opening = worker.open(new Uint8Array(1), 'not-it', () => {})
    FakeWorker.last.answer({ id: 1, kind: 'error', message: "This backup can't be unlocked with the key the page holds." })

    await expect(within(opening)).rejects.toThrow("This backup can't be unlocked with the key the page holds.")
  })

  it('gives up, in words the page can show, when the worker cannot start or dies part-way', async () => {
    const worker = new BackupWorker()
    const fake = FakeWorker.last
    const opening = worker.open(new Uint8Array(1), 'the-passphrase', () => {})
    const rows = worker.rows('outlets', '', 200)
    const preventDefault = vi.fn()
    fake.onerror?.({ preventDefault })

    await expect(within(opening)).rejects.toThrow('This device could not open the backup. Try again, or try a computer.')
    await expect(within(rows)).rejects.toThrow('This device could not open the backup.')
    expect(preventDefault).toHaveBeenCalled()
  })

  it('stops the worker when closed, which drops the unlocked tables', () => {
    const worker = new BackupWorker()
    worker.close()
    expect(FakeWorker.last.terminated).toBe(true)
  })
})
