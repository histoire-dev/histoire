import { resolveConfig as resolveViteConfig } from 'vite'
import { resolveConfig, HistoireConfig, ConfigMode } from './config.js'
import type { StoryFile } from './types.js'

export interface Context {
  root: string
  config: HistoireConfig
  mode: ConfigMode
  storyFiles: StoryFile[]
}

export interface CreateContextOptions {
  mode: Context['mode']
}

export async function createContext (options: CreateContextOptions) {
  const config = await resolveConfig(process.cwd(), options.mode)
  const viteConfig = await resolveViteConfig({}, 'build')
  return {
    root: viteConfig.root,
    config,
    mode: options.mode,
    storyFiles: [],
  }
}
