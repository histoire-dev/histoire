import type { EventEmitter } from 'node:events'

/** Termination signals that start the graceful shutdown (a clean shutdown keeps status 0). */
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/** Inputs of {@link createSignalGuard}; every side effect is injectable. */
export interface SignalGuardOptions {
  /** Emitter of signals and fatal errors (the `process` object). */
  process: EventEmitter
  /** Emitter whose `error` events (EPIPE) must not crash the process (`process.stdout`). */
  stdout: EventEmitter
  /** Synchronously gives the terminal back; idempotent. */
  release: () => void
  /** Graceful shutdown shared by signals, `q` and programmatic close. */
  shutdown: () => Promise<void>
  /** Sets the status the process ends with when the graceful shutdown failed. */
  setExitCode: (code: number) => void
  /** Ends the process immediately. */
  exit: (code: number) => void
  /** Reports an error on stderr. */
  report: (error: unknown) => void
}

/**
 * Installs process-level lifecycle handlers for the dev parent: termination signals,
 * fatal errors and a closed stdout. Install as soon as the terminal is attached,
 * so no window leaves raw mode or the alternate screen behind.
 * @param options Injected process and terminal hooks.
 * @returns `dispose` removes the signal and fatal-error handlers; the stdout handler stays so late writes cannot crash.
 */
export function createSignalGuard(options: SignalGuardOptions) {
  const { process: emitter, stdout } = options

  /** Graceful path; only a teardown failure makes the status nonzero. */
  function shutdown() {
    void options.shutdown().catch((error) => {
      options.report(error)
      options.setExitCode(1)
    })
  }

  const handlers = SIGNALS.map(signal => [signal, shutdown] as const)

  /** Restores the terminal before anything is printed, then exits: the process state is unknown. */
  function fatal(error: unknown) {
    try {
      options.release()
    }
    catch {}
    options.report(error)
    options.exit(1)
  }

  let stdoutFailed = false
  /** The reader went away: shut down once and ignore every later stream error. */
  function onStdoutError(error: NodeJS.ErrnoException) {
    if (stdoutFailed) return
    stdoutFailed = true
    if (error.code === 'EPIPE') shutdown()
  }

  for (const [signal, handler] of handlers) emitter.on(signal, handler)
  emitter.once('uncaughtException', fatal)
  emitter.once('unhandledRejection', fatal)
  stdout.on('error', onStdoutError)

  return {
    /** Removes signal and fatal-error handlers. */
    dispose() {
      for (const [signal, handler] of handlers) emitter.off(signal, handler)
      emitter.off('uncaughtException', fatal)
      emitter.off('unhandledRejection', fatal)
    },
  }
}
