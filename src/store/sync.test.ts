import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useData, useLastSync } from './useData'
import { settle, signInAs, startFixture } from './testing'
import { useBackendForTests } from '../api'
import { figuresOf } from '../lib/changes'
import { addDays } from '../lib/dates'
import { setSession } from '../lib/session'
import { DEMO_TODAY } from '../data/seed'
import type { LocalBackend } from '../api/local'
import type { Backend, PutDoc, Snapshot } from '../api/backend'
import type { Closing, SaleLine } from '../data/types'

/**
 * What a load carries, and what a poll redraws (16 November).
 *
 * Every device used to be sent every document since the first day, and to
 * draw every screen again every twenty seconds whether anything had changed
 * or not. Head office's load had grown to 20,000 documents, most of them sale
 * lines a filed closing already carries; two people opening the CRM at once
 * ran past the three seconds the server allows a call, and both were turned
 * away. These hold the load to what a screen reads, and a quiet poll to no
 * work at all.
 */

let lb: LocalBackend
const today = DEMO_TODAY
/** Filed at KLIA T2 in the sample history, like every day before today. */
const yesterday = addDays(today, -1)
/** Long before the sample history begins, so nothing was filed for it. */
const unfiled = addDays(today, -200)

const saleLine = (id: string, day: string): PutDoc => {
  const doc: SaleLine = { id, saleId: `sale-${id}`, skuId: 'orchid-retail', qty: 1, priceTier: 'promotion', unitPriceMYR: 188, day, locationId: 'klia-t2' }
  return { kind: 'sale_line', id, locationId: 'klia-t2', day, doc }
}
const saleLineIds = (docs: { kind: string; id: string }[]) =>
  docs.filter((d) => d.kind === 'sale_line').map((d) => d.id)
const backendDoc = <T,>(kind: string, id: string): T | undefined =>
  lb.allDocs().find((d) => d.kind === kind && d.id === id && !d.deleted)?.doc as T | undefined
const closing = (id: string): Closing => {
  const c = useData.getState().closings.find((x) => x.id === id)
  if (!c) throw new Error(`no closing ${id}`)
  return c
}

beforeEach(() => {
  lb = startFixture('davy')
})

describe('a full load', () => {
  it('leaves out the sale lines of a filed day — its closing carries them', () => {
    const store = lb.openSessionForTests('teokoknian', 'klia-t2')
    const put = lb.putSync(store, [saleLine('l-today', today), saleLine('l-filed', yesterday), saleLine('l-unfiled', unfiled)])
    expect(put.ok).toBe(true)

    const sent = saleLineIds(lb.loadSync(store).docs)
    expect(sent).toContain('l-today')
    expect(sent).toContain('l-unfiled')
    expect(sent).not.toContain('l-filed')

    // Head office is sent the same, and the counter and the missed night still read.
    const hq = lb.openSessionForTests('kelly')
    expect(saleLineIds(lb.loadSync(hq).docs)).not.toContain('l-filed')
    signInAs(lb, 'teokoknian', 'klia-t2')
    expect(useData.getState().liveLines['klia-t2'].map((l) => l.id)).toContain('l-today')
    expect(useData.getState().unfiledLines['klia-t2'][unfiled].map((l) => l.id)).toEqual(['l-unfiled'])
  })

  it('still sends a filed day’s line when it changes, on the next look', () => {
    const store = lb.openSessionForTests('teokoknian', 'klia-t2')
    const before = new Date(Date.now() - 1000).toISOString()
    lb.putSync(store, [saleLine('l-filed', yesterday)])
    expect(saleLineIds(lb.loadSync(store, before).docs)).toContain('l-filed')
  })

  it('sends today’s lines even once today is filed', () => {
    // Today's KLIA closing is in the sample; the counter still lists the sales.
    expect(useData.getState().closings.some((c) => c.id === `klia-t2-${today}`)).toBe(true)
    const store = lb.openSessionForTests('teokoknian', 'klia-t2')
    lb.putSync(store, [saleLine('l-today', today)])
    expect(saleLineIds(lb.loadSync(store).docs)).toContain('l-today')
  })
})

describe('Kelly changing an earlier day’s closing', () => {
  it('takes a line she removes off the sale records too, though her screen never loaded them', async () => {
    // Yesterday at KLIA T2, filed with two sales whose records are on the server.
    const a = saleLine('l-kept', yesterday)
    const b = saleLine('l-removed', yesterday)
    expect(lb.putSync(lb.openSessionForTests('teokoknian', 'klia-t2'), [a, b]).ok).toBe(true)
    const was = closing(`klia-t2-${yesterday}`)
    const filed: Closing = { ...was, lines: [a.doc as SaleLine, b.doc as SaleLine], revenueMYR: 376 }
    expect(
      lb.putSync(lb.openSessionForTests('davy'), [
        { kind: 'closing', id: filed.id, locationId: 'klia-t2', day: yesterday, doc: filed },
      ]).ok,
    ).toBe(true)

    signInAs(lb, 'kelly')
    expect(saleLineIds(lb.loadSync(lb.openSessionForTests('kelly')).docs)).not.toContain('l-removed')
    const result = useData.getState().editClosing({
      closingId: filed.id,
      figures: { ...figuresOf(closing(filed.id)), lines: [a.doc as SaleLine], revenueMYR: 188 },
    })
    expect(result.ok).toBe(true)
    await settle()

    expect(backendDoc('sale_line', 'l-removed')).toBeUndefined()
    expect(backendDoc<SaleLine>('sale_line', 'l-kept')?.qty).toBe(1)
  })
})

describe('a poll', () => {
  const quiet = (now: string, day = useData.getState().today) =>
    useData.getState().applySnapshot({ people: null, docs: [], now, today: day }, false)

  it('that brings nothing new redraws nothing, and still says when it looked', () => {
    const before = useData.getState()
    let redraws = 0
    const stop = useData.subscribe(() => redraws++)
    quiet('2026-08-21T03:00:20.000Z')
    stop()

    expect(redraws).toBe(0)
    expect(useData.getState()).toBe(before)
    expect(useLastSync.getState().at).toBe('2026-08-21T03:00:20.000Z')
  })

  it('that brings a change redraws, with the change in it', () => {
    const line = saleLine('l-poll', today)
    let redraws = 0
    const stop = useData.subscribe(() => redraws++)
    useData.getState().applySnapshot(
      {
        people: null,
        docs: [{ ...line, updatedAt: '2026-08-21T03:00:40.000Z' }],
        now: '2026-08-21T03:00:41.000Z',
        today,
      },
      false,
    )
    stop()

    expect(redraws).toBe(1)
    expect(useData.getState().liveLines['klia-t2'].map((l) => l.id)).toContain('l-poll')
  })

  it('that comes back after a lost connection turns the light green again', () => {
    useData.setState({ syncStatus: 'offline' })
    quiet('2026-08-21T03:01:00.000Z')
    expect(useData.getState().syncStatus).toBe('ready')
  })

  it('on a new day moves the day on, though nothing else changed', () => {
    const tomorrow = addDays(today, 1)
    quiet('2026-08-21T16:00:05.000Z', tomorrow)
    expect(useData.getState().today).toBe(tomorrow)
  })

  it('forgets when it looked on signing out', () => {
    quiet('2026-08-21T03:02:00.000Z')
    useData.getState().clearSession()
    expect(useLastSync.getState().at).toBeNull()
  })
})

describe('another device’s write', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not send a device whose first load failed back to the server with everyone else', async () => {
    // startSync listens for focus; the tests have no browser.
    const listeners = { addEventListener: () => {}, removeEventListener: () => {} }
    vi.stubGlobal('document', { ...listeners, visibilityState: 'visible' })
    vi.stubGlobal('window', listeners)

    let signal = () => {}
    let busy = true
    const asked: (string | undefined)[] = []
    const server = {
      mode: 'live',
      onChange: (l: () => void) => {
        signal = l
        return () => {}
      },
      notify: () => {},
      load: async (_token: string, since?: string): Promise<Snapshot> => {
        asked.push(since)
        if (busy) throw new Error('canceling statement due to statement timeout')
        return { people: [], docs: [], now: new Date().toISOString(), today }
      },
    }
    useBackendForTests(server as unknown as Backend)
    useData.getState().clearSession()
    setSession({ token: 'kelly-phone', personId: 'kelly' })

    const stop = useData.getState().startSync()
    await settle()
    expect(useData.getState().syncStatus).toBe('offline')

    // Every device hears a sale at another store at the same moment. One
    // still waiting for its first load does not go back on it.
    signal()
    signal()
    await settle()
    expect(asked).toEqual([undefined])

    // The timer, or the tab coming back to the front, tries again; once that
    // lands, the signal fetches only what changed.
    busy = false
    await useData.getState().sync()
    expect(useData.getState().syncStatus).toBe('ready')
    signal()
    await settle()
    expect(asked).toHaveLength(3)
    expect(asked[2]).toEqual(expect.any(String))
    stop()
  })
})
