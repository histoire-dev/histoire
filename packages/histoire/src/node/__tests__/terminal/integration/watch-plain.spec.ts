/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { startBodyMarker } from '../../utils/terminal/body-marker.js'
import { TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'
import { createWatchProject, helperSource } from '../../utils/terminal/watch-project.js'

// Boundary: the real built CLI with `--no-tui --test-watch`, a real project-Vitest browser run behind
// it, and an HTTP endpoint every test body reports to (story and variant), so the tests know exactly
// what ran and when. Expected counts come from the fixture: stories a (2 variants, assertion failing
// until helper-a is corrected), b, c, one test each. Defects: a run started by edits to an unrelated
// helper, a successor before the stale run was cleaned up, edits lost or run twice, runs caused by the
// run's own output, a run after `stop`, input required for `--test-watch`.

const cleanup: (() => Promise<unknown>)[] = []
let marker: Awaited<ReturnType<typeof startBodyMarker>>
let project: Awaited<ReturnType<typeof createWatchProject>>
beforeAll(async () => {
  marker = await startBodyMarker()
  project = await createWatchProject(marker.url)
})
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close().catch(() => {})
})
afterAll(async () => {
  marker?.close()
  await project?.close()
})

/** Stories that reported in since `from` (the marker keeps the whole history). */
const reported = (from: number) => marker.urls().slice(from).map(url => /story=(\w+)/.exec(url)![1]).sort()

it.skipIf(process.platform !== 'linux')('plain --test-watch runs the book unattended, reruns only affected stories on edits, coalesces held edits, and stops for good', async () => {
  // No input is ever written before the first run: the flag alone starts watching.
  const cli = startPty({ args: [...TERMINAL_DEV_ARGS, '--no-tui', '--test-watch'], cwd: project.root, columns: 120, rows: 36 })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]

  // Initial run: whole book, once. Story a fails (helper expects 'wrong'), b and c pass.
  await cli.waitFor(/Watch: running all stories/)
  await cli.waitFor(/Finished with problems · 4 tests · 2 passed · 2 failed · 0 skipped/, { timeout: 180_000 })
  await cli.waitFor(/Watch: waiting for changes in all stories/)
  expect(reported(0)).toEqual(['a', 'a', 'b', 'c'])

  // Assertion-only dependency edit: story metadata untouched, only story a reruns, fail becomes pass.
  let mark = cli.mark()
  let seen = marker.urls().length
  await writeFile(resolve(project.root, 'helper-a.ts'), helperSource('a', 1))
  await cli.waitFor(/Passed · 2 tests · 2 passed · 0 failed · 0 skipped/, { from: mark, timeout: 180_000 })
  await cli.waitFor(/Watch: waiting for changes/, { from: mark })
  expect(reported(seen)).toEqual(['a', 'a'])

  // The run's own output and cache writes never trigger another run.
  seen = marker.urls().length
  await new Promise(done => setTimeout(done, 8000))
  expect(marker.urls().length).toBe(seen)

  // Held run of a; edit b meanwhile. The stale run is cancelled and cleaned up, then one successor runs a and b (never c).
  marker.hold()
  mark = cli.mark()
  seen = marker.urls().length
  const entered = marker.next()
  await writeFile(resolve(project.root, 'helper-a.ts'), helperSource('a', 2))
  await entered
  await writeFile(resolve(project.root, 'helper-b.ts'), helperSource('b', 1))
  await cli.waitFor(/Cancelled after cleanup/, { from: mark, timeout: 60_000 })
  await cli.waitFor(/Watch: running 2 affected stories/, { from: mark })
  marker.release()
  await cli.waitFor(/Passed · 3 tests · 3 passed · 0 failed · 0 skipped/, { from: mark, timeout: 180_000 })
  await cli.waitFor(/Watch: waiting for changes/, { from: mark })
  // Held: a (first variant, cancelled), then the successor ran a (2 variants) and b. c never ran.
  expect(reported(seen)).toContain('b')
  expect(reported(seen)).not.toContain('c')
  expect(cli.text(mark).match(/Passed · 3 tests/g)).toHaveLength(1)
  expect(cli.text(mark).match(/Cancelled after cleanup/g)).toHaveLength(1)

  // Stop during a held run: watching ends first, the late completion cannot reschedule anything.
  marker.hold()
  mark = cli.mark()
  const held = marker.next()
  await writeFile(resolve(project.root, 'helper-c.ts'), helperSource('c', 1))
  await held
  cli.write('stop\n')
  await cli.waitFor(/Cancelling tests, waiting for cleanup\. Watch off/, { from: mark })
  await cli.waitFor(/Cancelled after cleanup/, { from: mark, timeout: 60_000 })
  marker.release()
  seen = marker.urls().length
  await writeFile(resolve(project.root, 'helper-b.ts'), helperSource('b', 2))
  await new Promise(done => setTimeout(done, 8000))
  expect(marker.urls().length).toBe(seen)

  // A fresh explicit enable works and runs the whole book once.
  mark = cli.mark()
  cli.write('watch\n')
  await cli.waitFor(/Watch on: all stories/, { from: mark })
  await cli.waitFor(/Passed · 4 tests · 4 passed · 0 failed · 0 skipped/, { from: mark, timeout: 180_000 })
  expect((await fetch(origin)).status).toBe(200)

  cli.write('quit\n')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.raw()).not.toMatch(/\u001B\[(\?25[lh]|\?1049[hl]|[0-9;]*[AJHK])/)
}, 900_000)
