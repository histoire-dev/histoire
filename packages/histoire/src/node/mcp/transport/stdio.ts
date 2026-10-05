import type { StdioServerHandle } from '@modelcontextprotocol/server/stdio'
import { randomUUID } from 'node:crypto'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { readHistoireVersion } from '../package-version.js'
import { createMcpProjectId } from '../protocol/ids.js'
import { createHistoireMcpServer } from '../server/factory.js'
import { createOperationServerExtension } from '../server/operation-tools.js'
import { createMcpWorkerClient } from './worker-client.js'
import { createWorkerOperations, createWorkerProject } from './worker-project.js'

/** Serve protocol-only stdout while one exact child owns all project execution. */
export async function startHistoireStdio(options: { root: string, config?: string }) {
  // Remove credentials from both parent and inherited child before config runs.
  delete process.env.HISTOIRE_MCP_TOKEN
  const projectId = createMcpProjectId(options.root)
  const principal = `stdio:${randomUUID()}`
  const worker = createMcpWorkerClient({ ...options, projectId, principal })
  const project = createWorkerProject(worker, projectId)
  let server: StdioServerHandle | undefined
  let closing: Promise<void> | undefined
  let stoppedResolve: () => void
  const stopped = new Promise<undefined>((resolve) => {
    stoppedResolve = () => resolve(undefined)
  })
  /** Release signal/EOF listeners first, SDK admission next, owned worker last. */
  function close() {
    stoppedResolve()
    process.off('SIGINT', onStop)
    process.off('SIGTERM', onStop)
    process.stdin.off('end', onStop)
    process.stdin.off('close', onStop)
    return closing ??= (async () => {
      try {
        await server?.close()
      }
      finally { await worker.close() }
    })()
  }
  /** Signal and pipe callbacks observe failure without an unhandled rejection. */
  function onStop() {
    void close().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
  process.on('SIGINT', onStop)
  process.on('SIGTERM', onStop)
  process.stdin.once('end', onStop)
  process.stdin.once('close', onStop)
  void worker.exited.then(() => {
    if (!closing) {
      console.error('Histoire MCP project worker exited')
      process.exitCode = 1
      onStop()
    }
  })
  if (process.stdin.readableEnded || process.stdin.destroyed) onStop()
  if (!closing) {
    // SDK starts reading immediately and buffers opening messages while its
    // asynchronous factory awaits worker boot. Early EOF is therefore observed
    // without consuming or losing protocol bytes ourselves.
    server = serveStdio(async () => {
      const boot = await worker.ready
      const extension = createOperationServerExtension(createWorkerOperations(worker, boot.executors))
      return createHistoireMcpServer({ project, principal, version: readHistoireVersion(), observeClientName: worker.setClientName, observeReadTool: worker.observeReadTool, ...extension })
    }, { onerror: error => console.error(error.message) })
  }
  // Ownership listeners exist before any asynchronous worker imports. EOF or a
  // signal during bootstrap cancels launch without waiting for project readiness.
  try {
    const boot = await Promise.race([worker.ready, stopped])
    if (!boot || closing) await close()
  }
  catch (error) {
    await close()
    throw error
  }
  return { project, worker, close }
}
