import type { Serializable } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { z } from 'zod/v4'
import { toMcpError } from '../protocol/errors.js'
import { mcpProjectIdSchema } from '../protocol/ids.js'
import { dispatchWorkerRequest } from './worker-dispatch.js'
import { assertWorkerFrame, isWorkerBinaryResult, parseWorkerResult, workerParentMessageSchema } from './worker-protocol.js'

// Environment is cleared before importing runtime/configuration dependencies.
delete process.env.HISTOIRE_MCP_TOKEN
process.env.NODE_ENV = 'development'
process.env.HISTOIRE = 'true'
/** Boot owned project worker after environment isolation. */
async function main() {
  const bootstrap = z.tuple([z.string().refine(isAbsolute), z.string(), mcpProjectIdSchema, z.string().regex(/^stdio:[0-9a-f-]{36}$/)]).parse(process.argv.slice(2))
  const [, config, projectId, principal] = bootstrap
  const { createWorkerRuntime } = await import('./worker-runtime.js')
  const runtime = createWorkerRuntime({ projectId, config: config || undefined })
  const requests = new Map<string, AbortController>()
  let closing: Promise<void> | undefined
  let writes = 0

  /** Bounded outbound IPC writes; oversized DTOs never leak into error messages. */
  function send(message: Serializable) {
    assertWorkerFrame(message, isWorkerBinaryResult(message))
    if (!process.connected) return
    if (writes >= 64) throw new Error('Histoire MCP worker response limit reached')
    writes++
    process.send(message, undefined, undefined, (error) => {
      writes--
      if (error) void close(1)
    })
  }

  /** Stop requests synchronously, then close exactly this worker's owned runtime. */
  function close(exitCode = 0) {
    if (closing) return closing
    for (const abort of requests.values()) abort.abort(new Error('Project worker closed'))
    requests.clear()
    closing = runtime.close().catch((error) => {
      console.error(error)
      process.exitCode = 1
    }).finally(() => {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      process.off('message', onMessage)
      process.off('disconnect', onDisconnect)
      process.exitCode ??= exitCode
      if (process.connected) {
        try {
          send({ type: 'closed' })
        }
        catch (error) {
          console.error(error)
          process.exitCode = 1
        }
        finally { process.disconnect() }
      }
    })
    return closing
  }
  /** Signals and lost IPC both invoke independently owned cleanup. */
  function onSignal() {
    void close()
  }
  /** IPC loss is terminal even if parent disappeared before sending shutdown. */
  function onDisconnect() {
    void close()
  }
  /** Parse before dispatch, retain exact request identity, and suppress cancelled replies. */
  function onMessage(raw: unknown) {
    try {
      assertWorkerFrame(raw)
      const message = workerParentMessageSchema.parse(raw)
      if (message.type === 'shutdown') {
        void close()
        return
      }
      if (message.type === 'cancel') {
        requests.get(message.id)?.abort(new Error('Worker request cancelled'))
        return
      }
      if (closing || requests.has(message.id) || requests.size >= 64) throw new Error('Invalid Histoire MCP worker request ownership')
      const abort = new AbortController()
      requests.set(message.id, abort)
      void dispatchWorkerRequest({ project: runtime.project, operations: runtime.operations, principal }, message.method, message.input, abort.signal)
        .then((data) => {
          if (!abort.signal.aborted && !closing) send({ type: 'result', id: message.id, data: parseWorkerResult(message.method, data) })
        })
        .catch((error) => {
          if (!abort.signal.aborted && !closing) {
            try {
              send({ type: 'error', id: message.id, error: toMcpError(error) })
            }
            catch (failure) {
              console.error(failure)
              void close(1)
            }
          }
        })
        .finally(() => { requests.delete(message.id) })
    }
    catch (error) {
      console.error(error)
      void close(1)
    }
  }
  process.on('message', onMessage)
  process.once('disconnect', onDisconnect)
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  send({ type: 'boot', project: runtime.project.getProject(), executors: { screenshot: runtime.operations.hasExecutor('screenshot'), tests: runtime.operations.hasExecutor('tests') } })
  void runtime.start().catch(error => console.error(error))
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  if (process.connected) process.disconnect()
})
