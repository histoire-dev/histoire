import type { Readable, Writable } from 'node:stream'
import type { TerminalBridge } from './bridge.js'
import type { ClipboardWriter } from './clipboard.js'
import type { LogHistory } from './output/history.js'
import type { OutputPassthrough } from './output/pipeline.js'
import type { ProgressState } from './progress/state.js'
import type { RestartRequest } from './protocol/index.js'
import type { RequestHistory } from './requests/history.js'
import type { RetainedHistories } from './retained.js'
import type { TerminalMode } from './support.js'
import type { TestsState } from './tests/state.js'
import type { TerminalViewFactory, ViewRegistry } from './views/registry.js'

/** Capabilities of the dev command the session drives; bound once the proxy exists. */
export interface SessionHost {
  /** Requests a runtime replacement. */
  restart: (request: RestartRequest) => Promise<void>
  /** Opens an absolute URL in the default browser. */
  openBrowser: (url: string) => Promise<void>
  /** Closes proxy and runtime; the single existing shutdown. */
  close: () => Promise<void>
}

/** Option subset the host extras read. */
export type SessionHostExtras = Pick<TerminalSessionOptions, 'logs' | 'retained' | 'host' | 'interfaces'>

/** Inputs of one dev command's terminal session. Stream/environment fields are injectable for tests. */
export interface TerminalSessionOptions {
  /** Explicit `--tui` (true) or `--no-tui` (false). */
  flag?: boolean
  /** `--test-watch`: watch the whole book from the first ready generation, without any input. */
  testWatch?: boolean
  /** Shown in the panel title. */
  version: string
  logs: LogHistory
  /** Public HTTP exchange history fed by the proxy observer; a private empty one is used when absent. */
  requests?: RequestHistory
  progress: ProgressState
  bridge: TerminalBridge
  /** Observed test operations fed by the bridge; the dev command creates it so runtime retirement reaches it. A private one is created when absent. */
  tests?: TestsState
  /** Deletable histories shared with the dev command (slice 06 registers requests here); logs are always registered. */
  retained?: RetainedHistories
  /** The `--host` value, to derive network URLs from the configured binding. */
  host?: string | boolean
  /** Network interfaces for network URLs; defaults to `os.networkInterfaces()`. */
  interfaces?: () => import('./info/network.js').InterfaceTable
  /** Clipboard writer; defaults to an honest "unavailable". */
  clipboard?: ClipboardWriter
  /** View list; defaults to `views/index.ts`. */
  viewFactories?: readonly TerminalViewFactory[]
  stdin?: Readable & NodeJS.ReadStream
  stdout?: Writable & NodeJS.WriteStream
  environment?: NodeJS.ProcessEnv
  execArgv?: readonly string[]
  /** Unix suspend; defaults to sending SIGTSTP to this process. */
  suspendProcess?: () => void
}

/** Terminal session of the dev command: owns raw input, screen and the plain fallback. */
export interface TerminalSession {
  /** Sinks for the output pipeline: child output goes above the panel, or straight to the stream in plain mode. */
  passthrough: OutputPassthrough
  /** Lifecycle notice: one line above the panel, or a plain line. */
  line: (text: string) => void
  /** Public listener address, known before project evaluation. */
  onListening: (url: string) => void
  /** Records the workbench base once ready. */
  onReady: (base: string) => void
  /** Connects the session to the started proxy. */
  bind: (host: SessionHost) => void
  /** Restores input, screen and cursor now; idempotent. Also used when startup fails. */
  release: () => void
  /** Blocks new actions, restores the terminal, then joins the host shutdown. Idempotent; rejects with cleanup failures. */
  shutdown: () => Promise<void>
  /** Current rendering mode (`plain` while released). */
  readonly mode: TerminalMode
  /** Registered views (inspection and later slices). */
  readonly registry: ViewRegistry
}
