/** Smallest terminal width the main panel needs. */
const MIN_COLUMNS = 40
/** Smallest terminal height the main panel needs. */
const MIN_ROWS = 10

/** Terminal activation requested through `HISTOIRE_TUI`. */
export type TuiEnvironment = 'plain' | 'auto' | 'force'

/** Rendering mode of the dev command. */
export type TerminalMode = 'tui' | 'plain'

/** Inputs of the activation policy; every field is injectable for tests. */
export interface SupportInputs {
  /** Explicit `--tui` (true) or `--no-tui` (false). */
  flag?: boolean
  /** Raw `HISTOIRE_TUI` value. */
  env?: string
  stdin: { isTTY?: boolean, setRawMode?: unknown }
  stdout: { isTTY?: boolean, columns?: number, rows?: number }
  environment: NodeJS.ProcessEnv
  execArgv: readonly string[]
  /** Result of `inspector.url()`; defined while an inspector listens. */
  inspectorUrl?: string
}

/** Policy outcome with a short reason when plain was chosen. */
export interface SupportDecision {
  mode: TerminalMode
  /** Why plain was chosen; undefined for `tui`. */
  reason?: string
  /** The terminal was usable but only too small: a resize may recover the TUI. */
  recoverable?: boolean
}

/**
 * Parses `HISTOIRE_TUI`; unset or empty is `auto`.
 * @param value Raw environment value.
 * @throws When the value is not `plain`, `auto` or `1`.
 */
export function parseTuiEnvironment(value: string | undefined): TuiEnvironment {
  if (value === undefined || value === '' || value === 'auto') return 'auto'
  if (value === 'plain') return 'plain'
  if (value === '1') return 'force'
  throw new Error(`Invalid HISTOIRE_TUI value "${value}". Use plain, auto or 1`)
}

/**
 * Whether Node was started, or inherits options, that enable an inspector.
 * @param execArgv Node options of this process.
 * @param environment Inherited environment (`NODE_OPTIONS`).
 * @param inspectorUrl Active inspector URL, if any.
 */
export function isInspectorAttached(execArgv: readonly string[], environment: NodeJS.ProcessEnv, inspectorUrl?: string): boolean {
  if (inspectorUrl) return true
  const flag = /^--inspect(?:-brk|-wait)?(?:=|$)/
  return execArgv.some(argument => flag.test(argument)) || (environment.NODE_OPTIONS ?? '').split(/\s+/).some(argument => flag.test(argument))
}

/** Whether the environment declares a CI run. */
function isContinuousIntegration(environment: NodeJS.ProcessEnv) {
  const value = environment.CI
  return value !== undefined && value !== '' && value !== '0' && value !== 'false'
}

/**
 * Decides between the interactive panel and plain output (see contracts, Activation and flags).
 * Explicit disable always wins; explicit enable only overrides CI and inspector checks, never
 * missing terminal capabilities or dimensions.
 * @param inputs Flag, environment and stream facts.
 * @throws When `HISTOIRE_TUI` is invalid.
 */
export function decideTerminalMode(inputs: SupportInputs): SupportDecision {
  const env = parseTuiEnvironment(inputs.env)
  if (inputs.flag === false) return { mode: 'plain', reason: '--no-tui' }
  if (inputs.flag === undefined && env === 'plain') return { mode: 'plain', reason: 'HISTOIRE_TUI=plain' }
  if (!inputs.stdin.isTTY || !inputs.stdout.isTTY) return { mode: 'plain', reason: 'not an interactive terminal' }
  if (typeof inputs.stdin.setRawMode !== 'function') return { mode: 'plain', reason: 'raw input unavailable' }
  const term = inputs.environment.TERM
  if (term === 'dumb' || (process.platform !== 'win32' && !term)) return { mode: 'plain', reason: 'dumb terminal' }
  if ((inputs.stdout.columns ?? 0) < MIN_COLUMNS || (inputs.stdout.rows ?? 0) < MIN_ROWS) return { mode: 'plain', reason: `terminal smaller than ${MIN_COLUMNS}x${MIN_ROWS}`, recoverable: true }
  const forced = inputs.flag === true || env === 'force'
  if (!forced) {
    if (isContinuousIntegration(inputs.environment)) return { mode: 'plain', reason: 'CI' }
    if (isInspectorAttached(inputs.execArgv, inputs.environment, inputs.inspectorUrl)) return { mode: 'plain', reason: 'Node inspector attached' }
  }
  return { mode: 'tui' }
}
