import type { Buffer } from 'node:buffer'
import type { ChildMessage, ConfiguredAddress, ParentMessage, RuntimeCommand, RuntimeEvent, RuntimeOutput, RuntimeReply, RuntimeSendResult, WatchInput } from '../protocol.js'
import { fork, spawn } from 'node:child_process'
import { isChildMessage } from '../protocol.js'

/** Starts one IPC runtime and joins its entire lifetime before ownership transfer. */
export function startRuntimeChild(options: {
  /** Runtime entry supplied by Histoire, never imported into proxy process. */
  entry: URL
  /** Existing project directory. */
  root: string
  /** Opaque identity fixed for this process. */
  generation: string
  /** External browser origin. */
  publicOrigin: string
  /** Serializable CLI options. */
  options: Record<string, unknown>
  /** Private MCP credential, sent only over IPC. */
  token?: string
  /** Evaluation snapshots must reconcile before readiness publication. */
  onWatch: (inputs: WatchInput[], complete: boolean) => Promise<void>
  /** Applies the configured public address and returns the origin the runtime must use. */
  onAddress?: (address: ConfiguredAddress) => Promise<string>
  /** Commit current dependency set before public readiness, if runtime reported one. */
  onReady?: () => Promise<void>
  /** Reports unexpected exits after readiness. */
  onExit: (error: Error) => void
  /** Winddown deadline; defaults to ten seconds. */
  shutdownTimeout?: number
  /** Receives raw stdout/stderr instead of the default piping to this process; each chunk is consumed once. */
  onOutput?: (output: RuntimeOutput) => void
  /** Receives validated reply/event frames of this generation, independently of readiness. */
  onRuntimeMessage?: (message: RuntimeReply | RuntimeEvent) => void
  /** Runs once when this runtime stops being usable (winddown start or exit), before cleanup completes. */
  onRetire?: () => void
  /** Reports observer failures and winddown notices; defaults to `console.error`. */
  onDiagnostic?: (message: string) => void
  /** Ready runtime asked to be replaced by a new process. */
  onRestartRequest?: (request: { source: string, fresh: boolean }) => void
}) {
  const diagnostic = options.onDiagnostic ?? ((message: string) => console.error(message))
  /** Observer faults must never disturb process ownership. */
  function guarded(action: () => void) {
    try {
      action()
    }
    catch (error) {
      try {
        diagnostic(`Histoire runtime observer failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      catch {}
    }
  }
  let retired = false
  /** Signals retirement exactly once. */
  function retire() {
    if (retired) return
    retired = true
    if (options.onRetire) guarded(options.onRetire)
  }
  const environment = { ...process.env }
  delete environment.HISTOIRE_MCP_TOKEN
  const child = fork(options.entry, [], { cwd: options.root, env: environment, detached: process.platform !== 'win32', execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  // Without an observer the streams keep their historical direct piping.
  const outputListeners: Array<() => void> = []
  if (options.onOutput) {
    const observe = options.onOutput
    for (const stream of ['stdout', 'stderr'] as const) {
      const source = child[stream]!
      const onData = (chunk: Buffer) => guarded(() => observe({ stream, generation: options.generation, chunk }))
      const onEnd = () => guarded(() => observe({ stream, generation: options.generation }))
      source.on('data', onData)
      source.once('end', onEnd)
      outputListeners.push(() => {
        source.off('data', onData)
        source.off('end', onEnd)
      })
    }
  }
  else {
    child.stdout!.pipe(process.stdout, { end: false })
    child.stderr!.pipe(process.stderr, { end: false })
  }
  let closing: Promise<void> | undefined
  let settled = false
  let backend: Extract<ChildMessage, { type: 'ready' }> | undefined
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const ready = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  void ready.catch(() => {
  })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  let messages = Promise.resolve()
  child.on('error', reject)
  child.on('message', (raw) => {
    if (!isChildMessage(raw) || raw.generation !== options.generation || closing) return
    if (raw.type === 'restart') {
      // Only a served generation may ask; startup failures already report through `failed`.
      if (settled && options.onRestartRequest) guarded(() => options.onRestartRequest!({ source: raw.source, fresh: raw.fresh === true }))
      return
    }
    if (raw.type === 'runtime-reply' || raw.type === 'runtime-event') {
      // Runtime traffic is independent of the startup message chain.
      if (options.onRuntimeMessage) guarded(() => options.onRuntimeMessage!(raw))
      return
    }
    messages = messages.then(async () => {
      if (closing) return
      if (raw.type === 'watch') await options.onWatch(raw.inputs, raw.complete === true)
      if (raw.type === 'address') {
        const publicOrigin = await options.onAddress?.({ port: raw.port, host: raw.host }) ?? options.publicOrigin
        if (closing || !child.connected) return
        child.send({ type: 'address', generation: options.generation, publicOrigin } satisfies ParentMessage, error => error && reject(error))
      }
      if (raw.type === 'failed') reject(new Error(raw.error))
      if (raw.type === 'ready') {
        await options.onReady?.()
        if (closing) return
        backend = raw
        settled = true
        resolve()
      }
    }).catch(reject)
  })
  child.once('exit', (code, signal) => {
    retire()
    const error = new Error(`Histoire runtime exited (${signal ?? code ?? 'unknown'})`)
    reject(error)
    if (settled && !closing) options.onExit(error)
  })
  const message: ParentMessage = { type: 'start', generation: options.generation, publicOrigin: options.publicOrigin, options: options.options, token: options.token }
  child.send(message, error => error && reject(error))

  /** Waits bounded time without retaining a timer once process exits. */
  async function wait(milliseconds: number) {
    if (child.exitCode !== null || child.signalCode !== null) return true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([exited.then(() => true), new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds)
      })])
    }
    finally {
      clearTimeout(timer)
    }
  }
  /** Kills only this detached ownership group, including ordinary runtime descendants. */
  async function killTree() {
    if (!child.pid) return
    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        const kill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        kill.once('error', reject)
        kill.once('exit', code => code === 0 ? resolve() : reject(new Error('Unable to terminate Histoire runtime tree')))
      })
    }
    else {
      try {
        process.kill(-child.pid, 'SIGKILL')
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  }
  return {
    ready,
    /** Latest backend metadata remains private to parent proxy. */
    get backend() {
      return backend
    },
    /** Process identity used only by parent diagnostics and ownership tests. */
    pid: child.pid,
    /** Hands a command to this process; resolves once IPC accepted the frame. */
    sendRuntimeCommand(command: Omit<RuntimeCommand, 'type' | 'generation'>): Promise<RuntimeSendResult> {
      if (closing || !settled || !child.connected) return Promise.resolve({ ok: false, reason: 'closed' })
      // Envelope fields last: a stray `type` or `generation` on the command can never readdress it.
      const message: ParentMessage = { ...command, type: 'runtime-command', generation: options.generation }
      return new Promise((resolve) => {
        child.send(message, error => resolve(error ? { ok: false, reason: 'closed' } : { ok: true, generation: options.generation }))
      })
    },
    /** IPC first permits framework cleanup; forced tree termination is last resort. */
    close() {
      return closing ??= (async () => {
        retire()
        reject(new Error('Histoire runtime closed'))
        if (child.connected) {
          child.send({ type: 'shutdown' } satisfies ParentMessage, () => {
          })
        }
        if (!await wait(options.shutdownTimeout ?? 10_000)) {
          diagnostic('Histoire runtime winddown timed out; terminating owned process tree')
          await killTree()
          if (!await wait(3000)) throw new Error('Histoire runtime termination could not be confirmed')
        }
        // Successful exit must not leave inherited descendants holding ports.
        if (process.platform !== 'win32') await killTree()
        child.stdout!.unpipe(process.stdout)
        child.stderr!.unpipe(process.stderr)
        for (const stop of outputListeners) stop()
        if (child.connected) child.disconnect()
      })()
    },
  }
}
