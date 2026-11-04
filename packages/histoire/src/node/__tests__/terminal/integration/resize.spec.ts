/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import { afterEach, expect, it } from 'vitest'
import { createTerminalProject, TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'

/** Cleanup registered by each test; always joined, even after a failed assertion. */
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  const failures: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try {
      await close()
    }
    catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Terminal fixture cleanup failed')
})

// A terminal below 40x10 starts in plain mode. Growing attaches the panel, shrinking
// releases input and cursor again, and repeating the cycle keeps keys working
// (listener count is checked in the session spec). Ctrl+C inside a screen quits and restores the terminal.
it('falls back below the minimum size, recovers, and keeps a single key owner', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root, columns: 39, rows: 9 })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Local: http:\/\/127\.0\.0\.1:\d+\//)
  await cli.waitFor(/Ready in/)
  expect(await cli.flags()).toMatchObject({ canonical: true, echo: true })
  expect(cli.raw()).not.toContain('\u001B[?25l')

  for (let cycle = 0; cycle < 3; cycle++) {
    let mark = cli.mark()
    cli.resize(80, 24)
    await cli.waitForRaw(/\u001B\[\?25l/, { from: mark })
    expect(await cli.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false, echo: false })
    mark = cli.mark()
    cli.resize(39, 9)
    await cli.waitFor(/Terminal too small for the interactive panel, using plain output/, { from: mark })
    await cli.waitForRaw(/\u001B\[\?25h/, { from: mark })
    expect(await cli.waitForFlags(flags => flags.canonical && flags.echo)).toMatchObject({ canonical: true, echo: true })
  }

  const mark = cli.mark()
  cli.resize(80, 24)
  await cli.waitForFlags(flags => !flags.canonical)
  cli.write('r')
  await cli.waitFor(/Restarting\.\.\./, { from: mark })
  await cli.waitFor(/Ready in/, { from: mark + 1 })
  // Duplicate key owners are ruled out in the session unit spec; here the key still works after the cycles.
  expect(cli.text(mark).match(/Restarting\.\.\./g)).toHaveLength(1)

  cli.write('?')
  await cli.waitFor(/Histoire help/, { from: mark })
  cli.write('\u0003')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.raw().lastIndexOf('\u001B[?1049l')).toBeGreaterThan(cli.raw().lastIndexOf('\u001B[?1049h'))
  expect(cli.exitFlags()).toMatchObject({ canonical: true, echo: true })
}, 180_000)
