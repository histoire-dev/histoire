import type { createProjectRuntimeController } from '../../runtime/controller.js'
import type { ProjectRuntimeHandle } from '../../runtime/types.js'
import type { McpProject } from '../protocol/project-schema.js'
import type { HistoireMcpProject } from './facade.js'
import { McpDomainError } from '../protocol/errors.js'
import { createMcpEpoch } from '../protocol/ids.js'
import { detectDevMcpCapabilities } from './capabilities.js'
import { createProjectContent } from './content.js'
import { withExecutionAvailability } from './execution-capabilities.js'
import { createPreviewUrls } from './preview-urls.js'
import { attachProjectCatalog } from './runtime-catalog.js'
import { createStoryResult } from './story-result.js'

/** Controller methods required by dev reads, injectable without acquiring a runtime. */
export type McpRuntimeController = Pick<ReturnType<typeof createProjectRuntimeController>, 'current' | 'status' | 'subscribe'>
/** One attached generation; private context never enters the public facade type. */
interface DevReadGeneration {
  /** Captured runtime owner. */
  handle: ProjectRuntimeHandle
  /** Generation-owned immutable catalog bridge. */
  attached: ReturnType<typeof attachProjectCatalog>
  /** Allowlisted docs/source service. */
  content: ReturnType<typeof createProjectContent>
  /** Package availability cached for this generation. */
  capabilities: McpProject['capabilities']
  /** Catalog initialization failed independently of listener readiness. */
  failed: boolean
}

/** Own catalog/content per generation while preserving one transport-neutral facade. */
export function createDevMcpProject(options: { controller: McpRuntimeController, projectId: string, secret?: string, executionAvailable?: () => boolean }) {
  const initialEpoch = createMcpEpoch()
  let generation: DevReadGeneration | undefined
  let closed = false
  let display = { title: 'Histoire', base: '/', routerMode: 'history' as 'hash' | 'history' }
  /** Attach only live handles; stop old publication before a new generation exists. */
  function synchronize() {
    const handle = closed ? undefined : options.controller.current
    if (generation?.handle === handle) return generation
    generation?.attached.close()
    generation = undefined
    if (handle?.isActive()) {
      const attached = attachProjectCatalog(handle, options)
      display = { title: handle.context.config.theme?.title ?? 'Histoire', base: handle.server.config.base ?? '/', routerMode: handle.context.config.routerMode ?? 'history' }
      const value: DevReadGeneration = { handle, attached, content: createProjectContent({ root: handle.context.root, catalog: attached.catalog }), capabilities: detectDevMcpCapabilities(handle.context.root), failed: false }
      generation = value
      void attached.ready.catch(() => {
        if (generation === value && handle.isActive()) value.failed = true
      })
    }
    return generation
  }
  /** Require active catalog, distinguishing lifecycle from a completed empty book. */
  function requireGeneration() {
    const value = synchronize()
    const status = closed ? 'closed' : options.controller.status
    if (status === 'closed') throw new McpDomainError('PROJECT_CLOSED', 'Project runtime is closed')
    if (status === 'restarting') throw new McpDomainError('PROJECT_RESTARTING', 'Project runtime is restarting', true)
    if (status === 'failed' || value?.failed) throw new McpDomainError('COLLECTION_FAILED', 'Project runtime failed', true)
    if (!value?.attached.catalog.current) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is starting', true)
    return value
  }
  /** Content awaits must never publish a superseded runtime's successful read. */
  function assertCaptured(value: DevReadGeneration, revision: string) {
    if (!value.handle.isActive() || synchronize() !== value) throw new McpDomainError('STALE_REVISION', 'Project generation changed during read', true)
    if (value.attached.catalog.current?.revision !== revision) throw new McpDomainError('STALE_REVISION', 'Catalog revision changed during read', true)
  }
  const off = options.controller.subscribe(() => synchronize())
  synchronize()
  const project: HistoireMcpProject = {
    projectId: options.projectId,
    getProject() {
      const value = synchronize()
      const snapshot = value?.attached.catalog.current
      const status = closed ? 'closed' : options.controller.status
      return {
        projectId: options.projectId,
        epoch: value?.handle.epoch ?? initialEpoch,
        runtimeMode: 'dev',
        status: status === 'ready' && (snapshot?.failed || value?.failed) ? 'failed' : status === 'ready' && !snapshot ? 'starting' : status,
        ...(snapshot ? { revision: snapshot.revision } : {}),
        updating: value?.attached.catalog.updating ?? false,
        ...display,
        storyCount: snapshot?.stories.length ?? 0,
        variantCount: snapshot?.stories.reduce((total, story) => total + story.variants.length, 0) ?? 0,
        capabilities: withExecutionAvailability(value?.capabilities ?? { catalog: false, content: false, previews: false, screenshots: { available: false, reason: 'Project is not ready' }, tests: { available: false, engine: 'unavailable', reason: 'Project is not ready' } }, options.executionAvailable?.() ?? true),
        diagnostics: snapshot ? [...snapshot.diagnostics] : value?.failed ? [{ code: 'COLLECTION_FAILED', message: 'Project catalog initialization failed' }] : [],
        diagnosticsTruncated: snapshot?.diagnosticsTruncated ?? false,
      }
    },
    listStories(input) {
      const result = requireGeneration().attached.catalog.list(input)
      return { ...result, diagnostics: [...result.diagnostics] }
    },
    getStory(input) { return createStoryResult(requireGeneration().attached.catalog.getStory(input.storyId, input.expectedRevision)) },
    async getDocs(input) {
      const value = requireGeneration()
      const result = await value.content.getDocs(input)
      assertCaptured(value, result.revision)
      return result
    },
    async getSource(input) {
      const value = requireGeneration()
      const result = await value.content.getSource(input)
      assertCaptured(value, result.revision)
      return result
    },
    getPreview(input) {
      const value = requireGeneration()
      const target = value.attached.catalog.getTarget(input.storyId, input.variantId, input.expectedRevision)
      const address = value.handle.server.resolvedUrls?.local[0] ?? value.handle.server.resolvedUrls?.network[0]
      if (!address) throw new McpDomainError('PREVIEW_NOT_READY', 'Preview server has not listened', true)
      return { projectId: options.projectId, revision: target.revision, storyId: input.storyId, variantId: input.variantId, ...createPreviewUrls({ ...display, origin: address, storyId: input.storyId, variantId: input.variantId }) }
    },
  }
  return {
    ...project,
    /** Capture synchronous private admission authority; never serialize this value. */
    capture() {
      const value = requireGeneration()
      return { handle: value.handle, catalog: value.attached.catalog, content: value.content }
    },
    /** Drop facade observers; transport lifecycle does not own the runtime itself. */
    close() {
      closed = true
      off()
      synchronize()
    },
  }
}
