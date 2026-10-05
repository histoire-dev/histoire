import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { AcpFileChange } from './types.js'
import path from 'pathe'

/** Splits file contents without inventing an extra line for a terminal newline. */
function lines(text: string): string[] {
  if (!text) return []
  const result = text.split(/\r?\n/)
  if (result.at(-1) === '') result.pop()
  return result
}

/** Counts line edits with bounded LCS work; large replacements use their changed span. */
export function countChangedLines(before: string, after: string): { added: number, removed: number } {
  let oldLines = lines(before)
  let newLines = lines(after)
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++
  oldLines = oldLines.slice(prefix)
  newLines = newLines.slice(prefix)
  while (oldLines.length && newLines.length && oldLines.at(-1) === newLines.at(-1)) {
    oldLines.pop()
    newLines.pop()
  }
  if (oldLines.length * newLines.length > 250_000) return { added: newLines.length, removed: oldLines.length }
  // Two rows retain exact matching-line counts without allocating a matrix.
  let previous = new Uint32Array(newLines.length + 1)
  for (const line of oldLines) {
    const current = new Uint32Array(newLines.length + 1)
    for (let column = 0; column < newLines.length; column++) current[column + 1] = line === newLines[column] ? previous[column] + 1 : Math.max(previous[column + 1], current[column])
    previous = current
  }
  const common = previous[newLines.length]
  return { added: newLines.length - common, removed: oldLines.length - common }
}

/** Collects completed agent-reported diffs; Histoire does not mutate source files. */
export function createAgentFileChanges(root: string, sanitize: (text: string) => string) {
  const tools = new Map<string, { status?: string, diffs: Map<string, AcpFileChange> }>()
  return {
    /** Tracks tool updates belonging to a manager's already validated active session. */
    update(notification: SessionNotification): void {
      const update = notification.update
      if (!['tool_call', 'tool_call_update'].includes(update.sessionUpdate) || !('toolCallId' in update)) return
      if (!tools.has(update.toolCallId) && tools.size >= 64) return
      const tool = tools.get(update.toolCallId) ?? { diffs: new Map<string, AcpFileChange>() }
      if (update.status) tool.status = update.status
      for (const content of update.content ?? []) {
        if (content.type !== 'diff' || content.newText.length > 1_000_000 || (content.oldText?.length ?? 0) > 1_000_000) continue
        const file = path.relative(root, path.resolve(root, content.path))
        if (!file || file.length > 240 || file === '..' || file.startsWith('../') || path.isAbsolute(file)) continue
        if (!tool.diffs.has(file) && tool.diffs.size >= 64) continue
        const counts = countChangedLines(content.oldText ?? '', content.newText)
        tool.diffs.set(file, { file: sanitize(file).slice(0, 240), ...counts })
      }
      tools.set(update.toolCallId, tool)
    },
    /** Projects only completed tools; pending/failed edit proposals are not changes. */
    snapshot(): AcpFileChange[] {
      const files = new Map<string, AcpFileChange>()
      for (const tool of tools.values()) {
        if (tool.status !== 'completed') continue
        for (const change of tool.diffs.values()) {
          const previous = files.get(change.file)
          files.set(change.file, { file: change.file, added: (previous?.added ?? 0) + change.added, removed: (previous?.removed ?? 0) + change.removed })
        }
      }
      return [...files.values()].slice(0, 64)
    },
  }
}
