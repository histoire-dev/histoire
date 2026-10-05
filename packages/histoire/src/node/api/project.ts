import type { ProjectServices } from './internal.js'
import type { HistoireHostingSnapshot, HistoireProject, HistoireProjectOptions, HistoireProjectSnapshot } from './types.js'
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HistoireSdkError } from '@histoire/protocol'
import { hasUnconfirmedCleanup } from '../runtime/cleanup.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { createManagedHosting } from '../runtime/hosting/managed.js'
import { createMiddlewareHosting } from '../runtime/hosting/middleware.js'
import { buildProject } from './build.js'
import { captureProjectScreenshot } from './capture.js'
import { registerProjectServices } from './internal.js'
import { previewProject } from './preview.js'
import { runProjectTests } from './tests.js'

/** Constructs idle ownership from explicit paths; configuration evaluates on first operation. */
export async function createHistoireProject(options: HistoireProjectOptions): Promise<HistoireProject> {
  if (!options || typeof options.root !== 'string' || !options.root) throw new HistoireSdkError('INVALID_ARGUMENT', 'root must be an explicit project directory')
  let root: string
  let configFile: string | undefined
  try {
    root = await realpath(resolve(options.root))
    if (!(await stat(root)).isDirectory()) throw new Error('Not a directory')
    if (options.configFile !== undefined && typeof options.configFile !== 'string') throw new Error('Invalid config path')
    configFile = options.configFile === undefined ? undefined : resolve(root, options.configFile)
    if (configFile && !(await stat(configFile)).isFile()) throw new Error('Not a config module')
  }
  catch {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'root and configFile must resolve to an existing project directory and configuration module')
  }
  const services: ProjectServices = { root, configFile, execution: createExecutionService() }
  const projectId = randomUUID()
  const listeners = new Set<(snapshot: HistoireProjectSnapshot) => void>()
  const operations = new Set<Promise<unknown>>()
  let devClaimed = false
  let previewClaimed = false
  let closed = false
  let closing: Promise<void> | undefined
  let unsafeCleanupError: unknown
  let snapshot: HistoireProjectSnapshot = Object.freeze({ status: 'idle', dev: null, preview: null })
  /** Rejects new acquisition before creating any project resource. */
  function assertOpen() {
    if (closed) throw new HistoireSdkError('DISPOSED', 'Histoire project closed')
  }
  /** Publishes one coherent detached observation after source state has changed. */
  function publish() {
    const dev = services.dev
    const preview = services.preview
    const projectDev: HistoireHostingSnapshot | null = dev ? Object.freeze({ status: dev.handle.status, url: dev.handle.url || null, epoch: dev.controller.current?.epoch ?? null, catalog: dev.catalog?.current?.catalog ?? null }) : null
    const projectPreview: HistoireHostingSnapshot | null = preview ? Object.freeze({ status: preview.handle.status, url: preview.handle.url || null, epoch: preview.current?.epoch ?? null, catalog: preview.current?.snapshot.catalog ?? null }) : null
    snapshot = Object.freeze({ status: closed ? 'closed' : projectDev?.status ?? projectPreview?.status ?? (devClaimed || previewClaimed ? 'starting' : 'idle'), dev: projectDev, preview: projectPreview })
    for (const listener of [...listeners]) {
      try {
        listener(snapshot)
      }
      catch (error) {
        console.error(error)
      }
    }
  }
  /** Joins active operations and retains unknown cleanup after their promises settle. */
  function track<T>(promise: Promise<T>): Promise<T> {
    operations.add(promise)
    void promise.catch((error) => {
      if (hasUnconfirmedCleanup(error)) {
        unsafeCleanupError ??= error
        services.execution.quarantine()
      }
    }).finally(() => {
      operations.delete(promise)
    }).catch(() => {})
    return promise
  }
  /** Reserves dev slot before asynchronous acquisition to prevent duplicate resources. */
  function claimDev() {
    assertOpen()
    if (devClaimed) throw new HistoireSdkError('RUNTIME_IN_USE', 'Development runtime already in use')
    devClaimed = true
    publish()
    return { root, configFile, projectId, execution: services.execution, onChange: publish, onClose() {
      devClaimed = false
      services.dev = undefined
      publish()
    } }
  }
  const project: HistoireProject = {
    async startDev(options = {}) {
      const common = claimDev()
      try {
        // Publication can synchronously close the project before acquisition.
        assertOpen()
        // Caller option bags cannot replace project-owned root, lane or cleanup.
        const hosting = createManagedHosting({ ...options, ...common })
        services.dev = hosting
        publish()
        await hosting.acquired
        if (closed) throw new HistoireSdkError('DISPOSED', 'Histoire project closed')
        return hosting.handle
      }
      catch (error) {
        try {
          await services.dev?.handle.close()
        }
        catch (cleanupError) {
          throw new AggregateError([error, cleanupError], String(error))
        }
        devClaimed = false
        publish()
        throw error
      }
    },
    async createMiddleware(options) {
      const common = claimDev()
      try {
        assertOpen()
        const hosting = createMiddlewareHosting({ ...options, ...common })
        services.dev = hosting
        publish()
        return hosting.handle
      }
      catch (error) {
        devClaimed = false
        publish()
        throw error
      }
    },
    build(options) {
      assertOpen()
      return track(buildProject(root, configFile, options))
    },
    async preview(options = {}) {
      assertOpen()
      if (previewClaimed) throw new HistoireSdkError('RUNTIME_IN_USE', 'Preview runtime already in use')
      previewClaimed = true
      publish()
      return track((async () => {
        try {
          assertOpen()
          const hosting = await previewProject(root, configFile, { ...options, execution: services.execution, onChange: publish, onClose() {
            previewClaimed = false
            services.preview = undefined
            publish()
          } })
          services.preview = hosting
          if (closed) {
            await hosting.handle.close()
            throw new HistoireSdkError('DISPOSED', 'Histoire project closed')
          }
          publish()
          return hosting.handle
        }
        catch (error) {
          if (!hasUnconfirmedCleanup(error)) previewClaimed = false
          publish()
          throw error
        }
      })())
    },
    runTests(options) {
      assertOpen()
      return track(runProjectTests(services, options))
    },
    captureScreenshot(options) {
      assertOpen()
      return track(captureProjectScreenshot(services, options))
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      assertOpen()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    close() {
      if (!closing) {
        closed = true
        const completion = Promise.withResolvers<void>()
        // Register close before owned handles or publication can reenter it.
        closing = completion.promise.finally(() => {
          listeners.clear()
        })
        void (async () => {
          const devClose = services.dev?.handle.close()
          const previewClose = services.preview?.handle.close()
          const executionClose = services.execution.close()
          publish()
          // A cancelled operation still joins its final cleanup. Ordinary operation
          // errors belong to its caller; unsafe teardown also rejects project close.
          const joined = [...operations].map(operation => operation.catch((error) => {
            if (hasUnconfirmedCleanup(error)) throw error
          }))
          const results = await Promise.allSettled([devClose, previewClose, executionClose, ...joined])
          if (unsafeCleanupError) throw unsafeCleanupError
          const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
          if (failure) throw failure.reason
        })().then(completion.resolve, completion.reject)
      }
      return closing
    },
  }
  registerProjectServices(project, services)
  return project
}
