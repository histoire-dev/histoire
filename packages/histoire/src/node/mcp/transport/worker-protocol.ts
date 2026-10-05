import type { ReadResourceResult } from '@modelcontextprotocol/server'
import type { McpToolName } from '../protocol/tool-schema.js'
import { Buffer } from 'node:buffer'
import { z } from 'zod/v4'
import { McpDomainError, mcpErrorSchema } from '../protocol/errors.js'
import { mcpOperationSchema } from '../protocol/operation-schema.js'
import { mcpProjectSchema } from '../protocol/project-schema.js'
import { mcpToolInputSchemas, mcpToolOutputSchemas } from '../protocol/tool-schema.js'
import { MCP_READ_TOOLS } from '../server/read-tools.js'

/** Maximum serialized DTO frame; binary resource frames have a separate bound. */
export const WORKER_METADATA_BYTES = 128 * 1024
/** Base64 expansion of one 4 MiB artifact, with a bounded envelope. */
export const WORKER_BINARY_BYTES = 6 * 1024 * 1024
/** Fixed method registry; neither side accepts module names or arbitrary calls. */
export const workerMethods = {
  getProject: 'histoire_get_project',
  listStories: 'histoire_list_stories',
  getStory: 'histoire_get_story',
  getDocs: 'histoire_get_docs',
  getSource: 'histoire_get_source',
  getPreview: 'histoire_get_preview',
  admitScreenshot: 'histoire_capture_screenshot',
  admitTests: 'histoire_run_tests',
  inspectVariant: 'histoire_inspect_variant',
  inspectDom: 'histoire_inspect_dom',
  inspectAccessibility: 'histoire_inspect_accessibility',
  runtimeDiagnostics: 'histoire_get_runtime_diagnostics',
  getOperation: 'histoire_get_operation',
  cancelOperation: 'histoire_cancel_operation',
} as const satisfies Record<string, McpToolName>
/** Admission routing shared by worker discovery and its finite parent proxy. */
export const workerExecutionMethods = {
  'screenshot': 'admitScreenshot',
  'tests': 'admitTests',
  'inspect-variant': 'inspectVariant',
  'inspect-dom': 'inspectDom',
  'inspect-accessibility': 'inspectAccessibility',
  'runtime-diagnostics': 'runtimeDiagnostics',
} as const
/** Finite worker method identity. */
export type WorkerMethod = keyof typeof workerMethods | 'readResource'
/** Public DTO for every finite dispatch result; project runtime types stay private. */
export type WorkerResultMap = {
  [Name in keyof typeof workerMethods]: Extract<z.infer<(typeof mcpToolOutputSchemas)[(typeof workerMethods)[Name]]>, { ok: true }>['data']
} & { readResource: ReadResourceResult }
/** Parsed strict input DTO for every finite dispatch method. */
export type WorkerInputMap = {
  [Name in keyof typeof workerMethods]: z.infer<(typeof mcpToolInputSchemas)[(typeof workerMethods)[Name]]>
} & { readResource: { uri: string } }
/** Independent request capability, scoped to one parent process. */
const requestId = z.string().regex(/^[0-9a-f-]{36}:[1-9]\d{0,8}$/)
/** Project-owned resource contents, never arbitrary transport payloads. */
const resourceResult = z.strictObject({ contents: z.array(z.union([
  z.strictObject({ uri: z.string().max(8192), mimeType: z.string().optional(), text: z.string(), _meta: z.record(z.string(), z.json()).optional() }),
  z.strictObject({ uri: z.string().max(8192), mimeType: z.literal('image/png'), blob: z.string().regex(/^[A-Z0-9+/]*={0,2}$/i), _meta: z.record(z.string(), z.json()).optional() }),
])).max(1) })
/** Strict requests reject all unknown fields before method dispatch. */
const request = z.strictObject({ type: z.literal('request'), id: requestId, method: z.enum(['getProject', 'listStories', 'getStory', 'getDocs', 'getSource', 'getPreview', 'admitScreenshot', 'admitTests', 'inspectVariant', 'inspectDom', 'inspectAccessibility', 'runtimeDiagnostics', 'getOperation', 'cancelOperation', 'readResource']), input: z.json(), readTool: z.enum(MCP_READ_TOOLS).optional() })
  .refine(message => !message.readTool || workerMethods[message.method as keyof typeof workerMethods] === message.readTool, { message: 'Worker read observation must match its finite dispatch method' })
/** Finite parent messages. */
export const workerParentMessageSchema = z.union([
  request,
  z.strictObject({ type: z.literal('client-name'), name: z.string().min(1).max(128) }),
  z.strictObject({ type: z.literal('cancel'), id: requestId }),
  z.strictObject({ type: z.literal('shutdown') }),
])
/** Finite child messages; method-specific result validation happens afterwards. */
export const workerChildMessageSchema = z.union([
  z.strictObject({ type: z.literal('boot'), project: mcpProjectSchema, executors: z.strictObject({ 'screenshot': z.boolean(), 'tests': z.boolean(), 'inspect-variant': z.boolean().optional(), 'inspect-dom': z.boolean().optional(), 'inspect-accessibility': z.boolean().optional(), 'runtime-diagnostics': z.boolean().optional() }) }),
  z.strictObject({ type: z.literal('result'), id: requestId, data: z.json() }),
  z.strictObject({ type: z.literal('error'), id: requestId, error: mcpErrorSchema }),
  z.strictObject({ type: z.literal('closed') }),
])
/** Parsed parent message. */
export type WorkerParentMessage = z.infer<typeof workerParentMessageSchema>
/** Parsed child message. */
export type WorkerChildMessage = z.infer<typeof workerChildMessageSchema>

/** Reject oversized messages before schema traversal; never echo their contents. */
export function assertWorkerFrame(value: unknown, binary = false) {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (bytes > (binary ? WORKER_BINARY_BYTES : WORKER_METADATA_BYTES)) throw new McpDomainError('RESULT_TOO_LARGE', 'Histoire MCP worker message exceeds byte limit')
}

/** Only registered PNG resource results qualify for the larger frame budget. */
export function isWorkerBinaryResult(value: unknown): boolean {
  const message = value as { type?: string, data?: { contents?: { mimeType?: string, blob?: unknown }[] } }
  return message?.type === 'result' && message.data?.contents?.length === 1 && message.data.contents[0].mimeType === 'image/png' && typeof message.data.contents[0].blob === 'string'
}

/** Parse exact method inputs using public contracts rather than duplicate DTOs. */
export function parseWorkerInput<T extends WorkerMethod>(method: T, input: unknown): WorkerInputMap[T] {
  const parsed = method === 'readResource'
    ? z.strictObject({ uri: z.string().min(1).max(8192) }).parse(input)
    : mcpToolInputSchemas[workerMethods[method as keyof typeof workerMethods]].parse(input)
  return parsed as WorkerInputMap[T]
}

/** Validate worker output before any DTO reaches an SDK callback. */
export function parseWorkerResult(method: WorkerMethod, data: unknown) {
  if (method === 'readResource') return resourceResult.parse(data)
  if ([...Object.values(workerExecutionMethods), 'getOperation', 'cancelOperation'].includes(method as any)) return mcpOperationSchema.parse(data)
  const parsed = mcpToolOutputSchemas[workerMethods[method]].parse({ ok: true, data })
  if (parsed.ok) return parsed.data
  throw new Error('Invalid Histoire MCP worker result')
}
