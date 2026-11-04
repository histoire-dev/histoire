/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDevLauncherProject } from '../../utils/mcp/dev-launcher-project.js'
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
  if (failures.length) throw new AggregateError(failures, 'Launcher fixture cleanup failed')
})

/** Pid of the Histoire process the fixture config last started (written by its `onDev` hook). */
async function runtimePid(root: string): Promise<number> {
  return JSON.parse(await readFile(resolve(root, 'launcher-state.json'), 'utf8')).pid
}

/** Whether a process still exists; any other error is a real failure. */
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

// Real repository launcher on a private copy of the built packages, attached to a PTY:
// the child owns the terminal input (no Nodemon stdin pipe), a supervised rebuild
// restarts it with the terminal usable again, and `q` ends launcher and watchers.
it('keeps the terminal usable across rebuild restarts and ends the launcher on quit', async () => {
  const fixture = await createDevLauncherProject()
  cleanup.push(() => fixture.close())
  const cli = startPty({
    entry: fixture.launcher,
    args: ['--config', 'custom config.ts', '--port', '0', '--host', '127.0.0.1', '--no-mcp'],
    cwd: fixture.root,
  })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  // Raw mode proves the child (not Nodemon) reads the real terminal.
  expect(await cli.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false, echo: false })
  let previous = await runtimePid(fixture.root)

  // Rebuilds rewrite a watched output of the private repository, never the shared one.
  const rebuilt = resolve(fixture.repository, 'packages/histoire-cli/dist/commands/dev.js')
  for (let round = 1; round <= 2; round++) {
    const mark = cli.mark()
    await appendFile(rebuilt, `\n// rebuild ${round}\n`)
    // The replacement's first panel precedes its readiness; the old panel's "Ready" cannot match.
    await cli.waitFor(/Waiting for address/, { from: mark, timeout: 90_000 })
    await cli.waitFor(/Ready in/, { from: cli.mark(), timeout: 90_000 })
    const current = await runtimePid(fixture.root)
    expect(current).not.toBe(previous)
    expect(alive(previous)).toBe(false)
    // Input still works on the replacement: `?` opens help, Esc returns.
    expect(await cli.waitForFlags(flags => !flags.canonical && !flags.echo)).toMatchObject({ canonical: false })
    const helpMark = cli.mark()
    cli.write('?')
    await cli.waitFor(/Histoire help/, { from: helpMark })
    cli.write('\u001B')
    await cli.waitForRaw(/\u001B\[\?1049l/, { from: helpMark })
    previous = current
  }

  // Intentional quit: the clean child exit ends the launcher with status 0.
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.exitFlags()).toMatchObject({ canonical: true, echo: true })
  expect(alive(previous)).toBe(false)

  // No watcher survives: a later rebuild starts nothing.
  await appendFile(rebuilt, '\n// after quit\n')
  await new Promise(resolveWait => setTimeout(resolveWait, 3000))
  expect(await runtimePid(fixture.root)).toBe(previous)
}, 300_000)

// Termination of the launcher drains the child first: terminal restored, no orphan runtime.
it('drains the child and restores the terminal when the launcher is terminated', async () => {
  const fixture = await createDevLauncherProject()
  cleanup.push(() => fixture.close())
  const cli = startPty({
    entry: fixture.launcher,
    args: ['--config', 'custom config.ts', '--port', '0', '--host', '127.0.0.1', '--no-mcp'],
    cwd: fixture.root,
  })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  const pid = await runtimePid(fixture.root)
  cli.signal('SIGTERM')
  expect(await cli.waitForExit()).toBe(143)
  expect(cli.exitFlags()).toMatchObject({ canonical: true, echo: true })
  // The launcher waits for the whole terminated tree before exiting.
  expect(alive(pid)).toBe(false)
}, 120_000)
