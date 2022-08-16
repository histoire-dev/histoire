import { resolveConfig as resolveViteConfig } from 'vite'
import type {
  ServerStoryFile,
  FinalSupportPlugin,
  ServerMarkdownFile,
  HistoireConfig,
  ConfigMode,
} from '@histoire/shared'
import { resolveConfig } from './config.js'

export interface Context {
  root: string
  config: HistoireConfig
  mode: ConfigMode
  storyFiles: ServerStoryFile[]
  supportPlugins: FinalSupportPlugin[]
  markdownFiles: ServerMarkdownFile[]
}

export interface CreateContextOptions {
  mode: Context['mode']
}

export async function createContext (options: CreateContextOptions): Promise<Context> {
  const config = await resolveConfig(process.cwd(), options.mode)
  const viteConfig = await resolveViteConfig({}, 'build')

  const supportPlugins = config.plugins.map(p => p.supportPlugin).filter(Boolean)

  return {
    root: viteConfig.root,
    config,
    mode: options.mode,
    storyFiles: [],
    supportPlugins,
    markdownFiles: [],
  }
}
