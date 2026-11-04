/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { startBodyMarker } from '../../utils/terminal/body-marker.js'
import { TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'
import { createWatchProject, watchStorySource } from '../../utils/terminal/watch-project.js'

// Boundary: the real built CLI in a PTY (panel, stories and tests screens, `w`), a real project-Vitest
// browser run behind it, and an HTTP endpoint every test body reports to. Defects: the watch or its
// selected variant lost across a config restart, a second run for one new generation, a changed public
// address, a run of the whole book (or of the story's other variant) after the selected variant vanished.

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

it.skipIf(process.platform !== 'linux')('keeps the watched variant and public address across a config failure, runs once per generation, and pauses when the variant is removed', async () => {
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root, columns: 120, rows: 36 })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]

  // Select variant `second` of story A in the stories screen; `t` hands it to the tests screen and runs it.
  let mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Story A/, { from: mark })
  cli.write('/Story A\r')
  mark = cli.mark()
  cli.write('\r')
  await cli.waitFor(/main[\s\S]*second/, { from: mark })
  cli.write('\u001B[B')
  mark = cli.mark()
  cli.write('t')
  await cli.waitFor(/Variant: Story A \/ second/, { from: mark })
  await cli.waitFor(/Run 1 of 1 · a \/ second/, { from: mark })
  await cli.waitFor(/1 test · 0 passed · 1 failed · 0 skipped/, { from: mark, timeout: 180_000 })
  expect(marker.urls()).toEqual(['/entered?story=a&variant=second'])

  // `w` captures that variant. Only it runs: story A's other variant and the other stories never report.
  mark = cli.mark()
  const watched = marker.next()
  cli.write('w')
  await cli.waitFor(/Watch on · a \/ second/, { from: mark })
  await cli.waitFor(/Run 2 of 2 · a \/ second/, { from: mark })
  await watched
  expect(marker.urls()).toEqual(['/entered?story=a&variant=second', '/entered?story=a&variant=second'])

  // Config failure: the runtime fails, the parent keeps the public address and the preference.
  const configPath = resolve(project.root, 'custom config.ts')
  const original = await readFile(configPath, 'utf8')
  mark = cli.mark()
  await writeFile(configPath, `throw new Error('watch config failure');`)
  // The tests screen stays open: the watch now waits for a runtime that cannot start.
  await cli.waitFor(/Watch on · a \/ second · waiting for the runtime/, { from: mark, timeout: 60_000 })
  expect((await fetch(origin)).status).toBeLessThan(600)
  await new Promise(done => setTimeout(done, 3000))
  expect(marker.urls()).toHaveLength(2)

  // Correction: a new generation verifies the target and runs the retained variant exactly once.
  mark = cli.mark()
  await writeFile(configPath, original)
  await cli.waitFor(/Run 3 of 3 · a \/ second/, { from: mark, timeout: 180_000 })
  await cli.waitFor(/Watch on · a \/ second · waiting for changes/, { from: mark, timeout: 180_000 })
  await new Promise(done => setTimeout(done, 8000))
  expect(marker.urls()).toHaveLength(3)
  expect(cli.text(mark)).toMatch(/Watch on · a \/ second/)
  expect((await fetch(origin)).status).toBe(200)

  // The selected variant disappears (the story keeps `main`): paused, nothing runs, scope never broadens.
  mark = cli.mark()
  await writeFile(resolve(project.root, 'A.story.vue'), watchStorySource('a', marker.url, ['main']))
  await cli.waitFor(/paused: Selected story or variant is no longer in the catalog/, { from: mark, timeout: 60_000 })
  await new Promise(done => setTimeout(done, 5000))
  expect(marker.urls()).toHaveLength(3)

  // A key right behind Escape would read as Alt+key: wait for the main screen first.
  mark = cli.mark()
  cli.write('\u001B')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
}, 900_000)
