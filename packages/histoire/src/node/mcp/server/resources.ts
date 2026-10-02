import type { McpServer, ReadResourceResult } from '@modelcontextprotocol/server'
import type { HistoireMcpProject } from '../project/facade.js'
import type { McpDocsResult, McpSourceResult } from '../protocol/content-schema.js'
import type { McpResourceAddress } from '../protocol/uris.js'
import { McpDomainError, toResourceError } from '../protocol/errors.js'
import { successResult } from '../protocol/results.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { decodeMcpResourceUri, encodeMcpResourceUri } from '../protocol/uris.js'
import { createReadResourceTemplates } from './resource-templates.js'

/** Optional operation/artifact resolver added only when their handlers exist. */
export type McpExtraResourceReader = (address: McpResourceAddress, uri: string, principal: string, signal?: AbortSignal) => ReadResourceResult | Promise<ReadResourceResult>

/** Raw text stays unmodified; revision/hash/paging metadata travels beside it. */
function textPageResult(uri: string, data: McpDocsResult | McpSourceResult): ReadResourceResult {
  successResult(data)
  const { text, ...metadata } = data
  return { contents: [{ uri, mimeType: data.kind === 'markdown' ? 'text/markdown' : 'text/plain', text, _meta: metadata }] }
}

/** Resolve original canonical URI before URL normalization can alter exact IDs. */
export async function readProjectResource(project: HistoireMcpProject, uri: string, principal: string, extra?: McpExtraResourceReader, signal?: AbortSignal): Promise<ReadResourceResult> {
  try {
    const address = decodeMcpResourceUri(uri, project.projectId)
    let data: unknown
    if (address.kind === 'project') data = await project.getProject(signal)
    else if (address.kind === 'story') data = await project.getStory({ storyId: address.storyId, expectedRevision: address.revision }, signal)
    else if (address.kind === 'docs') return textPageResult(uri, await project.getDocs(mcpToolInputSchemas.histoire_get_docs.parse({ storyId: address.storyId, expectedRevision: address.revision, offset: address.offset, limit: address.limit }), signal))
    else if (address.kind === 'source') return textPageResult(uri, await project.getSource(mcpToolInputSchemas.histoire_get_source.parse({ storyId: address.storyId, expectedRevision: address.revision, startLine: address.startLine, lineCount: address.lineCount }), signal))
    else if (extra) return await extra(address, uri, principal, signal)
    else throw new McpDomainError(address.kind === 'operation' ? 'OPERATION_NOT_FOUND' : 'ARTIFACT_NOT_FOUND', 'Resource is unavailable')
    // Apply the same total byte limit as tools; resource payload is data itself.
    successResult(data)
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] }
  }
  catch (error) { throw toResourceError(error, uri) }
}

/** Register SDK discovery and one supported raw-URI read handler for every resource. */
export function registerReadResources(server: McpServer, project: HistoireMcpProject, principal: string, extra?: McpExtraResourceReader) {
  const read = (uri: URL) => readProjectResource(project, uri.href, principal, extra)
  server.registerResource('histoire_project', encodeMcpResourceUri({ projectId: project.projectId, kind: 'project' }), { title: 'Served Histoire book', mimeType: 'application/json' }, read)
  for (const { name, title, mimeType, template } of createReadResourceTemplates(project.projectId)) {
    server.registerResource(name, template, { title, mimeType }, read)
  }
  // SDK 2.2.0's high-level reader calls new URL before matching templates.
  // Encoded dot-only story IDs normalize to a parent path. Public low-level
  // registration keeps strict SDK wire validation and the untouched URI.
  server.server.setRequestHandler('resources/read', (request, context) => readProjectResource(project, request.params.uri, principal, extra, context.mcpReq.signal))
}
