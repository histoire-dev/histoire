import { z } from 'zod/v4'
import { mcpIdSchema } from './ids.js'
import { mcpByteLength } from './limits.js'
import { mcpPreviewInputFields } from './preview-input.js'

/** Exact implemented inspection kinds and their public tool identities. */
export const MCP_INSPECTION_TOOLS = {
  'inspect-variant': 'histoire_inspect_variant',
  'inspect-dom': 'histoire_inspect_dom',
  'inspect-accessibility': 'histoire_inspect_accessibility',
  'runtime-diagnostics': 'histoire_get_runtime_diagnostics',
} as const
/** Finite CSS query, never caller JavaScript. */
const selector = z.string().min(1).max(512).default('body')
/** Strict browser inspection arguments with shared screenshot appearance policy. */
export const mcpInspectionInputSchemas = {
  histoire_inspect_variant: z.strictObject(mcpPreviewInputFields),
  histoire_inspect_dom: z.strictObject({
    ...mcpPreviewInputFields,
    /** Root CSS selector; first match is inspected. */
    selector,
    /** Maximum retained element nodes. */
    maxNodes: z.number().int().min(1).max(500).default(200),
    /** Maximum subtree depth, with root at zero. */
    maxDepth: z.number().int().min(0).max(20).default(8),
  }),
  histoire_inspect_accessibility: z.strictObject({
    ...mcpPreviewInputFields,
    /** Root CSS selector; first match is inspected. */
    selector,
    /** Maximum retained ARIA snapshot characters. */
    maxCharacters: z.number().int().min(1).max(32768).default(16384),
  }),
  histoire_get_runtime_diagnostics: z.strictObject({
    ...mcpPreviewInputFields,
    /** Additional bounded observation after preview readiness. */
    observationMs: z.number().int().min(0).max(2000).default(250),
  }),
} as const
/** Shared target and CSS viewport on every inspection result. */
const base = {
  /** Exact registered story inspected. */
  storyId: mcpIdSchema,
  /** Exact rendered variant inspected. */
  variantId: mcpIdSchema,
  /** Requested CSS viewport, independent of screenshot device pixels. */
  viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  /** Projection, traversal or serialized byte budget omitted content. */
  truncated: z.boolean(),
}
/** Projected automatic prop definition; callbacks and private metadata are absent. */
const prop = z.strictObject({
  /** Framework-reported prop identity. */
  name: z.string().max(256),
  /** Available framework type labels. */
  types: z.array(z.string().max(128)).max(16).optional(),
  /** Framework-reported requirement. */
  required: z.boolean().optional(),
  /** Descriptive default; function defaults are never invoked here. */
  default: z.json().optional(),
  /** Current value, preferring runtime automatic prop overrides. */
  value: z.json().optional(),
  /** Available enum choices reported by framework. */
  values: z.array(z.json()).optional(),
})
/** Element geometry remains in CSS viewport coordinates. */
const rect = z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
/** Bounded runtime telemetry excludes headers, bodies and argument objects. */
export const mcpRuntimeDiagnosticSchema = z.strictObject({
  /** Finite observed event category. */
  kind: z.enum(['console', 'page-error', 'request-failed', 'http-error']),
  /** Browser console severity when provided. */
  level: z.string().max(32).optional(),
  /** Bounded sanitized text without argument objects or stacks. */
  message: z.string().max(4096),
  /** HTTP(S) resource without userinfo, query or fragment. */
  url: z.string().max(4096).optional(),
  /** Observed HTTP failure status. */
  status: z.number().int().optional(),
})
/** Discriminated detached results, shared by polling, resources and worker validation. */
export const mcpInspectionResultSchema = z.discriminatedUnion('inspection', [
  z.strictObject({
    ...base,
    /** Rendered state and prop metadata result. */
    inspection: z.literal('variant'),
    /** Detached JSON excluding runtime-owned fields. */
    state: z.record(z.string(), z.json()),
    /** Distinguishes unavailable automatic metadata from zero components. */
    propsAvailable: z.boolean(),
    /** Bounded automatic component/prop definitions. */
    components: z.array(z.strictObject({ name: z.string().max(256), index: z.number().int().nonnegative(), props: z.array(prop).max(100) })).max(100),
    /** Count of values or fields omitted during projection. */
    omittedValues: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...base,
    /** Bounded element subtree result. */
    inspection: z.literal('dom'),
    /** CSS selector found a root even if its tag was excluded. */
    matched: z.boolean(),
    /** Preorder elements with stable indexes within this snapshot. */
    nodes: z.array(z.strictObject({
      /** Position in retained list. */
      index: z.number().int().nonnegative(),
      /** Retained parent position; null denotes root. */
      parentIndex: z.number().int().nonnegative().nullable(),
      /** Element local name. */
      tag: z.string().max(128),
      /** Selected descriptive attributes; input values are excluded. */
      attributes: z.record(z.string(), z.string().max(512)),
      /** Direct text avoids duplication of descendant content. */
      text: z.string().max(1000),
      /** Bounding box in CSS viewport pixels. */
      rect,
      /** Fixed computed-style property selection. */
      styles: z.record(z.string(), z.string().max(512)),
    })).max(500),
  }),
  z.strictObject({
    ...base,
    /** Playwright accessibility structure, without compliance assertions. */
    inspection: z.literal('accessibility'),
    /** CSS selector matched a root. */
    matched: z.boolean(),
    /** Possibly truncated ARIA YAML. */
    snapshot: z.string().max(32768),
    /** Original snapshot length before character/byte truncation. */
    totalCharacters: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...base,
    /** Fresh mount console/page/network telemetry. */
    inspection: z.literal('diagnostics'),
    /** False when captured evidence explains a mount/readiness failure. */
    previewReady: z.boolean(),
    /** Bounded session failure explanation. */
    readinessError: z.string().max(4096).optional(),
    /** Retained complete sanitized telemetry rows. */
    entries: z.array(mcpRuntimeDiagnosticSchema).max(100),
    /** Number of rows omitted by count or byte limits. */
    droppedCount: z.number().int().nonnegative(),
  }),
]).refine(value => mcpByteLength(JSON.stringify(value)) <= 64 * 1024, 'Inspection result exceeds 64 KiB')
/** Public detached inspection DTO. */
export type McpInspectionResult = z.infer<typeof mcpInspectionResultSchema>
/** Parsed public input shared by concrete isolated inspection executors. */
export type McpInspectionInput = z.infer<(typeof mcpInspectionInputSchemas)[keyof typeof mcpInspectionInputSchemas]>
