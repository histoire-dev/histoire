import chokidar from 'chokidar'
import path from 'pathe'
import fs from 'fs-extra'
import pc from 'picocolors'
import type {
  Plugin,
  PluginApiBase,
  PluginApiDev,
  PluginApiBuild,
  BuildEndCallback,
  PreviewStoryCallback,
  ModuleLoader,
} from '@histoire/shared'
import { TEMP_PATH } from './alias.js'
import type { Context } from './context.js'
import { addStory, removeStory } from './stories.js'

export class BasePluginApi implements PluginApiBase {
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
    return path.resolve(TEMP_PATH, 'plugins', this.plugin.name.replace(/:/g, '_'))
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

export class DevPluginApi extends BasePluginApi implements PluginApiDev {
  watcher = chokidar
}

export class BuildPluginApi extends BasePluginApi implements PluginApiBuild {
  buildEndCallbacks: BuildEndCallback[] = []
  previewStoryCallbacks: PreviewStoryCallback[] = []

  onBuildEnd (cb: BuildEndCallback) {
    this.buildEndCallbacks.push(cb)
  }

  onPreviewStory (cb: PreviewStoryCallback) {
    this.previewStoryCallbacks.push(cb)
  }
}
