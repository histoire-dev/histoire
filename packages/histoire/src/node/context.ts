import type {
  ConfigMode,
  FinalSupportPlugin,
  HistoireConfig,
  PluginCommand,
  ServerMarkdownFile,
  ServerStoryFile,
} from '@histoire/shared'
import type { ResolvedConfig } from 'vite'
import { resolve } from 'pathe'
import { resolveConfig as resolveViteConfig } from 'vite'
import { processConfig, resolveConfig } from './config/index.js'
import { closeContext, getContextRegistry } from './runtime/registry.js'
import { mergeHistoireViteConfig } from './vite/index.js'

export { closeContext } from './runtime/registry.js'

export interface Context {
  root: string
  /** Explicit configuration location reused by isolated library operations. */
  configFile?: string
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
  /** Explicit project root; legacy CLI callers default to launch cwd. */
  root?: string
  mode: Context['mode']
  configFile?: string
}

/** Resolves a private project capture without changing process cwd or environment. */
export async function createContext(options: CreateContextOptions): Promise<Context> {
  const root = resolve(options.root ?? process.cwd())
  // Scope exists before configuration: defaultConfig may acquire Nuxt resources.
  const ctx: Context = {
    root,
    configFile: options.configFile ? resolve(root, options.configFile) : undefined,
    config: undefined,
    // Filled in right below: merging the Histoire Vite config needs the context
    // itself (plugins receive it), so the field cannot be built before it.
    resolvedViteConfig: undefined,
    mode: options.mode,
    storyFiles: [],
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }

  const { pluginContext } = getContextRegistry(ctx)
  try {
    ctx.config = await resolveConfig(root, options.mode, options.configFile, pluginContext)
    const command = options.mode === 'dev' ? 'serve' : 'build'
    const viteConfig = await resolveViteConfig({ root }, command)
    ctx.supportPlugins = ctx.config.plugins.map(plugin => plugin.supportPlugin).filter(Boolean)
    ctx.resolvedViteConfig = await mergeHistoireViteConfig(viteConfig, ctx)
    await processConfig(ctx)
    for (const plugin of ctx.config.plugins) {
      await plugin.configResolved?.(ctx.config, pluginContext)
      if (plugin.commands?.length) ctx.registeredCommands.push(...plugin.commands)
    }
    return ctx
  }
  catch (error) {
    try {
      await closeContext(ctx)
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], String(error))
    }
    throw error
  }
}
