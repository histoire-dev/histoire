import type { HistoireJsonValue } from '@histoire/protocol'
import type chokidar from 'chokidar'
import type fs from 'fs-extra'
import type path from 'pathe'
import type pc from 'picocolors'
import type { InlineConfig as ViteInlineConfig, Plugin as VitePlugin } from 'vite'
import type { Awaitable } from '../type-utils.js'
import type {
  PluginCommand,
} from './command.js'
import type {
  ConfigMode,
  HistoireConfig,
} from './config.js'
import type {
  ServerStory,
  ServerStoryFile,
  ServerVariant,
} from './story.js'

export interface SupportPlugin {
  id: string
  moduleName: string
  setupFn: string | string[]
  importStoriesPrepend?: string
  importStoryComponent: (file: ServerStoryFile, index: number) => string
}

export interface FinalSupportPlugin extends SupportPlugin {
  // For now, no additional properties
}

export interface ModuleLoader {
  clearCache: () => void
  loadModule: (file: string) => Promise<any>
  destroy: () => void
  /** Resolve imports through owning Vite container, including CSS aliases. */
  resolveId?: (id: string, importer?: string) => Promise<string | null>
  /** Load raw source before transforms, including virtual stylesheets. */
  loadSource?: (id: string) => Promise<{ code: string, dependencies: string[] }>
  /** Transitive dependencies loaded for a module. */
  getDependencies?: (id: string) => string[]
}

/** Trusted configuration ownership available before dev/build plugin APIs exist. */
export interface PluginConfigContext {
  /** Resolved project root; never inferred from process cwd by plugins. */
  readonly root: string
  /** Mutable output directory owned by this context/generation. */
  readonly tempDir: string
  /** Registers an acquired resource immediately, including partial configuration. */
  onCleanup: (callback: () => Awaitable<void>) => void
  /**
   * Directory for generated output that should survive restarts:
   * `.histoire/<name>` while no other live run of the project uses it,
   * otherwise `<tempDir>/<name>`. Stable for this run.
   */
  claimDir: (name: string) => string
}

/** Vite environment being configured for a Histoire plugin. */
export interface PluginViteConfigContext {
  /** Histoire development or build mode. */
  readonly mode: ConfigMode
  /** Node-side story collector. */
  readonly isServer: boolean
  /** Dedicated browser test runtime. */
  readonly browserRuntime: boolean
  /** Collection-only browser runtime. */
  readonly collecting: boolean
}

export interface PluginApiBase {
  /** Explicit project root for dependency and configuration resolution. */
  readonly root: string
  /** Captured root/output/cleanup ownership, without exposing internal Node context. */
  getContext: () => PluginConfigContext
  colors: typeof pc
  path: typeof path
  fs: typeof fs
  moduleLoader: ModuleLoader

  readonly pluginTempDir: string

  log: (...msg) => void
  warn: (...msg) => void
  error: (...msg) => void

  getStories: () => ServerStory[]
  addStoryFile: (file: string) => void
  /** Remove owned generated story and announce inventory change. */
  removeStoryFile: (file: string) => void
  /** Whether captured runtime still accepts writes and publication. */
  isActive: () => boolean

  getConfig: () => HistoireConfig
}

export interface PluginApiDev extends PluginApiBase {
  watcher: typeof chokidar
}

export type ChangeViteConfigCallback = (config: ViteInlineConfig) => Awaitable<void>
export type BuildEndCallback = () => Awaitable<void>
export type PreviewStoryCallback = (payload: { file: string, story: ServerStory, variant: ServerVariant, url: string }) => Awaitable<void>

export interface PluginApiBuild extends PluginApiBase {
  /** Directory receiving the static book; files written there by `onBuildEnd` are published with it. */
  outputDir: string
  changeViteConfigCallbacks: ChangeViteConfigCallback[]
  buildEndCallbacks: BuildEndCallback[]
  previewStoryCallbacks: PreviewStoryCallback[]

  changeViteConfig: (cb: ChangeViteConfigCallback) => void
  onBuildEnd: (cb: BuildEndCallback) => void
  onPreviewStory: (cb: PreviewStoryCallback) => void
}

export interface PluginApiDevEvent extends PluginApiBase {
  event: string
  payload: any
}

/**
 * Browser-facing part of a Histoire plugin. Only these fields reach the browser;
 * entries are loaded lazily by the workbench and by interactive story frames.
 */
export interface WorkbenchPluginDescriptor {
  /** Stable identity shared by Node, workbench and frame modules. `[a-z][a-z0-9-]*`, at most 64 characters, not `builtin`. */
  id: string
  /** Extension contract version; only `1` exists. */
  apiVersion: 1
  /**
   * Module default-exporting `defineWorkbenchPlugin(...)`. Bare specifiers and absolute paths
   * resolve through Vite from the project root; package authors resolve their own relative paths first.
   */
  client?: string
  /** Module default-exporting `defineFramePlugin(...)`; resolved like `client`. */
  frame?: string
  /** Explicit browser-visible JSON options. Nothing else from the Node plugin reaches the browser. */
  options?: HistoireJsonValue
  /** Exclude both entries from static builds. */
  devOnly?: boolean
}

/** Public details displayed for a configured plugin. */
export interface PluginMetadata {
  /** Human-readable name, independent of the plugin identity. */
  displayName?: string
  /** Short explanation of the plugin. */
  description?: string
  /** Name of an offline Histoire icon. */
  icon?: string
  /** HTTPS image URL. */
  logoUrl?: string
  /** Documentation URL. */
  docsUrl?: string
  /** Source repository URL. */
  repoUrl?: string
}

export interface Plugin {
  /**
   * Name of the plugin
   */
  name: string
  /** Optional public information shown in settings. */
  metadata?: PluginMetadata
  /**
   * Modify histoire default config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config. User config will have higher priority than default config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  defaultConfig?: (defaultConfig: HistoireConfig, mode: ConfigMode, context?: PluginConfigContext) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Modify histoire config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  config?: (config: HistoireConfig, mode: ConfigMode, context?: PluginConfigContext) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Use this hook to read and store the final resolved histoire config.
   */
  configResolved?: (config: HistoireConfig, context?: PluginConfigContext) => Awaitable<void>
  /**
   * Use this hook to do processing during development. The `onCleanup` hook
   * should handle cleanup tasks when development server is closed.
   */
  onDev?: (api: PluginApiDev, onCleanup: (cb: () => Awaitable<void>) => void) => Awaitable<void>
  /**
   * Use this hook to do processing during production build.
   */
  onBuild?: (api: PluginApiBuild) => Awaitable<void>
  /**
   * Use this hook to do processing when preview is started.
   */
  onPreview?: () => Awaitable<void>
  /**
   * This plugin exposes a support plugin (example: Vue, Svelte, etc.)
   */
  supportPlugin?: SupportPlugin
  /**
   * This plugin exposes commands that can be executed from the search bar in development mode.
   */
  commands?: PluginCommand[]
  /**
   * Handle a custom event from the client in development mode.
   */
  onDevEvent?: (api: PluginApiDevEvent) => Awaitable<any>
  /** Extend the Vite config before Vite resolves its own integrations. */
  viteConfig?: (config: ViteInlineConfig, context: PluginViteConfigContext) => Awaitable<ViteInlineConfig | null | void>
  /**
   * Use this hook to manipulate Vite plugins before they are passed to Vite.
   */
  vitePlugins?: (plugins: VitePlugin[]) => Awaitable<void>
  /**
   * Browser-facing workbench and frame entries contributed by this plugin.
   */
  workbench?: WorkbenchPluginDescriptor
}
