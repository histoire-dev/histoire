/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createTerminalProject, TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'

/** Cleanup registered by each test; always joined, even after a failed assertion. */
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close().catch(() => {})
})

/** Config printing startup noise through console and stderr-like paths. */
const NOISY = `
import { HstVue } from '@histoire/plugin-vue';
console.log('startup note \\u00E9\\u2603');
console.error('startup error one\\nsecond line');
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false };
`

// Real built CLI in a PTY: session info, retained logs with search, `x`, and the latest error
// after a failing configuration edit followed by recovery.
it('shows session info, searchable logs, deletes history, and focuses the latest error after recovery', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  const configPath = resolve(project.root, 'custom config.ts')
  await writeFile(configPath, NOISY)
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root, columns: 110, rows: 30 })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)

  // Session info: runtime facts of the current generation plus the bound address.
  let mark = cli.mark()
  cli.write('i')
  await cli.waitForRaw(/\u001B\[\?1049h/, { from: mark })
  await cli.waitFor(/Vite {7}\d+\.\d+/, { from: mark })
  const info = cli.text(mark)
  expect(info).toMatch(/Local {2}http:\/\/127\.0\.0\.1:\d+\//)
  expect(info).toMatch(/Network {3}none available/)
  expect(info).toContain('custom config.ts')
  expect(info).toMatch(/Histoire {3}\d+\.\d+\.\d+/)
  expect(info).toMatch(/Stories {4}\d+ stories/)
  // QR code of the selected address: the lazily imported encoder resolves from the built package.
  cli.write('r')
  await cli.waitFor(/█{20}/, { from: mark })
  cli.write('\u001B')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })

  // Logs: startup records are retained and searchable; the multiline record keeps its second line in detail.
  mark = cli.mark()
  cli.write('l')
  await cli.waitFor(/startup note/, { from: mark })
  cli.write('/error one\r')
  await cli.waitFor(/1 of \d+ log entries · filter "error one"/, { from: mark })
  cli.write('\r')
  await cli.waitFor(/second line/, { from: mark })
  // Escape leaves the detail first, then the screen (two separate key presses).
  let escape = cli.mark()
  cli.write('\u001B')
  await cli.waitFor(/Enter detail/, { from: escape })
  cli.write('\u001B')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: escape })

  // A failing edit adds an error after the startup one; the latest-error screen focuses the newest.
  mark = cli.mark()
  await writeFile(configPath, `throw new Error('second startup failure');`)
  // The thrown error's own record (the progress line only carries its message) is retained before it is echoed.
  await cli.waitFor(/Error: second startup failure/, { from: mark, timeout: 60_000 })
  mark = cli.mark()
  cli.write('e')
  await cli.waitForRaw(/\u001B\[\?1049h/, { from: mark })
  await cli.waitFor(/Latest error[\s\S]*second startup failure/, { from: mark })
  expect(cli.text(mark)).not.toContain('startup error one')
  escape = cli.mark()
  cli.write('\u001B')
  // The list behind it still holds the earlier startup error.
  await cli.waitFor(/startup error one/, { from: escape })
  cli.write('\u001B')

  // Recovery keeps history; `x` then deletes only retained logs.
  mark = cli.mark()
  await writeFile(configPath, NOISY)
  await cli.waitFor(/Ready in/, { from: mark, timeout: 60_000 })
  mark = cli.mark()
  cli.write('x')
  await cli.waitFor(/Deleted \d+ log entries/, { from: mark })
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
}, 240_000)
