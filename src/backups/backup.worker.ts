/**
 * The Backups page's worker: unlocks and reads a backup off the page's
 * thread, and keeps its tables (worker-core.ts). Started by client.ts.
 */
import { createCore, type Request } from './worker-core'

// Typed by hand: the project's lib is the DOM's, which a worker's lib would clash with.
const scope = self as unknown as {
  postMessage: (message: unknown, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<Request>) => void) | null
}

const core = createCore((reply, transfer) => scope.postMessage(reply, transfer ?? []))
scope.onmessage = (event) => {
  void core(event.data)
}
