/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import type { PtySession } from '../../utils/terminal/pty.js'
import { createServer } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { createScreenEmulator } from '../../../../../../histoire-cli/src/__tests__/utils/terminal/screen.js'
import { createTerminalProject, startConfigGate, TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
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

/**
 * Waits until the panel shows the restart in progress and then readiness again.
 * The panel still shows the previous "Ready" for a moment, so readiness only counts
 * after the "Restarting" status appeared.
 */
async function awaitRestart(cli: PtySession, from: number, notice: RegExp) {
  await cli.waitFor(notice, { from })
  // One pattern over the stripped text: match offsets are not raw marks.
  await cli.waitFor(/Restarting · [\s\S]*Ready in/, { from })
}

/** Whether `port` can be bound again on loopback. */
async function canBind(port: number) {
  const server = createServer()
  return new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

// Real built CLI in a PTY: the panel shows the bound address before project config
// finishes, main keys act on the real runtime, help owns its keys, and quit restores
// the terminal and frees the exact port.
it('shows the address before config, restarts, routes help keys, suspends, and quits cleanly', async () => {
  const gate = await startConfigGate()
  const project = await createTerminalProject(gate)
  cleanup.push(() => project.close(), () => gate.close())
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root })
  cleanup.push(() => cli.close())

  const [, url] = await cli.waitFor(/Local {2}(http:\/\/127\.0\.0\.1:\d+\/)/)
  await gate.reached()
  // The panel is up while the project config is still held; input is raw.
  expect(await cli.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false, echo: false })
  expect(cli.raw()).toContain('\u001B[?25l')
  gate.release()
  await cli.waitFor(/Ready in/)

  // `r` replaces the real runtime and says why.
  let mark = cli.mark()
  cli.write('r')
  await awaitRestart(cli, mark, /Restarting\.\.\./)
  // `R` takes the fresh path.
  mark = cli.mark()
  cli.write('R')
  await awaitRestart(cli, mark, /Restarting fresh, skipping cached catalog/)

  // Help owns the screen: main keys do nothing there, Esc returns.
  mark = cli.mark()
  cli.write('?')
  await cli.waitForRaw(/\u001B\[\?1049h/, { from: mark })
  await cli.waitFor(/Histoire help/, { from: mark })
  cli.write('rRo')
  await new Promise(resolve => setTimeout(resolve, 500))
  expect(cli.text(mark)).not.toMatch(/Restart requested|Restarting/)
  cli.write('\u001B')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })

  // Replaying everything the terminal received: logs scroll above one pinned panel.
  const screen = createScreenEmulator(100, 30)
  screen.write(cli.raw())
  const visible = screen.lines().filter(Boolean)
  expect(visible.slice(-3, -1).map(line => line.trim().slice(0, 9))).toEqual(['Histoire ', 'Local  ht'])
  expect(visible.join('\n').match(/Local {2}http/g)).toHaveLength(1)
  expect(screen.alternate).toBe(false)

  // Suspend releases the terminal, resume restores it.
  cli.write('\u001A')
  expect(await cli.waitForFlags(flags => flags.canonical && flags.echo)).toMatchObject({ canonical: true, echo: true })
  expect(await cli.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false, echo: false })

  // Quit: exit 0, cursor and cooked mode back, port rebindable.
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.exitFlags()).toMatchObject({ canonical: true, echo: true })
  expect(cli.raw().lastIndexOf('\u001B[?25h')).toBeGreaterThan(cli.raw().lastIndexOf('\u001B[?25l'))
  expect(await canBind(Number(new URL(url).port))).toBe(true)
}, 180_000)
