import type {
  ConfigMode,
  FinalSupportPlugin,
  HistoireConfig,
  PluginCommand,
  ServerMarkdownFile,
  ServerStoryFile,
} from '@histoire/shared'
import type { ResolvedConfig } from 'vite'
import { resolveConfig as resolveViteConfig } from 'vite'
import { processConfig, resolveConfig } from './config/index.js'
import { mergeHistoireViteConfig } from './vite/index.js'

export interface Context {
  root: string
  config: HistoireConfig
  /**
   * Vite's resolved config, with the Histoire overrides merged on top — the
   * merge produces a plain config object, not another `ResolvedConfig`, so only
   * the fields both shapes share (`root`, `base`, `publicDir`…) are readable.
   */
  resolvedViteConfig: Pick<ResolvedConfig, 'root' | 'base' | 'publicDir'>
  mode: ConfigMode
  storyFiles: ServerStoryFile[]
  supportPlugins: FinalSupportPlugin[]
  markdownFiles: ServerMarkdownFile[]
  registeredCommands?: PluginCommand[]
}

export interface CreateContextOptions {
  mode: Context['mode']
  configFile?: string
}

export async function createContext(options: CreateContextOptions): Promise<Context> {
  const config = await resolveConfig(process.cwd(), options.mode, options.configFile)
  const command = options.mode === 'dev' ? 'serve' : 'build'
  const viteConfig = await resolveViteConfig({}, command)

  const supportPlugins = config.plugins.map(p => p.supportPlugin).filter(Boolean)

  const ctx: Context = {
    root: viteConfig.root,
    config,
    // Filled in right below: merging the Histoire Vite config needs the context
    // itself (plugins receive it), so the field cannot be built before it.
    resolvedViteConfig: viteConfig,
    mode: options.mode,
    storyFiles: [],
    supportPlugins,
    markdownFiles: [],
    registeredCommands: [],
  }

  ctx.resolvedViteConfig = await mergeHistoireViteConfig(viteConfig, ctx)

  await processConfig(ctx)

  // List commands
  for (const plugin of ctx.config.plugins) {
    if (plugin.commands?.length) {
      ctx.registeredCommands.push(...plugin.commands)
    }
  }

  return ctx
}
