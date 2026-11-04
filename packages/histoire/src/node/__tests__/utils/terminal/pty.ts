import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { MCP_BUILT_CLI } from '../mcp/cli-project.js'
import { createPackageProcessEnvironment } from '../process-environment.js'

/** Python bridge between the test and a pseudo terminal. */
const HELPER = fileURLToPath(new URL('./pty-helper.py', import.meta.url))
/** Output kept for assertions; older text is dropped (offsets stay absolute). */
const KEEP_CHARS = 1_000_000

/** Terminal flags as the kernel reports them for the PTY. */
export interface TerminalFlags {
  /** Line discipline active (cooked input). */
  canonical: boolean
  echo: boolean
  /** Ctrl+C generates SIGINT. */
  signals: boolean
}

/** Inputs of one PTY run. */
export interface PtyOptions {
  args: string[]
  cwd: string
  environment?: NodeJS.ProcessEnv
  columns?: number
  rows?: number
  /** Script run under Node; defaults to the built CLI. */
  entry?: string
}

/** Running command attached to a PTY. */
export interface PtySession {
  /** Absolute length of the output so far; pass to `waitFor` as `from`. */
  mark: () => number
  /** Raw output (with control sequences) after `from`. */
  raw: (from?: number) => string
  /** Output after `from` with control sequences removed. */
  text: (from?: number) => string
  /** Resolves with the first match of `pattern` in the plain text after `from`. */
  waitFor: (pattern: RegExp, options?: { from?: number, timeout?: number }) => Promise<RegExpExecArray>
  /** Resolves with the first match in the raw output after `from`. */
  waitForRaw: (pattern: RegExp, options?: { from?: number, timeout?: number }) => Promise<RegExpExecArray>
  /** Types bytes into the terminal. */
  write: (text: string) => void
  resize: (columns: number, rows: number) => void
  /** Kernel termios flags of the PTY right now. */
  flags: () => Promise<TerminalFlags>
  /** Polls until `done(flags)` holds (for short-lived states) and returns the matching flags. */
  waitForFlags: (done: (flags: TerminalFlags) => boolean, timeout?: number) => Promise<TerminalFlags>
  /** Terminal flags the command left behind after exiting; undefined while running or unreadable. */
  exitFlags: () => TerminalFlags | undefined
  /** Sends a signal to the command itself. */
  signal: (name: 'SIGCONT' | 'SIGTERM' | 'SIGWINCH' | 'SIGINT') => void
  /** Resolves with the exit code once the command ended and its output drained. */
  waitForExit: (timeout?: number) => Promise<number>
  /** Pid of the helper's child is not exposed; this is the helper process. */
  readonly helper: ChildProcessWithoutNullStreams
  /** Ends the command (SIGTERM then SIGKILL) and joins the helper. Always safe to call. */
  close: () => Promise<void>
}

/**
 * Reports why PTY tests cannot run here, or undefined when they can.
 * Tests must fail (not skip silently) when this returns a reason.
 */
export function ptyPrerequisite(): string | undefined {
  if (process.platform === 'win32') return 'PTY harness is Unix only'
  const probe = spawnSync('python3', ['-I', '-c', 'import pty, termios'], { encoding: 'utf8' })
  return probe.status === 0 ? undefined : `python3 with pty/termios is required (${probe.error?.message ?? probe.stderr.trim()})`
}

/**
 * Starts a command in a PTY. The environment is the clean package environment with
 * interactive terminal facts (`TERM`) and without CI or inspector settings.
 * @param options Command and terminal size.
 */
export function startPty(options: PtyOptions): PtySession {
  const missing = ptyPrerequisite()
  if (missing) throw new Error(missing)
  const environment = createPackageProcessEnvironment({ TERM: 'xterm-256color', ...options.environment })
  // Automatic detection must see an ordinary interactive terminal unless a test sets these.
  for (const name of ['CI', 'NO_COLOR', 'FORCE_COLOR']) {
    if (!(name in (options.environment ?? {}))) delete environment[name]
  }
  const node = process.env.HISTOIRE_MCP_TEST_NODE || process.execPath
  const helper = spawn('python3', ['-I', HELPER, String(options.columns ?? 100), String(options.rows ?? 30), '--', node, options.entry ?? MCP_BUILT_CLI, ...options.args], { cwd: options.cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let dropped = 0
  let lineBuffer = ''
  const listeners = new Set<() => void>()
  const answers = new Map<string, (flags: TerminalFlags) => void>()
  let nextId = 0
  let code: number | undefined
  let exitFlags: TerminalFlags | undefined
  let stderr = ''
  const exited = new Promise<number>((resolve, reject) => {
    helper.once('error', reject)
    helper.once('close', () => resolve(code ?? -1))
  })
  exited.catch(() => {})
  helper.stderr.on('data', (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-4000)
  })
  helper.stdout.on('data', (data: Buffer) => {
    lineBuffer += data.toString()
    for (let end = lineBuffer.indexOf('\n'); end >= 0; end = lineBuffer.indexOf('\n')) {
      const line = lineBuffer.slice(0, end)
      lineBuffer = lineBuffer.slice(end + 1)
      if (line.startsWith('O')) {
        output += Buffer.from(line.slice(1), 'base64').toString()
        if (output.length > KEEP_CHARS) {
          dropped += output.length - KEEP_CHARS
          output = output.slice(-KEEP_CHARS)
        }
      }
      else if (line.startsWith('T')) {
        const [id, json] = [line.slice(1, line.indexOf(' ')), line.slice(line.indexOf(' ') + 1)]
        answers.get(id)?.(JSON.parse(json))
        answers.delete(id)
      }
      else if (line.startsWith('F')) {
        exitFlags = JSON.parse(line.slice(1))
      }
      else if (line.startsWith('X')) {
        code = Number(line.slice(1))
      }
    }
    for (const listener of [...listeners]) listener()
  })
  const send = (message: object) => {
    if (helper.stdin.writable) helper.stdin.write(`${JSON.stringify(message)}\n`)
  }
  const slice = (from = 0) => output.slice(Math.max(0, from - dropped))
  /** Tail of the output searched (or of everything), without control sequences, for failure messages. */
  const diagnostics = (from = 0) => `${stripVTControlCharacters(slice(from)).slice(0, 3000)}${stderr ? `\n[helper stderr] ${stderr}` : ''}`

  /** Polls output (and process end) until `read` matches. */
  function wait(read: (from?: number) => string, pattern: RegExp, { from = 0, timeout = 60_000 } = {}) {
    return new Promise<RegExpExecArray>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${pattern}:\n${diagnostics(from)}`)), timeout)
      const check = () => {
        const match = pattern.exec(read(from))
        if (match) finish(undefined, match)
      }
      function finish(error?: Error, match?: RegExpExecArray) {
        clearTimeout(timer)
        listeners.delete(check)
        error ? reject(error) : resolve(match!)
      }
      listeners.add(check)
      void exited.then(() => {
        check()
        finish(new Error(`Command ended while waiting for ${pattern}:\n${diagnostics(from)}`))
      })
      check()
    })
  }
  const flags = () => new Promise<TerminalFlags>((resolve, reject) => {
    const id = String(nextId++)
    const timer = setTimeout(() => reject(new Error('termios request timed out')), 5000)
    answers.set(id, (value) => {
      clearTimeout(timer)
      resolve(value)
    })
    send({ termios: id })
  })

  const session: PtySession = {
    helper,
    mark: () => dropped + output.length,
    raw: from => slice(from),
    text: from => stripVTControlCharacters(slice(from)),
    waitFor: (pattern, waitOptions) => wait(from => stripVTControlCharacters(slice(from)), pattern, waitOptions),
    waitForRaw: (pattern, waitOptions) => wait(slice, pattern, waitOptions),
    write: text => send({ write: Buffer.from(text).toString('base64') }),
    resize: (columns, rows) => send({ resize: [columns, rows] }),
    flags,
    async waitForFlags(done, timeout = 5000) {
      const deadline = Date.now() + timeout
      for (;;) {
        const value = await flags()
        if (done(value) || Date.now() > deadline) return value
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    },
    exitFlags: () => exitFlags,
    signal: name => send({ signal: name }),
    async waitForExit(timeout = 60_000) {
      let timer: ReturnType<typeof setTimeout>
      try {
        return await Promise.race([exited, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Command did not exit:\n${diagnostics()}`)), timeout)
        })])
      }
      finally { clearTimeout(timer!) }
    },
    async close() {
      if (code === undefined) {
        // Closing the helper's stdin makes it terminate the command; escalate if it lingers.
        helper.stdin.end()
        const killer = setTimeout(() => helper.kill('SIGKILL'), 20_000)
        try {
          await exited
        }
        finally { clearTimeout(killer) }
      }
    },
  }
  return session
}
