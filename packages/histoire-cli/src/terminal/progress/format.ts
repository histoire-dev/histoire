import type { RestartCause, StartupPhaseId } from '../protocol/progress.js'
import type { PhaseSnapshot, ProgressSnapshot } from './state.js'
import { sanitizeLine } from '../output/sanitize.js'

/** Short English names of startup phases. */
export const PHASE_TITLES: Record<StartupPhaseId, string> = {
  config: 'Loading configuration',
  vite: 'Starting Vite servers',
  scan: 'Scanning stories',
  markdown: 'Matching Markdown files',
  plugins: 'Running plugin hooks',
  listen: 'Starting server',
  restore: 'Restoring cached catalog',
  collect: 'Collecting stories',
  warmup: 'Warming up client',
  attach: 'Attaching services',
  revalidate: 'Revalidating catalog',
}

/**
 * Formats a monotonic duration compactly.
 * @param milliseconds Duration in milliseconds.
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/**
 * One plain lifecycle line naming why the runtime restarts. The config line keeps
 * the historical `Config changed, restarting` prefix.
 * The source may come from the child, so it is made safe for one terminal row here.
 * @param cause Merged cause of the transition.
 * @param secrets Configured credentials removed from the source.
 */
export function describeRestartCause(cause: RestartCause, secrets: readonly string[] = []): string {
  const cleaned = cause.source ? sanitizeLine(cause.source, secrets) : undefined
  const source = cleaned ? ` (${cleaned})` : ''
  switch (cause.kind) {
    case 'config':
      return `Config changed, restarting${source}${cause.fresh ? ' fresh' : ''}...`
    case 'browser':
      return `Restart requested from the browser${cause.fresh ? ' (fresh)' : ''}...`
    case 'exit':
      return `${cleaned ?? 'Runtime exited'}, restarting${cause.fresh ? ' fresh' : ''}...`
    default:
      return cause.fresh ? 'Restarting fresh, skipping cached catalog and dependencies...' : 'Restarting...'
  }
}

/**
 * Describes one phase: title, detail, real counts and elapsed time.
 * @param phase Phase snapshot.
 */
export function describePhase(phase: PhaseSnapshot): string {
  const detail = phase.label ? ` (${phase.label})` : ''
  const counts = phase.current !== undefined && phase.total !== undefined ? ` ${phase.current}/${phase.total}` : ''
  const suffix = phase.status === 'skipped' ? ' skipped' : phase.status === 'failed' ? ' failed' : phase.status === 'interrupted' ? ' interrupted' : ''
  return `${PHASE_TITLES[phase.phase]}${detail}${counts}${suffix}${phase.status === 'skipped' ? '' : ` ${formatDuration(phase.elapsedMs)}`}`
}

/**
 * Plain description of the current startup: failure, running work, or readiness.
 * Never fabricates a percentage.
 * @param snapshot Current progress view.
 */
export function describeProgress(snapshot: ProgressSnapshot): string {
  if (snapshot.failed) return `${describePhase(snapshot.failed)}${snapshot.failed.error ? `: ${snapshot.failed.error}` : ''}`
  const foreground = snapshot.active.filter(phase => !phase.background)
  if (foreground.length) return foreground.map(describePhase).join(' · ')
  if (snapshot.status === 'ready' && snapshot.readyAfterMs !== undefined) {
    const background = snapshot.active.map(describePhase)
    return `Ready in ${formatDuration(snapshot.readyAfterMs)}${background.length ? ` · ${background.join(' · ')}` : ''}`
  }
  return snapshot.status === 'restarting' ? 'Restarting' : snapshot.status === 'failed' ? 'Failed to start' : 'Starting'
}
