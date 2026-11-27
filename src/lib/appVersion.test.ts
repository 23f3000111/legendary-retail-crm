import { describe, expect, it } from 'vitest'
import { bundleIn, newerBundle, runningBundle } from './appVersion'

/**
 * 26 November: KLIA T2 filed every product at 0 at 23:01, six hours after the
 * version that refuses it went live. Its phone had the app open from before,
 * and the app never loaded itself again: a page left open runs the version it
 * opened with. These say which version a page runs, and which is live.
 */

const built = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <script type="module" crossorigin src="./assets/main-BWpPAUsU.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/index-v3NrMTzF.js">
    <link rel="stylesheet" crossorigin href="./assets/index-C-0638fi.css">
  </head>
  <body><div id="root"></div></body>
</html>`

describe('which version of the app', () => {
  it('a built page names: its main bundle, not the shared chunks or the Backups page', () => {
    expect(bundleIn(built)).toBe('assets/main-BWpPAUsU.js')
    expect(bundleIn('<script type="module" src="./assets/backups-CUIC9Not.js"></script>')).toBeNull()
    expect(bundleIn('')).toBeNull()
  })

  it('this page is running, from the scripts it loaded; none while developing', () => {
    expect(runningBundle(['https://crm.legendary.com.my/assets/main-BWpPAUsU.js'])).toBe('assets/main-BWpPAUsU.js')
    expect(runningBundle(['https://23f3000111.github.io/legendary-retail-crm/assets/main-BWpPAUsU.js'])).toBe(
      'assets/main-BWpPAUsU.js',
    )
    expect(runningBundle(['http://localhost:5180/src/main.tsx', ''])).toBeNull()
  })

  it('is newer, once the live page names another bundle than the one running', () => {
    expect(newerBundle('assets/main-BWpPAUsU.js', built.replace('BWpPAUsU', 'Q9xYz12a'))).toBe('assets/main-Q9xYz12a.js')
    expect(newerBundle('assets/main-BWpPAUsU.js', built)).toBeNull()
    // Nothing to compare: while developing, or a page that did not come back whole.
    expect(newerBundle(null, built)).toBeNull()
    expect(newerBundle('assets/main-BWpPAUsU.js', '<html>Service unavailable</html>')).toBeNull()
  })
})
