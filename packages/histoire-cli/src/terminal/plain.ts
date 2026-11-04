import type { Readable } from 'node:stream'
import type { ActionHost } from './actions.js'
import { createInterface } from 'node:readline'
import { openWorkbench, restartRuntime } from './actions.js'
import { runAndReport } from './tests/reporter.js'

/** Commands accepted by the interactive plain reporter, in help order. */
const PLAIN_COMMANDS: readonly string[] = ['help', 'restart', 'restart fresh', 'open', 'tests', 'watch', 'stop', 'quit']

/** Plain mode help text. */
export const PLAIN_HELP = `Commands: ${PLAIN_COMMANDS.join(', ')}`

/**
 * Runs one plain command line. Unknown input and not-yet-available commands answer plainly.
 * @param host Action host (feedback goes through `report`).
 * @param input Raw line typed by the user.
 */
export async function runPlainCommand(host: ActionHost, input: string): Promise<void> {
  const command = input.trim().toLowerCase().replace(/\s+/g, ' ')
  switch (command) {
    case '': return
    case 'help': return host.report(PLAIN_HELP)
    case 'restart': return restartRuntime(host, false)
    case 'restart fresh': return restartRuntime(host, true)
    case 'open': return openWorkbench(host)
    case 'quit': return host.quit()
    case 'tests': return host.tests ? runAndReport(host.tests, host.report) : host.report('Tests are not available yet')
    // Stopping switches watching off first, then cancels every terminal-owned operation.
    case 'stop': return host.tests ? host.report(await host.tests.stop()) : host.report('Tests are not available yet')
    // Toggles whole-scope watching through the control the session registered.
    case 'watch': return host.tests ? host.report(await host.tests.toggleWatch()) : host.report('"watch" is not available yet')
    default: return host.report(`Unknown command "${command}". ${PLAIN_HELP}`)
  }
}

/** Owner of the line reader on an interactive stdin. */
export interface PlainInput {
  /** Starts reading newline-terminated commands. Idempotent. */
  attach: () => void
  /** Stops reading and restores the stream's flow state. Idempotent. */
  detach: () => void
  readonly attached: boolean
}

/**
 * Line reader for interactive plain mode. Never created for non-TTY stdin by the
 * session, so piped input is not consumed and cannot keep the process alive.
 * @param options Input stream and line callback.
 * @param options.stdin Interactive input stream.
 * @param options.onLine Receives each typed line.
 */
export function createPlainInput(options: { stdin: Readable, onLine: (line: string) => void }): PlainInput {
  let reader: ReturnType<typeof createInterface> | undefined
  let wasFlowing = false
  return {
    get attached() {
      return reader !== undefined
    },
    attach() {
      if (reader) return
      wasFlowing = options.stdin.readableFlowing === true
      // Not a terminal-mode interface: readline must not repaint prompts or echo.
      const created = createInterface({ input: options.stdin, terminal: false })
      reader = created
      created.on('line', options.onLine)
      // End of input (Ctrl+D) ends reading but not the server.
      created.once('close', () => {
        if (reader === created) reader = undefined
      })
    },
    detach() {
      const current = reader
      reader = undefined
      if (!current) return
      current.close()
      if (wasFlowing) options.stdin.resume()
    },
  }
}
