/**
 * The page's side of the worker (backup.worker.ts): one per opened backup,
 * closed when the page goes back to the list or signs out, which also drops
 * the unlocked tables from memory.
 */
import type { Cell } from '../backup/tables'
import type { Reply, Request, TableSummary } from './worker-core'

export type Stage = Extract<Reply, { kind: 'stage' }>['stage']

/** A request as the page asks it: the client numbers them. */
type WithoutId<R> = R extends unknown ? Omit<R, 'id'> : never

const GAVE_UP = 'This device could not open the backup. Try again, or try a computer.'

interface Waiting {
  resolve: (reply: Reply) => void
  reject: (error: Error) => void
  onStage?: (stage: Stage) => void
}

export class BackupWorker {
  private readonly worker: Worker
  private next = 1
  private readonly pending = new Map<number, Waiting>()

  constructor() {
    this.worker = new Worker(new URL('./backup.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data
      const waiting = this.pending.get(reply.id)
      if (!waiting) return
      if (reply.kind === 'stage') return waiting.onStage?.(reply.stage)
      this.pending.delete(reply.id)
      if (reply.kind === 'error') waiting.reject(new Error(reply.message))
      else waiting.resolve(reply)
    }
    // A worker that cannot start, or dies part-way (a phone short of memory),
    // never answers: say so, rather than leave the page waiting for ever.
    this.worker.onerror = (event: ErrorEvent) => {
      event.preventDefault()
      for (const waiting of this.pending.values()) waiting.reject(new Error(GAVE_UP))
      this.pending.clear()
    }
  }

  private ask<K extends Reply['kind']>(
    request: WithoutId<Request>,
    transfer: Transferable[] = [],
    onStage?: (stage: Stage) => void,
  ): Promise<Extract<Reply, { kind: K }>> {
    const id = this.next++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (r) => resolve(r as Extract<Reply, { kind: K }>), reject, onStage })
      this.worker.postMessage({ ...request, id }, transfer)
    })
  }

  /** Unlocks and reads the backup there. The bytes are handed over, not copied. */
  async open(
    encrypted: Uint8Array,
    passphrase: string,
    onStage: (stage: Stage) => void,
  ): Promise<{ counts: Record<string, number>; tables: TableSummary[] }> {
    const { counts, tables } = await this.ask<'opened'>({ kind: 'open', encrypted, passphrase }, [encrypted.buffer], onStage)
    return { counts, tables }
  }

  /** One page of a table's rows that contain `query`, and how many matched. */
  async rows(table: string, query: string, limit: number): Promise<{ rows: Cell[][]; matched: number }> {
    const { rows, matched } = await this.ask<'rows'>({ kind: 'rows', table, query, limit })
    return { rows, matched }
  }

  async csv(table: string): Promise<string> {
    return (await this.ask<'csv'>({ kind: 'csv', table })).csv
  }

  async zip(): Promise<Uint8Array<ArrayBuffer>> {
    return (await this.ask<'zip'>({ kind: 'zip' })).zip
  }

  close() {
    this.worker.terminate()
    this.pending.clear()
  }
}
