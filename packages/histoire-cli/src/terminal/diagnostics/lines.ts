import type { DiagnosticsDto } from '../protocol/diagnostics.js'
import type { RequestHistory } from '../requests/history.js'
import { sanitizeLine } from '../output/sanitize.js'

/** Aligned `label  value` row; the value may come from the child, so it is made safe here. */
const field = (label: string, value: string) => `${label.padEnd(11)} ${sanitizeLine(value)}`

/** `1 client`, `2 clients`. */
const count = (amount: number, noun: string) => `${amount} ${noun}${amount === 1 ? '' : 's'}`

/** Request counts, from the parent's own history (independent of runtime availability). */
function requestSummary(requests: RequestHistory): string {
  const entries = requests.entries()
  const failed = entries.filter(entry => entry.outcome === 'failed').length
  const aborted = entries.filter(entry => entry.outcome === 'aborted').length
  const parts = [`${entries.length} retained`]
  if (failed) parts.push(`${failed} failed`)
  if (aborted) parts.push(`${aborted} aborted`)
  if (requests.inFlight()) parts.push(`${requests.inFlight()} in flight`)
  if (requests.omitted) parts.push(`${requests.omitted} older omitted`)
  return parts.join(' · ')
}

/** Everything the diagnostics block shows. */
export interface DiagnosticsLinesInput {
  /** Reply of the current generation only. */
  diagnostics?: DiagnosticsDto
  /** Why `diagnostics` is missing, when known. */
  problem?: string
  requests: RequestHistory
}

/**
 * Plain rows of the session screen's diagnostics block. Sections fail independently: a
 * collection problem does not hide the MCP summary, and a failed retrieval does not hide
 * the request summary, which the parent owns.
 * @param input Live state.
 */
export function buildDiagnosticsLines(input: DiagnosticsLinesInput): string[] {
  const { diagnostics } = input
  const lines: string[] = []
  if (!diagnostics) {
    lines.push(field('Runtime', input.problem ?? 'Waiting for the runtime'))
  }
  else {
    const { collection, mcp, problems } = diagnostics
    if (problems.collection) {
      lines.push(field('Collection', `unavailable: ${problems.collection}`))
    }
    else if (collection) {
      lines.push(field('Collection', `${collection.outcome} · ${count(collection.issues, 'issue')}${collection.truncated ? ' (more omitted)' : ''}`))
      for (const issue of collection.items) lines.push(`  ${sanitizeLine(`${issue.code}${issue.file ? ` ${issue.file}` : ''}: ${issue.message}`)}`)
      if (collection.issues > collection.items.length) lines.push(`  … ${collection.issues - collection.items.length} more issues`)
    }
    else {
      lines.push(field('Collection', 'not finished yet'))
    }
    if (problems.mcp) {
      lines.push(field('MCP', `unavailable: ${problems.mcp}`))
    }
    else if (mcp) {
      const detail = mcp.status === 'enabled'
        ? [mcp.endpoint ?? 'starting', ...(mcp.tokenRequired ? ['bearer token required'] : []), count(mcp.clients.length + mcp.clientsOmitted, 'client') + (mcp.clients.length ? ` (${mcp.clients.map(client => client.name).join(', ')}${mcp.clientsOmitted ? ', …' : ''})` : ''), `${mcp.activeOperations} active`]
        : [mcp.status]
      lines.push(field('MCP', detail.join(' · ')))
    }
  }
  lines.push(field('Requests', requestSummary(input.requests)))
  return lines
}
