import { z } from 'zod/v4'
import { McpDomainError } from './errors.js'
import { mcpHandleSchema, mcpIdSchema, mcpProjectIdSchema, mcpRevisionSchema } from './ids.js'
import { MCP_LIMITS } from './limits.js'

/** Valid resource address, resolved by catalog/operations rather than filesystem paths. */
const addressSchema = z.discriminatedUnion('kind', [
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('project') }),
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('story'), storyId: mcpIdSchema, revision: mcpRevisionSchema.optional() }),
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('docs'), storyId: mcpIdSchema, revision: mcpRevisionSchema.optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(MCP_LIMITS.maxDocsCharacters).optional() }),
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('source'), storyId: mcpIdSchema, revision: mcpRevisionSchema.optional(), startLine: z.number().int().positive().optional(), lineCount: z.number().int().min(1).max(MCP_LIMITS.maxSourceLines).optional() }),
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('operation'), operationId: mcpHandleSchema, offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }),
  z.strictObject({ projectId: mcpProjectIdSchema, kind: z.literal('artifact'), artifactId: mcpHandleSchema }),
])
/** Canonical public resource address. */
export type McpResourceAddress = z.infer<typeof addressSchema>

/** Encode exact ID as one RFC 3986 segment; dot-only segments never undergo URL normalization. */
export function encodeMcpUriSegment(value: string): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return /^\.+$/.test(value) ? encoded.replace(/\./g, '%2E') : encoded
}

/** Decode once and compare canonical re-encoding. A literal percent sequence remains a valid ID. */
function decodeSegment(value: string): string {
  const decoded = decodeURIComponent(value)
  if (encodeMcpUriSegment(decoded) !== value) {
    throw new Error('Noncanonical segment')
  }
  return decoded
}

/** Construct resource URI without URL parser's dot-segment or host normalization. */
export function encodeMcpResourceUri(input: McpResourceAddress): string {
  const value = addressSchema.parse(input)
  const query: [string, string][] = []
  let path: string
  if (value.kind === 'project') {
    path = 'project'
  }
  else if (value.kind === 'operation') {
    path = `operations/${value.operationId}`
    if (value.offset !== undefined) {
      query.push(['offset', String(value.offset)])
    }
    if (value.limit !== undefined) {
      query.push(['limit', String(value.limit)])
    }
  }
  else if (value.kind === 'artifact') {
    path = `artifacts/${value.artifactId}`
  }
  else {
    path = `stories/${encodeMcpUriSegment(value.storyId)}${value.kind === 'story' ? '' : `/${value.kind}`}`
    if (value.kind === 'docs') {
      if (value.offset !== undefined) {
        query.push(['offset', String(value.offset)])
      }
      if (value.limit !== undefined) {
        query.push(['limit', String(value.limit)])
      }
    }
    if (value.kind === 'source') {
      if (value.startLine !== undefined) {
        query.push(['startLine', String(value.startLine)])
      }
      if (value.lineCount !== undefined) {
        query.push(['lineCount', String(value.lineCount)])
      }
    }
    if (value.revision !== undefined) {
      query.push(['revision', value.revision])
    }
  }
  const suffix = query.map(([key, item]) => `${key}=${encodeMcpUriSegment(item)}`).join('&')
  return `histoire://${value.projectId}/${path}${suffix ? `?${suffix}` : ''}`
}

/** Parse exact resource shape and reject foreign projects, aliases, duplicate keys, and unknown fields. */
export function decodeMcpResourceUri(uri: string, expectedProjectId: string): McpResourceAddress {
  try {
    const match = /^histoire:\/\/([\w-]+)\/([^?#]+)(?:\?([^#]+))?$/.exec(uri)
    if (!match || match[1] !== expectedProjectId) {
      throw new Error('Unsupported or foreign resource')
    }
    const [collection, encodedId, content, extra] = match[2].split('/')
    const value: Record<string, unknown> = { projectId: match[1] }
    if (extra !== undefined) {
      throw new Error('Extra path segment')
    }
    if (collection === 'project' && encodedId === undefined) {
      value.kind = 'project'
    }
    else if (collection === 'stories' && encodedId) {
      if (content !== undefined && content !== 'docs' && content !== 'source') {
        throw new Error('Unknown story resource')
      }
      value.kind = content ?? 'story'
      value.storyId = decodeSegment(encodedId)
    }
    else if (collection === 'operations' && encodedId && content === undefined) {
      value.kind = 'operation'
      value.operationId = decodeSegment(encodedId)
    }
    else if (collection === 'artifacts' && encodedId && content === undefined) {
      value.kind = 'artifact'
      value.artifactId = decodeSegment(encodedId)
    }
    else {
      throw new Error('Unknown resource shape')
    }
    const seen = new Set<string>()
    for (const pair of match[3]?.split('&') ?? []) {
      const parts = pair.split('=')
      if (parts.length !== 2 || seen.has(parts[0])) {
        throw new Error('Malformed or duplicate query')
      }
      const key = parts[0]
      seen.add(key)
      const item = decodeSegment(parts[1])
      if (key === 'revision') {
        value[key] = item
      }
      else {
        if (!/^(?:0|[1-9]\d*)$/.test(item) || !Number.isSafeInteger(Number(item))) {
          throw new Error('Invalid numeric query')
        }
        value[key] = Number(item)
      }
    }
    return addressSchema.parse(value)
  }
  catch {
    throw new McpDomainError('SOURCE_UNAVAILABLE', 'Invalid Histoire resource URI')
  }
}
