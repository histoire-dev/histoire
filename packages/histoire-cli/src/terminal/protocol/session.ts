/**
 * Session information DTOs (slice 04). Type-and-constant only, so the parent can
 * load it before binding its listener. Contains no credentials and no environment.
 */
import { TERMINAL_BOUNDS, truncateText } from './core.js'

/** Longest retained string of the session DTO (paths, versions, URLs). */
export const SESSION_TEXT_MAX = 1024

/** Collection summary of the current generation; absent until a collection completed. */
export interface SessionCollectionDto {
  /** Registered stories in the completed catalog. */
  stories: number
  /** Variants across those stories. */
  variants: number
  /** Completed collection category. */
  outcome: 'success' | 'partial' | 'failed'
  /** Bounded safe issues of the collection. */
  diagnostics: number
}

/** Optional MCP adapter state; the bearer credential is never part of it. */
export interface SessionMcpDto {
  enabled: boolean
  /** Actual bound URL when the adapter listens. */
  url?: string
  /** A bearer token is required by clients. */
  tokenRequired?: boolean
}

/** Result of `session.get`: facts only the current runtime generation knows. */
export interface SessionInfoDto {
  /** Installed Histoire version of the runtime. */
  histoire: string
  /** Node.js version of the runtime process. */
  node: string
  /** Vite version loaded by the runtime. */
  vite: string
  /** Project root. */
  root: string
  /** Resolved Histoire config file; absent when none exists. */
  configFile?: string
  /** Completed collection summary. */
  collection?: SessionCollectionDto
  /** MCP adapter state. */
  mcp: SessionMcpDto
}

/** Operations added by the session domain. */
export interface SessionOperations {
  'session.get': { args: Record<string, never>, result: SessionInfoDto }
}

/**
 * Bounds a text field of the DTO.
 * @param value Candidate text.
 */
export function boundSessionText(value: string): string {
  return truncateText(value, SESSION_TEXT_MAX).text
}

/**
 * Validates an untrusted `session.get` result in the parent; anything else is discarded.
 * @param value Candidate payload.
 */
export function isSessionInfo(value: unknown): value is SessionInfoDto {
  if (!value || typeof value !== 'object') return false
  const info = value as Record<string, unknown>
  const text = (field: unknown) => typeof field === 'string' && field.length <= TERMINAL_BOUNDS.logTextLength
  const mcp = info.mcp as Record<string, unknown> | undefined
  return text(info.histoire) && text(info.node) && text(info.vite) && text(info.root)
    && (info.configFile === undefined || text(info.configFile))
    && !!mcp && typeof mcp === 'object' && typeof mcp.enabled === 'boolean' && (mcp.url === undefined || text(mcp.url))
}
