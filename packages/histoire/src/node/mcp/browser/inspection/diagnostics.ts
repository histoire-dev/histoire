import type { Page } from 'playwright'
import type { McpInspectionResult } from '../../protocol/inspection-schema.js'
import { sanitizeDiagnosticMessage } from '../../../runtime/catalog/diagnostics.js'
import { mcpByteLength } from '../../protocol/limits.js'

/** Bounded runtime telemetry belongs to one fresh page, never shared across jobs. */
export function createInspectionDiagnostics(sanitize: { root: string, secret?: string }) {
  const entries: Extract<McpInspectionResult, { inspection: 'diagnostics' }>['entries'] = []
  const listeners: { page: Page, name: string, listener: (...args: any[]) => void }[] = []
  let droppedCount = 0
  let bytes = 0
  /** URLs retain resource identity without userinfo, query strings or fragments. */
  function url(value: string): string | undefined {
    try {
      const parsed = new URL(value)
      if (!['http:', 'https:'].includes(parsed.protocol)) return undefined
      return sanitizeDiagnosticMessage(parsed.origin + parsed.pathname, sanitize.root, sanitize.secret)
    }
    catch { return undefined }
  }
  /** Retain complete sanitized entries within count and byte bounds. */
  function add(entry: typeof entries[number]): void {
    entry.message = sanitizeDiagnosticMessage(entry.message, sanitize.root, sanitize.secret)
    const size = mcpByteLength(JSON.stringify(entry)) + 1
    if (entries.length >= 100 || bytes + size > 48 * 1024) {
      droppedCount++
      return
    }
    bytes += size
    entries.push(entry)
  }
  return {
    /** Attach before navigation to capture mount failures as well as ready previews. */
    attach(page: Page): void {
      const handlers = {
        console: message => add({ kind: 'console', level: message.type().slice(0, 32), message: message.text() }),
        pageerror: error => add({ kind: 'page-error', message: error.message }),
        requestfailed: request => add({ kind: 'request-failed', message: request.failure()?.errorText ?? 'Request failed', url: url(request.url()) }),
        response: (response) => { if (response.status() >= 400) add({ kind: 'http-error', status: response.status(), message: `HTTP ${response.status()}`, url: url(response.url()) }) },
      }
      for (const [name, listener] of Object.entries(handlers)) {
        page.on(name as any, listener)
        listeners.push({ page, name, listener })
      }
    },
    /** Copy retained rows, preventing callers from changing observer-owned state. */
    snapshot: () => ({ entries: structuredClone(entries), droppedCount, truncated: droppedCount > 0 }),
    /** Release event callbacks before browser teardown; repeated cleanup is harmless. */
    close(): void {
      for (const { page, name, listener } of listeners.splice(0)) page.off(name as any, listener)
    },
  }
}
