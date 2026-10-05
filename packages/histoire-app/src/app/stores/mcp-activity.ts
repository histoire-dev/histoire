import type { UiMcpOperationInfo, UiMcpSnapshot } from '@histoire/shared'

export { catalogTargetLabel as mcpTargetLabel } from '../util/catalog-target.js'

/** Running and queued operations remain visible until server confirms termination. */
export function isMcpOperationActive(operation: UiMcpOperationInfo): boolean {
  return operation.state === 'running' || operation.state === 'queued'
}

/** Only exact execution handles explicitly advertised by server expose Cancel. */
export function isMcpOperationCancellable(operation: UiMcpOperationInfo): boolean {
  return operation.cancellable === true && isMcpOperationActive(operation)
}

/** Upserts one operation while retaining at most 50 completed calls and all active calls. */
export function mergeMcpOperations(existing: UiMcpOperationInfo[], incoming?: UiMcpOperationInfo): UiMcpOperationInfo[] {
  const operations = new Map(existing.map(operation => [operation.id, operation]))
  if (incoming) operations.set(incoming.id, incoming)
  let completed = 0
  return [...operations.values()]
    .sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt))
    .filter(operation => isMcpOperationActive(operation) || completed++ < 50)
}

/** Progress updates do not repeat navigation, and Follow off never drops activity. */
export function followMcpTarget(previous: UiMcpOperationInfo | undefined, incoming: UiMcpOperationInfo, follow: boolean): UiMcpOperationInfo['target'] {
  if (!follow || incoming.state !== 'running' || previous?.state === 'running') return
  return incoming.target
}

/** Small relative timestamps refresh through store clock rather than one timer per row. */
export function mcpTimeAgo(timestamp: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000))
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

/** Shared activity views use one state-to-icon mapping. */
export function mcpOperationIcon(operation: UiMcpOperationInfo): string {
  if (operation.state === 'failed') return 'error-filled'
  if (operation.state === 'cancelled') return 'close-filled'
  if (operation.tool.includes('screenshot')) return 'camera'
  return 'checkmark-filled'
}

/** Progress is determinate only when server supplies valid bounded counts. */
export function mcpOperationProgress(operation?: UiMcpOperationInfo): { done: number, total: number } | undefined {
  const value = operation?.progress
  if (!value || !Number.isFinite(value.done) || !Number.isFinite(value.total) || value.total <= 0) return
  return { done: Math.max(0, Math.min(value.done, value.total)), total: value.total }
}

/** Copies only actual runtime endpoint; URLs carrying credentials are never exposed as config. */
export function mcpClientConfig(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return
    return JSON.stringify({ mcpServers: { histoire: { url: endpoint } } }, null, 2)
  }
  catch {
    return undefined
  }
}

/** Stdio configuration uses actual executable/project arguments projected by server. */
export function mcpStdioClientConfig(stdio: NonNullable<UiMcpSnapshot['stdio']>): string {
  return JSON.stringify({ mcpServers: { histoire: { command: stdio.command, args: stdio.args } } }, null, 2)
}
