import type {
  BuildEndCallback,
  ChangeViteConfigCallback,
  HistoireConfig,
  ModuleLoader,
  Plugin,
  PluginApiBase,
  PluginApiBuild,
  PluginApiDev,
  PluginApiDevEvent,
  PreviewStoryCallback,
  ServerStory,
} from '@histoire/shared'
import type { Context } from './context.js'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import path from 'pathe'
import pc from 'picocolors'
import { getContextRegistry } from './runtime/registry.js'
import { addStory, removeStory } from './stories.js'
import { toTempPathSegment } from './util/temp-paths.js'

export class BasePluginApi implements PluginApiBase {
  colors = pc
  path = path
  fs = fs

  constructor(
    protected ctx: Context,
    protected plugin: Plugin,
    public moduleLoader: ModuleLoader,
  ) { }

  /** Resolved project root, independent from the caller's process cwd. */
  get root() {
    return this.ctx.root
  }

  /** Trusted configuration/resource ownership for the captured generation. */
  getContext() {
    return getContextRegistry(this.ctx).pluginContext
  }

  /** Isolated mutable plugin output, unique across operation captures. */
  get pluginTempDir() {
    return path.resolve(getContextRegistry(this.ctx).tempDir, 'plugins', toTempPathSegment(this.plugin.name))
  }

  log(...msg) {
    console.log(this.colors.gray(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  warn(...msg) {
    console.warn(this.colors.yellow(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  error(...msg) {
    console.error(this.colors.red(`[Plugin:${this.plugin.name}]`), ...msg)
  }

  addStoryFile(file: string) {
    removeStory(this.ctx, file)
    addStory(this.ctx, file)
  }

  getStories(): ServerStory[] {
    return this.ctx.storyFiles.map(f => f.story).filter(Boolean)
  }

  getConfig(): HistoireConfig {
    return this.ctx.config
  }
}

export class DevPluginApi extends BasePluginApi implements PluginApiDev {
  watcher = chokidar
}

export class BuildPluginApi extends BasePluginApi implements PluginApiBuild {
  changeViteConfigCallbacks: ChangeViteConfigCallback[] = []
  buildEndCallbacks: BuildEndCallback[] = []
  previewStoryCallbacks: PreviewStoryCallback[] = []

  changeViteConfig(cb: ChangeViteConfigCallback) {
    this.changeViteConfigCallbacks.push(cb)
  }

  onBuildEnd(cb: BuildEndCallback) {
    this.buildEndCallbacks.push(cb)
  }

  onPreviewStory(cb: PreviewStoryCallback) {
    this.previewStoryCallbacks.push(cb)
  }
}

export class DevEventPluginApi extends BasePluginApi implements PluginApiDevEvent {
  constructor(
    ctx: Context,
    plugin: Plugin,
    moduleLoader: ModuleLoader,
    public event: string,
    public payload: any,
  ) {
    super(ctx, plugin, moduleLoader)
  }
}
