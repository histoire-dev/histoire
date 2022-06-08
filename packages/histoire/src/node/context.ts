import { resolveConfig as resolveViteConfig } from 'vite'
import type { ServerStoryFile } from '@histoire/shared'
import { resolveConfig, HistoireConfig, ConfigMode } from './config.js'

export interface Context {
  root: string
  config: HistoireConfig
  mode: ConfigMode
  storyFiles: ServerStoryFile[]
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
