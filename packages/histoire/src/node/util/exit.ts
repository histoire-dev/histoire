/** Time (ms) given to the process to end on its own before forcing an exit. */
const DEFAULT_EXIT_GRACE = 2_000

/** Minimal writable-stream shape used to flush the CLI output. */
interface FlushableStream {
  write: (chunk: string, callback: () => void) => unknown
}

export interface ExitAfterFlushOptions {
  /** Exit code. Defaults to the current `process.exitCode`. */
  code?: number
  /** Time to wait for a natural exit (and for each flush) before forcing one. */
  graceMs?: number
  /** Streams to flush. Defaults to stdout and stderr. */
  streams?: FlushableStream[]
  /** Injected for tests. */
  exit?: (code: number) => void
  /** Injected for tests. */
  warn?: (message: string) => void
}

/**
 * Waits until everything already written to a stream reached the OS.
 *
 * The callback of an empty write only runs once every previously queued chunk
 * has been written, which is exactly what "flushed" means for a pipe.
 * @param stream Stream to flush.
 * @param timeoutMs Maximum time to wait, so a stuck pipe cannot hang the CLI.
 */
function flushStream(stream: FlushableStream, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let done = false

    const finish = () => {
      if (done) {
        return
      }
      done = true
      clearTimeout(timer)
      resolve()
    }

    timer = setTimeout(finish, timeoutMs)
    timer.unref?.()

    try {
      stream.write('', finish)
    }
    catch {
      // A destroyed stream cannot be flushed — nothing left to wait for.
      finish()
    }
  })
}

/**
 * Ends the CLI without truncating its output.
 *
 * `process.exit()` discards whatever is still buffered for a piped stdout (CI
 * logs, `| tee`), so the report is flushed first and the process is then left
 * to exit naturally. Leaked handles (a Playwright browser whose cleanup timed
 * out, a Vite server, ws connections) would keep the event loop alive forever,
 * so an unref'd timer force-exits as a last resort — unref'd precisely so a
 * healthy process still exits as soon as its work is done.
 * @param options Exit configuration (see {@link ExitAfterFlushOptions}).
 */
export async function exitAfterFlush(options: ExitAfterFlushOptions = {}) {
  const {
    code = Number(process.exitCode ?? 0),
    graceMs = DEFAULT_EXIT_GRACE,
    streams = [process.stdout, process.stderr],
    exit = (value: number) => process.exit(value),
    warn = console.warn,
  } = options

  process.exitCode = code

  await Promise.all(streams.map(stream => flushStream(stream, graceMs)))

  const timer = setTimeout(() => {
    warn(`Histoire still has open handles ${graceMs}ms after finishing — forcing exit.`)
    exit(code)
  }, graceMs)
  timer.unref?.()
}
