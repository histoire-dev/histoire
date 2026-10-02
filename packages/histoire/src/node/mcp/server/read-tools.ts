import type { McpServer } from '@modelcontextprotocol/server'
import type { HistoireMcpProject } from '../project/facade.js'
import { errorResult, successResult } from '../protocol/results.js'
import { mcpToolInputSchemas, mcpToolOutputSchemas } from '../protocol/tool-schema.js'

/** Exactly the read milestone tools, shared by both serving transports. */
export const MCP_READ_TOOLS = ['histoire_get_project', 'histoire_list_stories', 'histoire_get_story', 'histoire_get_docs', 'histoire_get_source', 'histoire_get_preview'] as const
/** Read metadata never launches browsers or causes extra collection. */
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** Project expected domain failures to one tool result adapter. */
export async function readToolResult(read: () => unknown | Promise<unknown>) {
  try {
    return successResult(await read())
  }
  catch (error) { return errorResult(error) }
}

/** Register only implemented read services, with strict input/output schemas. */
export function registerReadTools(server: McpServer, project: HistoireMcpProject) {
  server.registerTool('histoire_get_project', { description: 'Read served book lifecycle and available capabilities.', inputSchema: mcpToolInputSchemas.histoire_get_project, outputSchema: mcpToolOutputSchemas.histoire_get_project, annotations }, (_input, context) => readToolResult(() => project.getProject(context.mcpReq.signal)))
  server.registerTool('histoire_list_stories', { description: 'Search and page collected stories from a completed catalog snapshot.', inputSchema: mcpToolInputSchemas.histoire_list_stories, outputSchema: mcpToolOutputSchemas.histoire_list_stories, annotations }, (input, context) => readToolResult(() => project.listStories(input, context.mcpReq.signal)))
  server.registerTool('histoire_get_story', { description: 'Read exact story metadata and associated resource links.', inputSchema: mcpToolInputSchemas.histoire_get_story, outputSchema: mcpToolOutputSchemas.histoire_get_story, annotations }, (input, context) => readToolResult(() => project.getStory(input, context.mcpReq.signal)))
  server.registerTool('histoire_get_docs', { description: 'Read original documentation by Unicode character page.', inputSchema: mcpToolInputSchemas.histoire_get_docs, outputSchema: mcpToolOutputSchemas.histoire_get_docs, annotations }, (input, context) => readToolResult(() => project.getDocs(input, context.mcpReq.signal)))
  server.registerTool('histoire_get_source', { description: 'Read raw registered source by original line page.', inputSchema: mcpToolInputSchemas.histoire_get_source, outputSchema: mcpToolOutputSchemas.histoire_get_source, annotations }, (input, context) => readToolResult(() => project.getSource(input, context.mcpReq.signal)))
  server.registerTool('histoire_get_preview', { description: 'Resolve exact story/variant UI and sandbox links without opening a browser.', inputSchema: mcpToolInputSchemas.histoire_get_preview, outputSchema: mcpToolOutputSchemas.histoire_get_preview, annotations }, (input, context) => readToolResult(() => project.getPreview(input, context.mcpReq.signal)))
}
