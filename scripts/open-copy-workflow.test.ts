/**
 * The open copy's nightly job (ops/open-copy, which runs in
 * legendary-crm-data): where each night is kept, and that one copy failing
 * never costs the other (19 November).
 */
import { describe, expect, it } from 'vitest'
import workflowAsSaved from '../ops/open-copy/.github/workflows/nightly-open-copy.yml?raw'

// A Windows checkout saves it with CRLF.
const workflow = workflowAsSaved.replace(/\r\n/g, '\n')

interface Step {
  name: string
  text: string
}

/** The job's steps, each with its own lines. */
const steps: Step[] = workflow
  .slice(workflow.indexOf('\n    steps:\n'))
  .split(/\n(?=      - )/)
  .slice(1)
  .map((text) => ({ name: (/name: (.+)/.exec(text) ?? /uses: (.+)/.exec(text))?.[1] ?? '?', text }))

const code = (s: Step) => s.text.replace(/#.*$/gm, '')
const step = (name: string) => {
  const s = steps.find((x) => x.name === name)
  expect(s, name).toBeDefined()
  return s!
}

describe('the open copy’s nightly job', () => {
  it('keeps every night’s dump for good, as a file on that month’s release, not as an artifact GitHub deletes', () => {
    // Artifacts share the free plan's 500 MB with the encrypted job's; release
    // files have no total limit (19 November).
    expect(workflow).not.toMatch(/upload-artifact|retention-days/)
    const keep = code(step('Keep the nightly one'))
    expect(keep).toMatch(/tag="nightly-\$\{STAMP:0:7\}"/)
    expect(keep).toMatch(/gh release upload "\$tag" "\$NAME\.tar\.gz" -R "\$GITHUB_REPOSITORY" --clobber/)
    expect(keep).toMatch(/gh release create "\$tag" "\$NAME\.tar\.gz" -R "\$GITHUB_REPOSITORY"[\s\S]*--latest=false/)
  })

  it('keeps the dump even when the tables could not be written or pushed', () => {
    // Final review M5: a failure in the tables used to lose that night's dump too.
    expect(step('Add the logins without their passwords').text).toMatch(/id: logins/)
    expect(step('Pack the dump').text).toMatch(/id: pack/)
    expect(step('Pack the dump').text).toMatch(/if: \$\{\{ !cancelled\(\) && steps\.logins\.outcome == 'success' \}\}/)
    for (const name of ['Keep the nightly one', 'Keep the monthly one']) {
      expect(step(name).text, name).toMatch(/if: \$\{\{ !cancelled\(\) && steps\.pack\.outcome == 'success' \}\}/)
    }
  })

  it('gives GitHub’s token only to the steps that push, and the database login only to the step that reads the server', () => {
    expect(steps.filter((s) => /github\.token/.test(code(s))).map((s) => s.name)).toEqual([
      'Commit them',
      'Keep the nightly one',
      'Keep the monthly one',
    ])
    expect(steps.filter((s) => /secrets\./.test(code(s))).map((s) => s.name)).toEqual(['Take the copy'])
  })
})
