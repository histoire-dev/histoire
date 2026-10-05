import type { LaunchPreviewBrowser } from '../mcp/browser/dependencies.js'
import type { McpOperations } from '../mcp/operations/store.js'
import type { NodeExecutionValue } from './execution.js'
import { createServer } from 'node:http'
import { readBuiltEmbedPolicy } from '../config/embed-built.js'
import { registerNodeInspectionExecutors } from '../mcp/browser/inspection/node.js'
import { createPreviewHostRegistry } from '../mcp/browser/preview-host.js'
import { registerNodeTestExecutor } from '../mcp/browser/preview-tests.js'
import { createMcpOperations } from '../mcp/operations/store.js'
import { withExecutionAvailability } from '../mcp/project/execution-capabilities.js'
import { McpDomainError } from '../mcp/protocol/errors.js'
import { createHistoireMcpServer } from '../mcp/server/factory.js'
import { createOperationServerExtension } from '../mcp/server/operation-tools.js'
import { createMcpBearerPrincipal } from '../mcp/transport/http-auth.js'
import { createMcpHttpHandler } from '../mcp/transport/http.js'
import { tryResolveDependency } from '../util/resolve-package.js'
import { readNodeArtifact } from './artifact-reader.js'
import { registerNodeScreenshotExecutor } from './execution.js'
import { createNodeHttpHandler } from './http.js'
import { closeNodeListener } from './lifecycle.js'
import { resolveNodeOptions } from './options.js'
import { createNodeMcpProject } from './project.js'

/** Embedding/startup seam; default entry supplies immutable artifact directory. */
export interface CreateNodeServerOptions {
  /** Directory containing generated public/private artifact layout. */
  artifactDirectory: string
  /** Explicit environment fixture; defaults to process environment. */
  environment?: NodeJS.ProcessEnv
  /** Only --mcp/--no-mcp are accepted. */
  arguments?: string[]
  /** Optional browser acquisition injection for focused lifecycle proof. */
  launch?: LaunchPreviewBrowser
  /** Compiled test engine registers here without changing generic server layers. */
  registerExecutors?: (operations: McpOperations<NodeExecutionValue>, value: NodeExecutionValue) => void
}

/** Start portable book/MCP listener after complete artifact and policy validation. */
export async function createNodeServer(input: CreateNodeServerOptions) {
  const artifact = await readNodeArtifact(input.artifactDirectory)
  const embed = await readBuiltEmbedPolicy(artifact.publicDir, { target: 'node', originOverride: (input.environment ?? process.env).HISTOIRE_EMBED_ORIGINS })
  const settings = resolveNodeOptions(artifact.manifest.mcpEnabled, input.environment, input.arguments)
  const host = createPreviewHostRegistry({ base: artifact.manifest.base })
  let active = true
  let ready = false
  let origin = ''
  let publicOrigin = settings.publicOrigin ?? ''
  let transport: ReturnType<typeof createMcpHttpHandler> | undefined
  let closing: Promise<void> | undefined
  let operations: McpOperations<NodeExecutionValue>
  const browserAvailable = !!input.launch || !!tryResolveDependency(artifact.root, 'playwright')
  const authority = createNodeMcpProject({ artifact, origin: () => publicOrigin, isActive: () => active, capabilities: () => {
    const screenshots = browserAvailable && operations.hasExecutor('screenshot') && operations.available
    const inspection = browserAvailable && operations.hasExecutor('inspect-variant') && operations.available
    const tests = browserAvailable && artifact.manifest.testRuntimeIncluded && operations.hasExecutor('tests') && operations.available
    return withExecutionAvailability({ catalog: true, content: true, previews: true, screenshots: { available: screenshots, ...(!screenshots ? { reason: 'Install playwright and Chromium to capture screenshots' } : {}) }, inspection: { available: inspection, ...(!inspection ? { reason: 'Install playwright and Chromium to inspect rendered variants' } : {}) }, tests: { available: tests, engine: tests ? 'built-preview' : 'unavailable', ...(!tests ? { reason: artifact.manifest.testRuntimeIncluded ? 'Compiled test runner or Playwright is unavailable' : 'Artifact does not include embedded tests' } : {}) } }, operations.available)
  } })
  const value: NodeExecutionValue = {
    artifact,
    catalog: authority.catalog,
    host,
    get origin() { return origin },
  }
  operations = createMcpOperations({ capture: () => {
    if (!active || !ready) throw new McpDomainError('PROJECT_CLOSED', 'Deployed project is closing')
    return { projectId: authority.project.projectId, epoch: authority.epoch, revision: authority.revision, value, isActive: () => active && ready, validate(target) {
      const selected = authority.catalog.getStory(target.storyId, target.expectedRevision)
      if (target.variantId !== undefined) {
        authority.catalog.getTarget(target.storyId, target.variantId, target.expectedRevision)
      }
      else {
        if (selected.story.docsOnly) throw new McpDomainError('VARIANT_NOT_FOUND', 'Documentation story has no executable variants')
        for (const variant of selected.story.variants) authority.catalog.getTarget(target.storyId, variant.id, target.expectedRevision)
      }
    } }
  } })
  registerNodeScreenshotExecutor(operations, input.launch)
  registerNodeInspectionExecutors(operations, input.launch, settings.token)
  registerNodeTestExecutor(operations, input.launch, settings.token)
  input.registerExecutors?.(operations, value)
  const extension = createOperationServerExtension(operations)
  const handler = createNodeHttpHandler({ artifact, host, ready: () => ready, mcp: () => transport, embedOrigins: embed?.allowedOrigins })
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => response.destroy())
  })
  /** Stop admission before aborting owned work; always release listener afterward. */
  function close() {
    if (closing) return closing
    active = false
    ready = false
    host.close()
    closing = (async () => {
      const results = await Promise.allSettled([operations.close(), transport?.close(), closeNodeListener(server)])
      const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (failures.length) throw new AggregateError(failures, 'Histoire deployment cleanup could not be confirmed')
    })()
    return closing
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(settings.port, settings.host, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Deployed server did not bind TCP address')
    const internalHost = ['0.0.0.0', '::'].includes(address.address) ? '127.0.0.1' : address.address.includes(':') ? `[${address.address}]` : address.address
    origin = `http://${internalHost}:${address.port}`
    publicOrigin ||= origin
    if (settings.mcpEnabled) {
      const principal = createMcpBearerPrincipal(settings.token!)
      transport = createMcpHttpHandler(() => createHistoireMcpServer({ project: authority.project, principal, version: artifact.manifest.histoireVersion, ...extension }), { mode: 'protected-node', origin: publicOrigin, path: `${artifact.manifest.base}__histoire/mcp`, token: settings.token, principal })
    }
    ready = true
    return { server, artifact, project: authority.project, operations, value, origin, publicOrigin, mcpUrl: settings.mcpEnabled ? `${publicOrigin}${artifact.manifest.base}__histoire/mcp` : undefined, close }
  }
  catch (error) {
    await close()
    throw error
  }
}
