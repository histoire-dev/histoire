import type path from 'pathe'
import type fs from 'fs-extra'
import type pc from 'picocolors'
import type chokidar from 'chokidar'
import type {
  ServerStoryFile,
  ServerStory,
  ServerVariant,
} from './story.js'
import type {
  HistoireConfig,
  ConfigMode,
} from './config.js'

export interface SupportPlugin {
  id: string
  moduleName: string
  setupFn: string
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
}

export interface PluginApiBase {
  colors: typeof pc
  path: typeof path
  fs: typeof fs
  moduleLoader: ModuleLoader

  readonly pluginTempDir: string

  log: (...msg) => void
  warn: (...msg) => void
  error: (...msg) => void

  addStoryFile: (file: string) => void
}

export interface PluginApiDev extends PluginApiBase {
  watcher: typeof chokidar
}

export type BuildEndCallback = () => Promise<void> | void
export type PreviewStoryCallback = (payload: { file: string, story: ServerStory, variant: ServerVariant, url: string }) => Promise<void> | void

export interface PluginApiBuild extends PluginApiBase {
  buildEndCallbacks: BuildEndCallback[]
  previewStoryCallbacks: PreviewStoryCallback[]

  onBuildEnd: (cb: BuildEndCallback) => void
  onPreviewStory: (cb: PreviewStoryCallback) => void
}

export interface Plugin {
  /**
   * Name of the plugin
   */
  name: string
  /**
   * Modify histoire default config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config. User config will have higher priority than default config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  defaultConfig?: (defaultConfig: HistoireConfig, mode: ConfigMode) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Modify histoire config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  config?: (config: HistoireConfig, mode: ConfigMode) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Use this hook to read and store the final resolved histoire config.
   */
  configResolved?: (config: HistoireConfig) => void | Promise<void>
  /**
   * Use this hook to do processing during development. The `onCleanup` hook
   * should handle cleanup tasks when development server is closed.
   */
  onDev?: (api: PluginApiDev, onCleanup: (cb: () => void | Promise<void>) => void) => void | Promise<void>
  /**
   * Use this hook to do processing during production build.
   */
  onBuild?: (api: PluginApiBuild) => void | Promise<void>
  /**
   * This plugin exposes a support plugin (example: Vue, Svelte, etc.)
   */
  supportPlugin?: SupportPlugin
}
