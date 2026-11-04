import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { Writable } from 'node:stream'
import { Buffer } from 'node:buffer'

/** Outcome of a clipboard write. */
export interface CopyResult {
  ok: boolean
  /** Why the write failed; present when `ok` is false. */
  reason?: string
  /** Caveat on success, e.g. that only a terminal request was sent and its acceptance is unknown. */
  note?: string
}

/** Writes text to the system clipboard; implementations never throw. */
export type ClipboardWriter = (text: string) => Promise<CopyResult>

/** Default writer until a platform clipboard is installed; fails plainly. */
export const unavailableClipboard: ClipboardWriter = async () => ({ ok: false, reason: 'clipboard is not available' })

/** One platform command that reads the clipboard text from stdin. */
export interface ClipboardCommand {
  command: string
  args: readonly string[]
  /** Encodes the text the command expects. */
  encode?: (text: string) => string | Uint8Array
}

/** Minimal child process the writer needs; satisfied by `ChildProcess`. */
export type ClipboardProcess = Pick<ChildProcess, 'stdin' | 'on' | 'kill'>

/** Boundary to the platform: process creation and the terminal. Replaced only in tests. */
export interface ClipboardPlatform {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** Starts a command; lazy so `node:child_process` loads only when copying. */
  spawn: (command: string, args: readonly string[], options: SpawnOptions) => ClipboardProcess | Promise<ClipboardProcess>
  /** Interactive terminal stream for the OSC 52 fallback; undefined when not a TTY. */
  terminal?: Pick<Writable, 'write'>
}

/** Marks UTF-16 text for `clip.exe`. */
const BYTE_ORDER_MARK = String.fromCodePoint(0xFEFF)

/** Longest wait for a clipboard helper before giving up on it. */
const COMMAND_TIMEOUT_MS = 3000
/** Largest payload sent through OSC 52; terminals commonly cap it near 100 KB. */
const OSC52_MAX_BYTES = 74_994

/**
 * Candidate commands for a platform, preferred first. Wayland sessions try
 * `wl-copy` before the X11 tools.
 * @param platform Operating system.
 * @param env Environment (session type detection).
 */
export function clipboardCommands(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): ClipboardCommand[] {
  if (platform === 'darwin') return [{ command: 'pbcopy', args: [] }]
  // clip.exe reads UTF-16LE with a byte order mark as Unicode text.
  if (platform === 'win32') return [{ command: 'clip', args: [], encode: text => Buffer.from(`${BYTE_ORDER_MARK}${text}`, 'utf16le') }]
  const x11: ClipboardCommand[] = [{ command: 'xclip', args: ['-selection', 'clipboard', '-in'] }, { command: 'xsel', args: ['--clipboard', '--input'] }]
  return env.WAYLAND_DISPLAY ? [{ command: 'wl-copy', args: [] }, ...x11] : [...x11, { command: 'wl-copy', args: [] }]
}

/** Runs one command with the text on stdin; resolves a failure reason or undefined on success. */
async function run(platform: ClipboardPlatform, candidate: ClipboardCommand, text: string): Promise<string | undefined> {
  const child = await platform.spawn(candidate.command, candidate.args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill()
      resolve(`${candidate.command} timed out`)
    }, COMMAND_TIMEOUT_MS)
    timer.unref()
    const done = (reason?: string) => {
      clearTimeout(timer)
      resolve(reason)
    }
    child.on('error', (error: NodeJS.ErrnoException) => done(error.code === 'ENOENT' ? 'missing' : error.message))
    child.on('close', code => done(code === 0 ? undefined : `${candidate.command} exited with ${code}`))
    // A helper that dies early closes its pipe; the close event reports it.
    child.stdin?.on('error', () => {})
    child.stdin?.end(candidate.encode ? candidate.encode(text) : text)
  })
}

/**
 * Creates the system clipboard writer. Platform commands are tried in order; when
 * none works and the output is an interactive terminal, an OSC 52 request is sent
 * (works over SSH and in many multiplexers, but acceptance cannot be observed).
 * @param platform Platform boundary; defaults to the real process, spawned lazily.
 */
export function createClipboardWriter(platform: Partial<ClipboardPlatform> = {}): ClipboardWriter {
  const boundary: ClipboardPlatform = {
    platform: process.platform,
    env: process.env,
    spawn: async (command, args, options) => (await import('node:child_process')).spawn(command, args, options),
    terminal: process.stdout.isTTY ? process.stdout : undefined,
    ...platform,
  }
  return async (text) => {
    const failures: string[] = []
    for (const candidate of clipboardCommands(boundary.platform, boundary.env)) {
      try {
        const failure = await run(boundary, candidate, text)
        if (!failure) return { ok: true }
        if (failure !== 'missing') failures.push(failure)
      }
      catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    const payload = Buffer.from(text)
    if (boundary.terminal && payload.length <= OSC52_MAX_BYTES) {
      try {
        boundary.terminal.write(`\u001B]52;c;${payload.toString('base64')}\u0007`)
        return { ok: true, note: 'sent as a terminal request, support varies' }
      }
      catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    return { ok: false, reason: failures[0] ?? (payload.length > OSC52_MAX_BYTES ? 'text is too large for a terminal request and no clipboard tool was found' : 'no clipboard tool found') }
  }
}
