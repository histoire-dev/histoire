/**
 * Startup progress and restart-cause DTOs. Type-and-constant only, so the parent
 * can load it before binding its listener.
 */
import type { RestartCause, RestartCauseKind, RestartRequest } from '@histoire/dev-proxy/protocol'
import { truncateText } from './core.js'

export type { RestartCause, RestartCauseKind, RestartRequest }

/** Real units of startup work, in the order they usually begin. Several may run at once. */
const STARTUP_PHASES = [
  /** Loading Histoire and Vite configuration (including plugin construction). */
  'config',
  /** Creating the collection and client Vite servers. */
  'vite',
  /** Scanning story files. */
  'scan',
  /** Associating Markdown files with stories. */
  'markdown',
  /** Running plugin `onDev` hooks; the label names the current plugin. */
  'plugins',
  /** Listening, which includes Vite dependency pre-bundling. */
  'listen',
  /** Restoring the cached catalog; `skipped` when bypassed or unusable. */
  'restore',
  /** Collecting stories; carries loaded/total file counts. */
  'collect',
  /** Warming the client (foreground, gates readiness). */
  'warmup',
  /** Attaching the canonical catalog and optional services. */
  'attach',
  /** Background revalidation of a restored catalog; never gates readiness. */
  'revalidate',
] as const

/** Identifier of one startup phase. */
export type StartupPhaseId = typeof STARTUP_PHASES[number]

/** Lifecycle step of one phase. */
export type ProgressStatus = 'started' | 'updated' | 'completed' | 'failed' | 'skipped'

/** Payload of the `progress` runtime event; the envelope carries the generation. */
export interface ProgressEvent {
  phase: StartupPhaseId
  status: ProgressStatus
  /** Current detail such as a plugin name or sub-step. */
  label?: string
  /** Loaded units; only sent together with a real `total`. */
  current?: number
  /** Real denominator (collector story file count). */
  total?: number
  /** Monotonic child-side duration, on `completed` and `failed`. */
  durationMs?: number
  /** Work that does not gate readiness. */
  background?: boolean
  /** First line of the failure (bounded), on `failed`. */
  error?: string
}

/** Events added by this slice to the terminal event map. */
export interface ProgressEvents {
  progress: ProgressEvent
}

/** Longest retained failure line. */
export const PROGRESS_ERROR_LENGTH = 512

/**
 * First line of an error, bounded for the wire.
 * @param error Thrown value.
 */
export function describeProgressError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return truncateText(message.split('\n')[0], PROGRESS_ERROR_LENGTH).text
}

/**
 * Validates an untrusted `progress` event payload from the child.
 * @param value Candidate payload.
 */
export function isProgressEvent(value: unknown): value is ProgressEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  const number = (field: unknown) => field === undefined || (typeof field === 'number' && Number.isFinite(field) && field >= 0)
  return (STARTUP_PHASES as readonly unknown[]).includes(event.phase)
    && ['started', 'updated', 'completed', 'failed', 'skipped'].includes(event.status as string)
    && (event.label === undefined || typeof event.label === 'string')
    && number(event.current) && number(event.total) && number(event.durationMs)
    && (event.background === undefined || typeof event.background === 'boolean')
    && (event.error === undefined || typeof event.error === 'string')
}
