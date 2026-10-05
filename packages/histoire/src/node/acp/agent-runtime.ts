import type { RequestPermissionRequest, RequestPermissionResponse, SessionNotification } from '@agentclientprotocol/sdk'
import type { UiAgentSettings } from '@histoire/shared'
import { launchAgentProcess } from './agent-process.js'
import { connectAgentClient } from './client.js'

/** Bounded subprocess + SDK lifetime, available before initialize resolves. */
export function createAgentRuntime(preset: UiAgentSettings['presets'][number], options: {
  /** Launch root. */
  root: string
  /** Private user-level environment. */
  environment: Record<string, string>
  /** Public text redactor. */
  sanitize: (text: string) => string
  /** Initialization timeout. */
  timeout: number
  /** Safe stderr observer. */
  log: (lines: string[]) => void
  /** Process failure observer. */
  failed: (error: string, missing: boolean) => void
  /** Tool request broker. */
  permission: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>
  /** Streamed reply/tool updates. */
  update: (notification: SessionNotification) => void
}) {
  const process = launchAgentProcess(preset, options.root, options.environment)
  let stopped = false
  let error: string | undefined
  const lines: string[] = []
  let stderr = ''
  /** Stores only bounded redacted lines; no raw transport frame is logged. */
  function flushStderr(final = false): void {
    const split = stderr.split(/\r?\n/)
    stderr = final ? '' : split.pop()
    for (const line of split) {
      if (line) lines.push(options.sanitize(line))
    }
    lines.splice(0, Math.max(0, lines.length - 30))
    options.log([...lines])
  }
  process.child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-32_000)
    flushStderr()
  })
  process.child.once('error', (cause: NodeJS.ErrnoException) => {
    error = cause.code === 'ENOENT' ? `Agent command "${preset.command}" is not installed` : `Agent process failed (${cause.code ?? 'unknown'})`
    if (!stopped) options.failed(options.sanitize(error), cause.code === 'ENOENT')
  })
  process.child.once('close', (code, signal) => {
    flushStderr(true)
    if (!stopped && !error) {
      error = options.sanitize(`Agent exited (${signal ?? code ?? 'unknown'})${lines.length ? `: ${lines.slice(-3).join('\n')}` : ''}`)
      options.failed(error, false)
    }
  })
  const sdk = connectAgentClient(process, options)
  const ready = withAgentTimeout(sdk.initialize(), options.timeout, 'ACP initialize handshake timed out')
  void ready.catch(() => {})
  return {
    ...sdk,
    ready,
    /** Last controlled/redacted process failure, replacing generic stream errors. */
    failure: () => error,
    /** Waits briefly for stderr/exit before projecting a generic transport close. */
    async failureMessage(): Promise<string | undefined> {
      if (sdk.connection.signal.aborted && !stopped) await withAgentTimeout(process.exited, 250, 'Agent exit pending').catch(() => {})
      return error
    },
    /** Stops SDK transport before killing the owned agent process. */
    async stop(): Promise<void> {
      stopped = true
      sdk.connection.close(new Error('Agent runtime closed'))
      await process.stop()
    },
  }
}

/** Bounded handshake operations cannot keep a retired dev server alive forever. */
export async function withAgentTimeout<T>(operation: Promise<T>, timeout: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout)
      timer.unref()
    })])
  }
  finally { clearTimeout(timer) }
}
