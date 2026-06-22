import type {
  ConfigMode,
  FinalSupportPlugin,
  HistoireConfig,
  PluginCommand,
  ServerMarkdownFile,
  ServerStoryFile,
} from '@histoire/shared'
import type { InlineConfig, ResolvedConfig } from 'vite'
import { resolveConfig as resolveViteConfig } from 'vite'
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
  registeredCommands: PluginCommand[]
}

export interface CreateContextOptions {
  mode: Context['mode']
  configFile?: string
}

export async function createContext(options: CreateContextOptions): Promise<Context> {
  const config = await resolveConfig(process.cwd(), options.mode, options.configFile)
  const command = options.mode === 'dev' ? 'serve' : 'build'
  const viteConfig = await resolveViteConfig({}, command)

  const supportPlugins = config.plugins
    .map(p => p.supportPlugin)
    .filter((plugin): plugin is FinalSupportPlugin => Boolean(plugin))

  const ctx: Context = {
    root: viteConfig.root,
    config,
    resolvedViteConfig: viteConfig,
    mode: options.mode,
    storyFiles: [],
    supportPlugins,
    markdownFiles: [],
    registeredCommands: [],
  }

  ctx.resolvedViteConfig = await mergeHistoireViteConfig(viteConfig as unknown as InlineConfig, ctx) as unknown as ResolvedConfig

  await processConfig(ctx)

  // List commands
  for (const plugin of ctx.config.plugins) {
    if (plugin.commands?.length) {
      ctx.registeredCommands.push(...plugin.commands)
    }
  }

  return ctx
}
