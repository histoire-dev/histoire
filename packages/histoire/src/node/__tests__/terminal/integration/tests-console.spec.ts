/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { addMcpTestBodyMarker } from '../../utils/mcp/artifact-project.js'
import { createMcpBrowserTestProject } from '../../utils/mcp/browser-test-project.js'
import { startBodyMarker } from '../../utils/terminal/body-marker.js'
import { TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'

// Boundary: the real built CLI in a PTY, a real project-Vitest browser run behind it, and an
// HTTP endpoint the held test body reports to. Expected counts come from the fixture itself
// (Test book variants: normal 3 passed/1 skipped, fail 2/1 failed/1 skipped, timeout 3 passed with one
// timeout failure, slow held until its deadline), never from the code under test. Defects:
// running another target than the selected one, a cancel that does not wait for cleanup or
// leaves the lane blocked, old results shown as current after a restart, assertion failures
// affecting the server or the exit status.

const cleanup: (() => Promise<unknown>)[] = []

let marker: Awaited<ReturnType<typeof startBodyMarker>>
let project: Awaited<ReturnType<typeof createMcpBrowserTestProject>>
beforeAll(async () => {
  marker = await startBodyMarker()
  project = await createMcpBrowserTestProject()
  await addMcpTestBodyMarker(project.root, marker.url)
  // Collects in the server but throws once it executes in the browser runner.
  await writeFile(resolve(project.root, 'Broken.story.vue'), `<script lang="ts">
import { onTest } from 'histoire/client'
import { it } from 'vitest'
if ((globalThis as any).__vitest_browser__) throw new Error('broken in browser')
onTest(() => { it('never runs', () => {}) })
</script>
<template><Story id="broken"><Variant id="main"><span>Broken</span></Variant></Story></template>`)
})
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close().catch(() => {})
})

afterAll(async () => {
  marker?.close()
  await project?.close()
})

/** Starts the CLI in a PTY. */
function startCli(extra: string[] = []) {
  const cli = startPty({ args: [...TERMINAL_DEV_ARGS, ...extra], cwd: project.root, columns: 120, rows: 36 })
  cleanup.push(() => cli.close())
  return cli
}

it.skipIf(process.platform !== 'linux')('selects the second variant of a story, runs it, stops a held run, runs All, and labels results historical after a restart', async () => {
  const cli = startCli()
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]
  /** Presses Escape and waits until the main screen is back (a key right behind Escape reads as Alt+key). */
  const toMain = async () => {
    const from = cli.mark()
    cli.write('\u001B')
    await cli.waitForRaw(/\u001B\[\?1049l/, { from })
  }

  // Stories: `Test book` (3 stories exist; Broken and Empty must stay out of the run), its second variant `fail`.
  let mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Test book/, { from: mark })
  mark = cli.mark()
  cli.write('\r')
  await cli.waitFor(/normal[\s\S]*fail/, { from: mark })
  cli.write('\u001B[B')
  mark = cli.mark()
  cli.write('t')
  await cli.waitFor(/Variant: Test book \/ untitled/, { from: mark })

  // `t` ran variant two alone: its known result, and the held body of another variant never starts.
  await cli.waitFor(/Queued|Starting|Collecting|Running/, { from: mark })
  await cli.waitFor(/4 tests · 2 passed · 1 failed · 1 skipped/, { from: mark, timeout: 120_000 })
  await cli.waitFor(/FAIL outcome/, { from: mark })
  expect(cli.text(mark)).toMatch(/Run 1 of 1 · test-book \/ fail/)
  expect(marker.count()).toBe(0)

  // Failure detail from the real browser assertion, then the failures filter.
  mark = cli.mark()
  cli.write('\r')
  await cli.waitFor(/AssertionError|expected/, { from: mark })
  mark = cli.mark()
  cli.write('\u001B')
  // A key right behind Escape would read as Alt+key: wait for the list to repaint.
  await cli.waitFor(/4 of 4 cases/, { from: mark })
  mark = cli.mark()
  cli.write('f')
  await cli.waitFor(/1 of 1 failed cases/, { from: mark })
  await toMain()

  // Held run: the `slow` body reports in and then hangs; stop waits for cleanup.
  mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Test book/, { from: mark })
  cli.write('\r')
  await cli.waitFor(/normal[\s\S]*slow/, { from: mark })
  cli.write('\u001B[B\u001B[B')
  mark = cli.mark()
  const entered = marker.next()
  cli.write('t')
  await cli.waitFor(/Variant: Test book \/ untitled/, { from: mark })
  await entered
  await cli.waitFor(/Run 2 of 2 · test-book \/ slow/, { from: mark })
  mark = cli.mark()
  cli.write('s')
  await cli.waitFor(/Cancelling, waiting for cleanup/, { from: mark })
  await cli.waitFor(/Cancelled after cleanup/, { from: mark, timeout: 60_000 })
  expect(marker.count()).toBe(1)
  await toMain()

  // The lane is free: another target (variant `normal`) runs to its known result.
  mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Test book/, { from: mark })
  cli.write('\r')
  await cli.waitFor(/normal[\s\S]*slow/, { from: mark })
  cli.write('\u001B[A\u001B[A\u001B[A')
  mark = cli.mark()
  cli.write('t')
  await cli.waitFor(/Variant: Test book \/ untitled/, { from: mark })
  await cli.waitFor(/Run 3 of 3 · test-book \/ normal/, { from: mark })
  await cli.waitFor(/4 tests · 3 passed · 0 failed · 1 skipped/, { from: mark, timeout: 120_000 })
  expect(marker.count()).toBe(1)

  // All: exact fixture totals, the broken story, named failures, and a server that keeps answering.
  mark = cli.mark()
  cli.write('\u001B[D\u001B[Dr')
  await cli.waitFor(/16 tests · 9 passed · 3 failed · 4 skipped/, { from: mark, timeout: 240_000 })
  await cli.waitFor(/Uncollected Broken\.story\.vue/, { from: mark })
  // Failures lead the list, so the three named failures load with the first page.
  for (const name of ['outcome', 'explicit body timeout', 'cancellable body']) await cli.waitFor(new RegExp(`FAIL ${name}`), { from: mark })
  await cli.waitFor(/Run 4 of 4 · all stories/, { from: mark })
  expect((await fetch(origin)).status).toBe(200)
  await toMain()
  // The main panel carries the activity segment.
  mark = cli.mark()
  await cli.waitFor(/tests 9 passed, 3 failed, 1 uncollected/, { from: mark })

  // Restart after completion: the finished All run stays, labelled historical.
  mark = cli.mark()
  cli.write('r')
  await cli.waitFor(/Restarting/, { from: mark })
  // The panel repaints every second, so the new `Ready in` is seen after the mark.
  mark = cli.mark()
  await cli.waitFor(/Ready in/, { from: mark })
  mark = cli.mark()
  cli.write('t')
  await cli.waitFor(/Historical · Run 4 of 4 · all stories/, { from: mark })
  await cli.waitFor(/runtime restarted since this run/, { from: mark })
  await toMain()

  // A fresh run is a separate entry and does not inherit the old success or failures.
  mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Test book/, { from: mark })
  cli.write('\r')
  await cli.waitFor(/normal[\s\S]*slow/, { from: mark })
  mark = cli.mark()
  cli.write('t')
  await cli.waitFor(/Variant: Test book \/ untitled/, { from: mark })
  await cli.waitFor(/Run 5 of 5 · test-book \/ normal/, { from: mark })
  // From the moment the new run is shown, nothing on screen is labelled historical.
  mark = cli.mark()
  await cli.waitFor(/4 tests · 3 passed · 0 failed · 1 skipped/, { from: mark, timeout: 120_000 })
  expect(cli.text(mark)).not.toMatch(/Historical/)
  mark = cli.mark()
  cli.write('[')
  await cli.waitFor(/Historical · Run 4 of 5 · all stories/, { from: mark })
  expect(cli.text(mark)).toMatch(/16 tests · 9 passed · 3 failed · 4 skipped/)
  await toMain()

  // Assertion failures and cancellation never changed the exit status of the CLI.
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
}, 600_000)

it.skipIf(process.platform !== 'linux')('runs, stops and reports tests through plain commands without terminal control sequences', async () => {
  const cli = startCli(['--no-tui'])
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]
  const before = marker.count()

  // Stop a held All run: cancellation is reported after cleanup.
  let mark = cli.mark()
  const entered = marker.next()
  cli.write('tests\n')
  await cli.waitFor(/Tests queued: all stories/, { from: mark })
  await entered
  cli.write('stop\n')
  await cli.waitFor(/Cancelling tests, waiting for cleanup/, { from: mark })
  await cli.waitFor(/Cancelled after cleanup/, { from: mark, timeout: 60_000 })
  expect(marker.count()).toBe(before + 1)

  // The same command then executes the real browser tests to completion.
  mark = cli.mark()
  cli.write('tests\n')
  await cli.waitFor(/16 tests · 9 passed · 3 failed · 4 skipped/, { from: mark, timeout: 240_000 })
  // Failure details follow the totals line once their page is read.
  await cli.waitFor(/FAIL cancellable body/, { from: mark })
  await cli.waitFor(/FAIL explicit body timeout/, { from: mark })
  await cli.waitFor(/FAIL outcome/, { from: mark })
  const report = cli.text(mark)
  expect(report).toMatch(/Uncollected Broken\.story\.vue/)
  expect(report).toMatch(/FAIL outcome \(test-book \/ fail\)/)
  expect(report).toMatch(/FAIL cancellable body \(test-book \/ slow\)/)
  expect(report).toMatch(/FAIL explicit body timeout \(test-book \/ timeout\)/)
  expect((await fetch(origin)).status).toBe(200)

  cli.write('quit\n')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.raw()).not.toMatch(/\u001B\[(\?25[lh]|\?1049[hl]|[0-9;]*[AJHK])/)
}, 600_000)
