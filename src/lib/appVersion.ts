/**
 * Which version of the app a page runs, and which is live (27 November).
 *
 * A page left open runs the version it opened with, however many have gone
 * live since: the app keeps its figures current every few seconds but never
 * loaded itself again. On 26 November KLIA T2 filed every product at 0 at
 * 23:01, six hours after the version that refuses it went live, from a phone
 * that had the app open since before. `NewVersion` uses these to notice a
 * new version and open it at the next change of page.
 *
 * A build names its main bundle by its content, `assets/main-<hash>.js`, in
 * `index.html`; another bundle there means another version.
 */
const MAIN = /assets\/main-[A-Za-z0-9_-]+\.js/

/** The main bundle a built page names, if it names one. */
export const bundleIn = (html: string): string | null => html.match(MAIN)?.[0] ?? null

/** The main bundle this page loaded, from its scripts' addresses; none while developing. */
export const runningBundle = (scriptSources: string[]): string | null => {
  for (const src of scriptSources) {
    const found = src.match(MAIN)?.[0]
    if (found) return found
  }
  return null
}

/** The live page's bundle, where it is another than the one running. */
export const newerBundle = (running: string | null, liveHtml: string): string | null => {
  if (!running) return null
  const live = bundleIn(liveHtml)
  return live && live !== running ? live : null
}
