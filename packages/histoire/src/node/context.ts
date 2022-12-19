import { resolveConfig as resolveViteConfig, ResolvedConfig } from 'vite'
import type {
  ServerStoryFile,
  FinalSupportPlugin,
  ServerMarkdownFile,
  HistoireConfig,
  ConfigMode,
} from '@histoire/shared'
import { processConfig, resolveConfig } from './config.js'
import { mergeHistoireViteConfig } from './vite.js'

export interface Context {
  root: string
  config: HistoireConfig
  resolvedViteConfig: ResolvedConfig
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
  const command = options.mode === 'dev' ? 'serve' : 'build'
  const viteConfig = await resolveViteConfig({}, command)

  const supportPlugins = config.plugins.map(p => p.supportPlugin).filter(Boolean)

  const ctx = {
    root: viteConfig.root,
    config,
    resolvedViteConfig: null,
    mode: options.mode,
    storyFiles: [],
    supportPlugins,
    markdownFiles: [],
  }

  ctx.resolvedViteConfig = await mergeHistoireViteConfig(viteConfig as unknown, ctx)

  await processConfig(ctx)

  return ctx
}
