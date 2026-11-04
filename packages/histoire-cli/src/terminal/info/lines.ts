import type { ProgressSnapshot } from '../progress/state.js'
import type { SessionInfoDto } from '../protocol/session.js'
import { sanitizeLine } from '../output/sanitize.js'
import { describePhase, describeProgress, describeRestartCause, formatDuration } from '../progress/format.js'

/** Everything the session screen shows, gathered from live parent state and the current child reply. */
export interface SessionLinesInput {
  snapshot: ProgressSnapshot
  /** Reply of the current generation only; undefined while unknown or retired. */
  info?: SessionInfoDto
  /** Why `info` is missing, when known. */
  infoProblem?: string
  /** Time since the CLI started. */
  uptimeMs: number
}

/** Aligned `label  value` row; the value may come from the child, so it is made safe here. */
const field = (label: string, value: string) => `${label.padEnd(10)} ${sanitizeLine(value)}`

/** Reason line without the trailing ellipsis of the lifecycle notice. */
const reason = (snapshot: ProgressSnapshot) => snapshot.cause ? describeRestartCause(snapshot.cause).replace(/\.\.\.$/, '') : 'Initial start'

/**
 * Plain rows of the session screen (without URL rows, which the view makes selectable).
 * Runtime facts come only from `info`, which the caller drops when its generation retired,
 * so a previous generation's version or phase is never shown as current.
 * @param input Live state.
 */
export function buildSessionLines(input: SessionLinesInput): string[] {
  const { snapshot, info } = input
  const lines = [
    field('Status', snapshot.status === 'ready' ? describeProgress(snapshot) : `${snapshot.status[0].toUpperCase()}${snapshot.status.slice(1)} · ${describeProgress(snapshot)}`),
    field('Started', reason(snapshot)),
    field('Uptime', formatDuration(input.uptimeMs)),
  ]
  const finished = snapshot.phases.filter(phase => phase.status === 'completed' || phase.status === 'skipped')
  if (finished.length) lines.push(field('Phases', finished.map(describePhase).join(' · ')))
  if (info) {
    lines.push(field('Histoire', info.histoire), field('Node', info.node), field('Vite', info.vite), field('Root', info.root), field('Config', info.configFile ?? 'none found'))
    if (info.collection) lines.push(field('Stories', `${info.collection.stories} stories · ${info.collection.variants} variants · ${info.collection.outcome}${info.collection.diagnostics ? ` · ${info.collection.diagnostics} issues` : ''}`))
    lines.push(field('MCP', info.mcp.enabled ? `${info.mcp.url ?? 'starting'}${info.mcp.tokenRequired ? ' (bearer token required)' : ''}` : 'disabled'))
  }
  else {
    lines.push(field('Runtime', input.infoProblem ?? 'Waiting for the runtime'))
  }
  return lines
}
