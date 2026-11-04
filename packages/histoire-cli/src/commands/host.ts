/** CLI fields selecting the dev MCP listener; histoire resolves them into a listener policy. */
export interface DevMcpCliOptions {
  /** Explicit enable, or false from Sade's --no-mcp handling. */
  'mcp'?: boolean
  /** Explicit disable, preserved separately to detect conflicting CLI flags. */
  'no-mcp'?: boolean
  /** Explicit listening port; zero requests an ephemeral port. */
  'mcp-port'?: string | number
}

/** Options accepted by `histoire dev`. */
export interface DevOptions extends DevMcpCliOptions {
  /** Public proxy port; defaults to 6006. */
  port?: number | string
  /** Public binding independent of private Vite listener. */
  host?: string | boolean
  /** Explicit project directory. */
  root?: string
  /** Explicit configuration path. */
  config?: string
  /** Open public URL before runtime becomes ready. */
  open?: boolean
  /** Explicit terminal panel choice: `--tui` (true) or `--no-tui` (false); undefined follows `HISTOIRE_TUI` and automatic detection. */
  tui?: boolean
  /** `--test-watch`: watch the whole book and rerun affected stories on every change. Default off. */
  testWatch?: boolean
}

/**
 * Histoire-specific inputs of the dev parent. The module providing them must stay
 * light (no Vite, runtime or project graph): the parent loads it before the public port binds.
 */
export interface DevInjection {
  /** Entry of the runtime child process the proxy spawns. */
  runtime: URL
  /** Removes the MCP credential from the environment and returns it, before project code can read it. */
  captureMcpToken: () => string | undefined
  /** Validates MCP flags; throws on conflicting or malformed values. */
  resolveDevMcpOptions: (config: undefined, cli: DevMcpCliOptions) => unknown
}

/** Dev parent inputs: histoire's injection plus the version shown in the banner. */
export interface DevHost extends DevInjection {
  /** Histoire version; empty when unknown. */
  version: string
}

/** Command implementation receiving Sade's parsed options. */
export type CommandHandler = (options: any) => unknown

/** Lazy loader of one command implementation, so unused commands never load. */
export type CommandLoader<Handler = CommandHandler> = () => Promise<Handler>

/** Everything histoire provides to the CLI: version, lazy command implementations and the dev parent injection. */
export interface CliHost {
  /** Histoire version printed by `--version`. */
  version: string
  /** Loads the light inputs of the dev parent. */
  dev: () => Promise<DevInjection>
  /** Lazy implementations of the commands run inside the histoire package. */
  commands: {
    mcp: CommandLoader
    build: CommandLoader
    preview: CommandLoader
    /** Receives the raw arguments after `--`, forwarded to Vitest. */
    test: CommandLoader<(options: any, rawVitestArgs: string[]) => unknown>
    screenshotSetup: CommandLoader
    visual: CommandLoader
  }
  /** Command line, defaults to `process.argv`. */
  argv?: string[]
}
