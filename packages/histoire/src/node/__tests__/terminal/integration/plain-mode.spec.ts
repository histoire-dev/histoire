/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterEach, expect, it } from 'vitest'
import { MCP_BUILT_CLI } from '../../utils/mcp/cli-project.js'
import { createPackageProcessEnvironment } from '../../utils/process-environment.js'
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

/** Control sequences a plain reporter must never emit (cursor visibility, alternate screen, erase, cursor movement). */
const TUI_CONTROLS = /\u001B\[(\?25[lh]|\?1049[hl]|[0-9;]*[AJHK])/

// `--no-tui` wins over HISTOIRE_TUI=1 even in a real terminal: plain lines, cooked
// terminal, finite line commands, and `quit` ends the process through the shared shutdown.
it('keeps plain output and line commands in an interactive terminal', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  const cli = startPty({ args: [...TERMINAL_DEV_ARGS, '--no-tui'], cwd: project.root, environment: { HISTOIRE_TUI: '1' } })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Histoire: http:\/\/127\.0\.0\.1:\d+\//)
  await cli.waitFor(/Local: http:\/\/127\.0\.0\.1:\d+\//)
  await cli.waitFor(/Ready in/)
  expect(await cli.flags()).toMatchObject({ canonical: true, echo: true })

  let mark = cli.mark()
  cli.write('help\n')
  await cli.waitFor(/Commands: help, restart, restart fresh, open, tests, watch, stop, quit/, { from: mark })
  // `watch` toggles whole-book watching: on, then off again before anything lasting happens.
  cli.write('watch\n')
  await cli.waitFor(/Watch on: all stories/, { from: mark })
  cli.write('watch\n')
  await cli.waitFor(/Watch off/, { from: mark })
  cli.write('bogus\n')
  await cli.waitFor(/Unknown command "bogus"/, { from: mark })

  mark = cli.mark()
  cli.write('restart fresh\n')
  await cli.waitFor(/Restarting fresh, skipping cached catalog/, { from: mark })
  await cli.waitFor(/Local: http:\/\/127\.0\.0\.1:\d+\//, { from: mark })

  cli.write('quit\n')
  expect(await cli.waitForExit()).toBe(0)
  expect(cli.raw()).not.toMatch(TUI_CONTROLS)
  expect(cli.exitFlags()).toMatchObject({ canonical: true, echo: true })
}, 180_000)

// Piped stdio: URLs and logs stay, nothing but text is written, and stdin is never read
// (commands typed into the pipe do nothing, closing it does not stop the server).
it('writes only plain text to pipes and installs no stdin reader', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [MCP_BUILT_CLI, ...TERMINAL_DEV_ARGS], { cwd: project.root, env: createPackageProcessEnvironment({ HISTOIRE_TUI: '1' }), stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  const collect = (data: Buffer) => {
    output += data
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const closed = once(child, 'close')
  cleanup.push(async () => {
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
  })
  const waitFor = async (pattern: RegExp) => {
    const deadline = Date.now() + 60_000
    while (!pattern.test(output)) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error(`Missing ${pattern}:\n${output.slice(0, 2000)}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  await waitFor(/Local: http:\/\/127\.0\.0\.1:\d+\//)
  await waitFor(/Ready in/)
  child.stdin.write('restart\nquit\n')
  child.stdin.end()
  await new Promise(resolve => setTimeout(resolve, 1000))
  expect(child.exitCode).toBeNull()
  expect(output).not.toMatch(/Restarting|Unknown command/)
  expect(output).not.toMatch(TUI_CONTROLS)
  expect(output).toMatch(/Histoire: http:\/\/127\.0\.0\.1:\d+\//)
  child.kill('SIGTERM')
  const [code] = await closed
  expect(code).toBe(0)
}, 180_000)
