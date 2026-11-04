/**
 * Runtime diagnostics DTOs (slice 06). Type-and-constant only, so the parent can load it
 * before binding its listener. Holds no credential, no MCP protocol arguments and no client
 * envelope beyond a sanitized display name.
 */

/** Bounds of the diagnostics reply. */
export const DIAGNOSTICS_BOUNDS = {
  /** Collection issues listed. */
  issues: 20,
  /** Longest issue message and client name (UTF-16 units). */
  text: 512,
  /** Connected MCP clients named. */
  clients: 10,
} as const

/** One safe collection issue. */
export interface DiagnosticIssueDto {
  /** Stable machine category, e.g. `COLLECTION_FAILED`. */
  code: string
  /** Sanitized explanation (project root and credential already removed by the catalog). */
  message: string
  /** Related project-relative file. */
  file?: string
  /** Related story. */
  storyId?: string
}

/** Collection diagnostics of the current generation's catalog. */
export interface DiagnosticsCollectionDto {
  /** Completed collection category. */
  outcome: 'success' | 'partial' | 'failed'
  stories: number
  variants: number
  /** Issues retained by the catalog (the listed ones are at most {@link DIAGNOSTICS_BOUNDS.issues}). */
  issues: number
  /** The catalog itself omitted further issues. */
  truncated: boolean
  /** First issues, bounded. */
  items: DiagnosticIssueDto[]
}

/** Safe MCP summary: availability, endpoint and who is connected. */
export interface DiagnosticsMcpDto {
  status: 'enabled' | 'disabled' | 'unavailable'
  /** Actual bound endpoint, without credentials. */
  endpoint?: string
  /** Clients must present a bearer token (the token itself is never included). */
  tokenRequired?: boolean
  /** Connected clients (display name and transport), at most {@link DIAGNOSTICS_BOUNDS.clients}. */
  clients: { name: string, transport: 'stdio' | 'http' }[]
  /** Connected clients beyond the named ones. */
  clientsOmitted: number
  /** Queued or running MCP operations. */
  activeOperations: number
}

/** Result of `diagnostics.get`; each section fails independently. */
export interface DiagnosticsDto {
  /** Absent until a collection completed, or when `problems.collection` is set. */
  collection?: DiagnosticsCollectionDto
  /** Absent only when `problems.mcp` is set. */
  mcp?: DiagnosticsMcpDto
  /** Sections that could not be read, with a one-line reason. */
  problems: { collection?: string, mcp?: string }
}

/** Operations added by the diagnostics domain. */
export interface DiagnosticsOperations {
  'diagnostics.get': { args: Record<string, never>, result: DiagnosticsDto }
}

/**
 * Validates an untrusted `diagnostics.get` result in the parent; anything else is discarded.
 * @param value Candidate payload.
 */
export function isDiagnostics(value: unknown): value is DiagnosticsDto {
  if (!value || typeof value !== 'object') return false
  const dto = value as Record<string, unknown>
  const problems = dto.problems as Record<string, unknown> | undefined
  if (!problems || typeof problems !== 'object') return false
  const collection = dto.collection as Record<string, unknown> | undefined
  if (collection !== undefined && (typeof collection !== 'object' || !['success', 'partial', 'failed'].includes(collection.outcome as string) || !Array.isArray(collection.items) || typeof collection.issues !== 'number')) return false
  const mcp = dto.mcp as Record<string, unknown> | undefined
  return mcp === undefined || (typeof mcp === 'object' && ['enabled', 'disabled', 'unavailable'].includes(mcp.status as string) && Array.isArray(mcp.clients))
}
