import type { ScreenshotSetupReason } from '@histoire/shared'
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
import { createScreenshotSetupOwner } from '../runtime/browser/setup/owner.js'
import { readNodeArtifact } from './artifact-reader.js'
import { registerNodeScreenshotExecutor } from './execution.js'
import { createNodeHttpHandler } from './http.js'
import { closeNodeListener } from './lifecycle.js'
import { resolveNodeBrowserPolicy, resolveNodeOptions } from './options.js'
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
  const environment = input.environment ?? process.env
  const embed = await readBuiltEmbedPolicy(artifact.publicDir, { target: 'node', originOverride: environment.HISTOIRE_EMBED_ORIGINS })
  const settings = resolveNodeOptions(artifact.manifest.mcpEnabled, environment, input.arguments)
  const browserPolicy = input.launch ? undefined : resolveNodeBrowserPolicy(environment, artifact.root)
  const host = createPreviewHostRegistry({ base: artifact.manifest.base })
  let active = true
  const setupOwner = browserPolicy && createScreenshotSetupOwner({ root: artifact.root, policy: browserPolicy, isActive: () => active })
  let ready = false
  let origin = ''
  let publicOrigin = settings.publicOrigin ?? ''
  let transport: ReturnType<typeof createMcpHttpHandler> | undefined
  let closing: Promise<void> | undefined
  let operations: McpOperations<NodeExecutionValue>
  /** Missing or invalid browser setup never affects catalog/content access. */
  function browserSetupAvailability() {
    if (input.launch) return { available: true as const }
    const snapshot = setupOwner?.getSnapshot()
    if (!snapshot) return { available: false as const, reason: 'Check browser setup on the deployment target' }
    const available = snapshot.state !== 'needs-action'
    return { available, ...(!available ? { reason: nodeBrowserSetupReason(snapshot.reason) } : {}) }
  }
  const authority = createNodeMcpProject({ artifact, origin: () => publicOrigin, isActive: () => active, capabilities: () => {
    const browser = browserSetupAvailability()
    const screenshots = browser.available && operations.hasExecutor('screenshot') && operations.available
    const inspection = browser.available && operations.hasExecutor('inspect-variant') && operations.available
    const tests = browser.available && artifact.manifest.testRuntimeIncluded && operations.hasExecutor('tests') && operations.available
    return withExecutionAvailability({ catalog: true, content: true, previews: true, screenshots: { available: screenshots, ...(!screenshots ? { reason: browser.reason ?? 'Screenshot capture is unavailable' } : {}) }, inspection: { available: inspection, ...(!inspection ? { reason: browser.reason ?? 'Rendered inspection is unavailable' } : {}) }, tests: { available: tests, engine: tests ? 'built-preview' : 'unavailable', ...(!tests ? { reason: artifact.manifest.testRuntimeIncluded ? browser.reason ?? 'Compiled test runner is unavailable' : 'Artifact does not include embedded tests' } : {}) } }, operations.available)
  } })
  const value: NodeExecutionValue = {
    artifact,
    catalog: authority.catalog,
    host,
    ...(setupOwner ? { setupOwner } : {}),
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
    closing = (async () => {
      const failures: unknown[] = []
      /** Continue in ownership order while retaining every cleanup failure. */
      async function release(closeResource: () => unknown | Promise<unknown>) {
        try {
          await closeResource()
        }
        catch (error) {
          failures.push(error)
        }
      }
      await release(() => operations.close())
      if (setupOwner) await release(() => setupOwner.close())
      await release(() => host.close())
      if (transport) await release(() => transport!.close())
      await release(() => closeNodeListener(server))
      if (failures.length) throw new AggregateError(failures, 'Histoire deployment cleanup could not be confirmed')
    })()
    return closing
  }
  try {
    if (setupOwner) await setupOwner.discover()
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

/** Gives MCP consumers a bounded next step without exposing target paths or stderr. */
function nodeBrowserSetupReason(reason?: ScreenshotSetupReason): string {
  switch (reason) {
    case 'driver-missing': return 'Install playwright or playwright-core to capture screenshots'
    case 'driver-invalid': return 'Repair the selected browser driver, then restart the deployed server'
    case 'browser-missing': return 'Install a supported browser with the selected driver'
    case 'driver-version': return 'Restart the deployed server after changing the browser driver'
    case 'system-dependencies': return 'Install the required browser system dependencies'
    case 'permission': return 'Check browser executable permissions and target environment'
    case 'unsupported-platform': return 'Use a supported browser and operating system for screenshot capture'
    case 'startup-failed': return 'Check browser setup on the deployment target'
    default: return 'Check browser setup on the deployment target'
  }
}
