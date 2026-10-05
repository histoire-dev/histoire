import type { Serializable } from 'node:child_process'
import type { McpReadToolName } from '../server/read-tools.js'
import type { WorkerMethod, WorkerResultMap } from './worker-protocol.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { waitForChildExit } from '../../runtime/child-process.js'
import { McpDomainError } from '../protocol/errors.js'
import { assertWorkerFrame, isWorkerBinaryResult, parseWorkerInput, parseWorkerResult, workerChildMessageSchema, workerMethods } from './worker-protocol.js'

/** One bounded parent request awaiting its exact response capability. */
interface PendingRequest {
  /** Finite result schema selector. */
  method: WorkerMethod
  /** Resolves validated public DTO only. */
  resolve: (value: unknown) => void
  /** Rejects once, including worker loss. */
  reject: (error: unknown) => void
  /** Removes deadline and optional abort listener. */
  dispose: () => void
}

/** Start one owned child; all project output is piped with native stream backpressure. */
export function createMcpWorkerClient(options: { root: string, config?: string, projectId: string, principal: string, entry?: URL, timeoutMs?: number }) {
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development', HISTOIRE: 'true' }
  delete environment.HISTOIRE_MCP_TOKEN
  const child = fork(options.entry ?? new URL('./worker-entry.js', import.meta.url), [options.root, options.config ?? '', options.projectId, options.principal], {
    cwd: options.root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: [],
    serialization: 'json',
  })
  // pipe pauses each readable while stderr is blocked; no unbounded JS log queue.
  child.stdout?.pipe(process.stderr, { end: false })
  child.stderr?.pipe(process.stderr, { end: false })
  const pending = new Map<string, PendingRequest>()
  const readTool = new AsyncLocalStorage<McpReadToolName>()
  const nonce = randomUUID()
  let counter = 0
  let closing: Promise<void> | undefined
  let booted = false
  let failed: Error | undefined
  let clientName: string | undefined
  let bootResolve: (value: Extract<ReturnType<typeof workerChildMessageSchema.parse>, { type: 'boot' }>) => void
  let bootReject: (error: unknown) => void
  const ready = new Promise<Extract<ReturnType<typeof workerChildMessageSchema.parse>, { type: 'boot' }>>((resolve, reject) => {
    bootResolve = resolve
    bootReject = reject
  })
  const bootTimer = setTimeout(() => fail(new Error('Histoire MCP worker startup timed out')), options.timeoutMs ?? 30000)
  // Observe before callers attach; startup failures remain visible through ready.
  void ready.catch(() => {})
  const exit = new Promise<void>(resolve => child.once('exit', () => resolve()))

  /** Reject all exact requests once without reflecting arbitrary worker messages. */
  function fail(error: Error) {
    if (failed) return
    failed = error
    clearTimeout(bootTimer)
    bootReject(error)
    for (const item of pending.values()) {
      item.dispose()
      item.reject(error)
    }
    pending.clear()
  }
  /** Send only bounded fixed messages and observe asynchronous IPC write failure. */
  function send(message: Serializable) {
    assertWorkerFrame(message)
    if (!child.connected) throw new Error('Histoire MCP worker disconnected')
    child.send(message, (error) => {
      if (error) fail(new Error('Histoire MCP worker IPC failed'))
    })
  }
  child.on('message', (raw) => {
    try {
      assertWorkerFrame(raw, isWorkerBinaryResult(raw))
      const message = workerChildMessageSchema.parse(raw)
      if (message.type === 'boot') {
        assertWorkerFrame(raw)
        clearTimeout(bootTimer)
        booted = true
        bootResolve(message)
        return
      }
      if (message.type === 'closed') {
        assertWorkerFrame(raw)
        return
      }
      const item = pending.get(message.id)
      // Late replies to cancelled requests cannot settle another caller.
      if (!item) return
      assertWorkerFrame(raw, item.method === 'readResource' && isWorkerBinaryResult(raw))
      pending.delete(message.id)
      item.dispose()
      if (message.type === 'error') {
        item.reject(new McpDomainError(message.error.code, message.error.message, message.error.retryable, message.error.details))
      }
      else {
        try {
          item.resolve(parseWorkerResult(item.method, message.data))
        }
        catch { item.reject(new Error('Invalid Histoire MCP worker result')) }
      }
    }
    catch { fail(new Error('Invalid Histoire MCP worker message')) }
  })
  child.once('error', () => fail(new Error('Histoire MCP worker failed to start')))
  child.once('disconnect', () => {
    if (!closing) fail(new Error('Histoire MCP worker disconnected'))
  })
  child.once('exit', (code, signal) => {
    fail(new Error(closing ? 'Histoire MCP worker closed' : `Histoire MCP worker exited (${signal ?? code})`))
  })

  return {
    /** Boot snapshot arrives before project collection, making lifecycle reads available. */
    ready,
    /** Exact owned process identity, used by lifecycle integration checks. */
    get pid() { return child.pid },
    /** Resolves on owned child exit, including a crash. */
    exited: exit,
    /** Forward only bounded client display name selected by SDK metadata hooks. */
    setClientName(name: string) {
      if (closing || failed || clientName === name) return
      clientName = name
      send({ type: 'client-name', name: name.slice(0, 128) })
    },
    /** Only SDK public read callbacks mark their corresponding IPC request. */
    observeReadTool<T>(name: McpReadToolName, _target: unknown, run: () => T): T {
      return readTool.run(name, run)
    },
    /** Submit one finite bounded request; cancellation never invents a new operation. */
    async request<T extends WorkerMethod>(method: T, input: unknown, signal?: AbortSignal): Promise<WorkerResultMap[T]> {
      if (closing || failed) throw failed ?? new McpDomainError('PROJECT_CLOSED', 'Project worker is closed')
      if (pending.size >= 64) throw new McpDomainError('QUEUE_FULL', 'Worker request limit reached', true)
      signal?.throwIfAborted()
      const parsed = parseWorkerInput(method, input)
      const publicRead = readTool.getStore()
      const observation = publicRead && workerMethods[method as keyof typeof workerMethods] === publicRead ? { readTool: publicRead } : {}
      const id = `${nonce}:${++counter}`
      return new Promise<WorkerResultMap[T]>((resolve, reject) => {
        /** Removes ownership before forwarding cancellation to the child. */
        function cancel(error: unknown) {
          const item = pending.get(id)
          if (!item) return
          pending.delete(id)
          item.dispose()
          reject(error)
          try {
            send({ type: 'cancel', id })
          }
          catch { /* Worker loss already rejects all remaining requests. */ }
        }
        const onAbort = () => cancel(signal.reason)
        const timer = setTimeout(() => cancel(new McpDomainError('TIMEOUT', 'Worker request timed out', true)), options.timeoutMs ?? 30000)
        pending.set(id, {
          method,
          resolve: value => resolve(value as WorkerResultMap[T]),
          reject,
          dispose() {
            clearTimeout(timer)
            signal?.removeEventListener('abort', onAbort)
          },
        })
        signal?.addEventListener('abort', onAbort, { once: true })
        try {
          send({ type: 'request', id, method, input: parsed, ...observation })
        }
        catch (error) {
          pending.delete(id)
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        }
      })
    },
    /** Stop admission, ask for confirmed cleanup, then escalate only this owned child. */
    close() {
      return closing ??= (async () => {
        // Before boot, runtime acquisition has not begun and no shutdown
        // receiver is guaranteed to exist. Stop this exact child immediately.
        if (!booted && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
        if (child.connected && child.exitCode === null && child.signalCode === null) {
          try {
            send({ type: 'shutdown' })
          }
          catch { /* Continue exact-child teardown after IPC failure. */ }
        }
        if (await waitForChildExit(child, exit, 10000)) {
          if (booted && child.exitCode !== 0) throw new Error('Histoire MCP worker cleanup failed')
          return
        }
        child.kill('SIGTERM')
        if (await waitForChildExit(child, exit, 2000)) {
          throw new Error('Histoire MCP worker required termination after cleanup deadline')
        }
        child.kill('SIGKILL')
        if (!await waitForChildExit(child, exit, 2000)) throw new Error('Histoire MCP worker cleanup could not be confirmed')
        throw new Error('Histoire MCP worker required forced termination')
      })()
    },
  }
}
