/** Shared admission, storage, content, and response bounds for every transport. */
import { Buffer } from 'node:buffer'

export const MCP_LIMITS = Object.freeze({
  /** Maximum encoded ID size. */
  idBytes: 2048,
  /** Maximum tool JSON payload size. */
  responseBytes: 128 * 1024,
  /** Maximum structured domain error details. */
  errorDetailsBytes: 16 * 1024,
  /** Maximum physical content read. */
  sourceBytes: 2 * 1024 * 1024,
  /** Default catalog page size. */
  pageSize: 50,
  /** Maximum catalog page size. */
  maxPageSize: 100,
  /** Default documentation page in Unicode code points. */
  docsCharacters: 8192,
  /** Maximum documentation page in Unicode code points. */
  maxDocsCharacters: 32768,
  /** Default source line page. */
  sourceLines: 200,
  /** Maximum source line page. */
  maxSourceLines: 500,
  /** Maximum diagnostic entries per publication. */
  diagnostics: 100,
  /** Maximum diagnostic message size. */
  diagnosticBytes: 4096,
  /** Maximum waiting jobs per MCP principal. */
  queuedPerPrincipal: 4,
  /** Maximum waiting server jobs. */
  queuedTotal: 8,
  /** Maximum retained terminal operations. */
  terminalOperations: 20,
  /** Maximum retained request-key tombstones. */
  requestKeys: 100,
  /** Retention after terminal transition. */
  retentionMs: 10 * 60 * 1000,
  /** Retention of previous catalog for cursors. */
  cursorRetentionMs: 60 * 1000,
  /** Maximum stored results and artifacts combined. */
  storageBytes: 32 * 1024 * 1024,
  /** Maximum full sanitized test result or screenshot. */
  artifactBytes: 4 * 1024 * 1024,
  /** Maximum image embedded in tool content. */
  inlineImageBytes: 1024 * 1024,
  /** Preview readiness deadline. */
  previewTimeoutMs: 30 * 1000,
  /** Owned browser shutdown deadline. */
  cleanupTimeoutMs: 10 * 1000,
})

/** UTF-8 size used for all protocol byte limits. */
export function mcpByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
