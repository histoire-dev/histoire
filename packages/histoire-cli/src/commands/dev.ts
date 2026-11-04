import type { DevHost, DevOptions } from './host.js'
import { randomUUID } from 'node:crypto'
import { startDevProxy } from '@histoire/dev-proxy'
import { renderBanner } from '../terminal/banner.js'
import { createTerminalBridge } from '../terminal/bridge.js'
import { createClipboardWriter } from '../terminal/clipboard.js'
import { createLogHistory } from '../terminal/output/history.js'
import { createOutputPipeline } from '../terminal/output/pipeline.js'
import { describeRestartCause } from '../terminal/progress/format.js'
import { createProgressState } from '../terminal/progress/state.js'
import { isProgressEvent } from '../terminal/protocol/progress.js'
import { createRequestHistory } from '../terminal/requests/history.js'
import { createRetainedHistories } from '../terminal/retained.js'
import { createTerminalSession } from '../terminal/session.js'
import { detectColorLevel } from '../terminal/style.js'
import { createTestsClient } from '../terminal/tests/client.js'
import { createTestsState } from '../terminal/tests/state.js'
import { createSignalGuard } from './signal-guard.js'

/** CLI parent owns public proxy and its process signal registrations. */
export async function devCommand(options: DevOptions, host: DevHost) {
  host.resolveDevMcpOptions(undefined, options)
  if (typeof options.port === 'string' && !/^\d+$/.test(options.port)) throw new Error('Port must be an integer from 0 to 65535')
  const token = host.captureMcpToken()
  // Terminal-only inputs never reach the runtime child.
  const { tui, testWatch, ...runtimeCliOptions } = options
  let publicUrl = ''
  let started: Awaited<ReturnType<typeof startDevProxy>> | undefined
  const bridge = createTerminalBridge({ transport: { send: async command => started ? started.sendRuntimeCommand(command) : { ok: false, reason: 'starting' } } })
  // Session-lifetime mirror of startup progress and restart causes, fed only by observed events.
  const secrets = token ? [token] : []
  const progress = createProgressState({ secrets })
  const logs = createLogHistory()
  // Public HTTP exchanges seen by the proxy; paths are redacted with the credential.
  const requests = createRequestHistory({ secrets })
  // Created before the proxy binds and before any project code loads; an invalid HISTOIRE_TUI fails here.
  // Histories `x` deletes; later slices register theirs (requests) here.
  const retained = createRetainedHistories()
  // Terminal-owned test operations survive restarts as labelled history; the generation retirement below marks unfinished ones lost.
  const tests = createTestsState({ client: createTestsClient(bridge) })
  tests.attach(bridge)
  const terminal = createTerminalSession({ flag: tui, testWatch, version: host.version, logs, progress, bridge, retained, requests, tests, host: options.host, clipboard: createClipboardWriter() })
  // Installed while the terminal is attached, not after startup: a signal or crash in between must still restore it.
  const guard = createSignalGuard({
    process,
    stdout: process.stdout,
    release: terminal.release,
    shutdown: () => terminal.shutdown(),
    setExitCode: (code) => {
      process.exitCode = code
    },
    exit: code => process.exit(code),
    report: error => console.error(error),
  })
  // Zap banner once, above the first log line; styled only on a color-capable terminal.
  for (const row of renderBanner({ version: host.version, columns: process.stdout.columns ?? 80, color: detectColorLevel(process.env, process.stdout.isTTY === true) })) terminal.line(row)
  // One decoder/sanitizer owns every output source; the terminal session decides where visible bytes go.
  const output = createOutputPipeline({ history: logs, secrets, passthrough: terminal.passthrough })
  bridge.subscribe(({ event, data, generation }) => {
    if (event === 'log') output.onLog(data, generation)
    else if (event === 'progress' && isProgressEvent(data)) progress.onProgress(generation, data)
  })
  try {
    started = await startDevProxy({ ...runtimeCliOptions, port: options.port === undefined ? undefined : Number(options.port), token, runtime: host.runtime, runtimeOptions: { ...runtimeCliOptions, projectId: randomUUID(), terminalLogs: true }, onOutput: output.onOutput, onRequest: requests.onEvent, onRuntimeMessage: bridge.receive, onRuntimeRetired: (generation) => {
      bridge.retire(generation)
      tests.onRetired(generation)
      progress.onRetired(generation)
    }, onRuntimeStart: progress.onRuntimeStart, onRestart(cause) {
      progress.onRestart(cause)
      // One notice per restart transition, naming its cause.
      terminal.line(describeRestartCause(cause, secrets))
    }, onDiagnostic: output.onDiagnostic, onListening(url) {
      publicUrl = url
      terminal.onListening(url)
      terminal.line(`  Histoire: ${url}`)
    }, onStatus(state) {
      progress.onStatus(state)
      if (state.status !== 'ready') return
      terminal.onReady(state.base)
      terminal.line(`  Local: ${new URL(state.base, publicUrl).href}`)
    } })
  }
  catch (error) {
    // Startup failed before the session was usable: give the terminal back.
    guard.dispose()
    terminal.release()
    throw error
  }
  const proxy = started
  /** Closes proxy and runtime; the terminal session runs this after restoring input and screen. */
  async function closeRuntime() {
    guard.dispose()
    try {
      await proxy.close()
    }
    finally {
      bridge.close()
      output.flush()
    }
  }
  /** Same graceful path for signals, `q`, and programmatic close; teardown failures stay a nonzero status. */
  function close() {
    return terminal.shutdown()
  }
  // Bound last: a shutdown requested during startup closes the host right here, after the handlers exist for `closeRuntime` to remove.
  terminal.bind({ restart: request => proxy.restart(request), openBrowser: target => proxy.openBrowser(target), close: closeRuntime })
  // Failed config keeps parent/watcher available for correction and automatic retry.
  void proxy.ready.catch(error => output.onDiagnostic(String(error)))
  return { ...proxy, logs, requests, bridge, progress, retained, tests, get status() {
    return proxy.status
  }, close }
}
