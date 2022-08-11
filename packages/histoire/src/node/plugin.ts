import chokidar from 'chokidar'
import path from 'pathe'
import fs from 'fs-extra'
import pc from 'picocolors'
import type { ServerStory, ServerVariant, SupportPlugin } from '@histoire/shared'
import { TEMP_PATH } from './alias.js'
import type { ConfigMode, HistoireConfig } from './config.js'
import type { Context } from './context.js'
import type { ModuleLoader } from './load.js'
import { addStory, removeStory } from './stories.js'

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
  onDev?: (api: DevPluginApi, onCleanup: (cb: () => void | Promise<void>) => void) => void | Promise<void>
  /**
   * Use this hook to do processing during production build.
   */
  onBuild?: (api: BuildPluginApi) => void | Promise<void>
  /**
   * This plugin exposes a support plugin (example: Vue, Svelte, etc.)
   */
  supportPlugin?: SupportPlugin
}

export class BasePluginApi {
  colors = pc
  path = path
  fs = fs

  // eslint-disable-next-line no-useless-constructor
  constructor (
    protected ctx: Context,
    protected plugin: Plugin,
    public moduleLoader: ModuleLoader,
  ) { }

  get pluginTempDir () {
    return path.resolve(TEMP_PATH, 'plugins', this.plugin.name)
  }

  log (...msg) {
    console.log(this.colors.gray(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  warn (...msg) {
    console.warn(this.colors.yellow(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  error (...msg) {
    console.error(this.colors.red(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  addStoryFile (file: string) {
    removeStory(file)
    addStory(file)
  }
}

export class DevPluginApi extends BasePluginApi {
  watcher = chokidar
}

export type BuildEndCallback = () => Promise<void> | void
export type PreviewStoryCallback = (payload: { file: string, story: ServerStory, variant: ServerVariant, url: string }) => Promise<void> | void

export class BuildPluginApi extends BasePluginApi {
  buildEndCallbacks: BuildEndCallback[] = []
  previewStoryCallbacks: PreviewStoryCallback[] = []

  onBuildEnd (cb: BuildEndCallback) {
    this.buildEndCallbacks.push(cb)
  }

  onPreviewStory (cb: PreviewStoryCallback) {
    this.previewStoryCallbacks.push(cb)
  }
}
