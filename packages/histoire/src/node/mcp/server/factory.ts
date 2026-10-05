import type { HistoireMcpProject } from '../project/facade.js'
import type { McpReadToolObserver } from './read-tools.js'
import type { McpExtraResourceReader } from './resources.js'
import { McpServer } from '@modelcontextprotocol/server'
import { registerReadTools } from './read-tools.js'
import { registerReadResources } from './resources.js'

/** Shared server assembly inputs, with injected metadata for standalone bundles. */
export interface HistoireMcpServerOptions {
  /** Transport-neutral controller facade, shared across fresh SDK instances. */
  project: HistoireMcpProject
  /** Stable authenticated principal; never a credential or per-request random ID. */
  principal: string
  /** Actual Histoire package version supplied by CLI or deployment manifest. */
  version: string
  /** Additional implemented tool/resource discovery registrations. */
  register?: (server: McpServer, options: HistoireMcpServerOptions) => void
  /** Shared resolver for registered operation/artifact resources. */
  readResource?: McpExtraResourceReader
  /** Optional dev UI receives only SDK client display names. */
  observeClientName?: (name: string) => void
  /** Explicit public read-tool activity; resource callbacks remain unobserved. */
  observeReadTool?: McpReadToolObserver
}

/** Create a fresh SDK instance while lifecycle and operation state stay in project. */
export function createHistoireMcpServer(options: HistoireMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'histoire', version: options.version }, {
    instructions: 'Explore this Histoire book with project, story, docs, source and preview reads. When execution tools are available, start a screenshot, rendered inspection or test job, then poll its operation handle until terminal. Rendered inspection uses a fresh isolated variant, not unsaved changes in an open preview.',
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
  })
  registerReadTools(server, options.project, options.observeClientName, options.observeReadTool)
  // Extensions register discovery first; the final raw reader owns dispatch.
  options.register?.(server, options)
  registerReadResources(server, options.project, options.principal, options.readResource)
  return server
}
