import type { InlineConfig, ResolvedConfig, UserConfig as ViteConfig } from 'vite'
import type { Context } from '../context.js'
import { mergeConfig as mergeViteConfig } from 'vite'

/**
 * Applies the user's `vite` histoire option on top of a Vite config and
 * normalizes the resulting plugin list.
 *
 * Plugins are flattened (a plugin option can be a nested and/or async array)
 * before `viteIgnorePlugins` is applied, so ignoring by name works regardless
 * of how the plugin was declared.
 * Accepts an already-resolved Vite config too (the one the context is built
 * from): only its plugin list is rewritten, everything else is passed through,
 * which is why the input type is handed back to the caller.
 * @param inputConfig The config to extend.
 * @param ctx The histoire context.
 */
export async function mergeHistoireViteConfig<T extends InlineConfig | ResolvedConfig>(
  inputConfig: T,
  ctx: Context,
): Promise<T> {
  let viteConfig = inputConfig as InlineConfig

  if (ctx.config.vite) {
    const command = ctx.mode === 'dev' ? 'serve' : 'build'
    const overrides = typeof ctx.config.vite === 'function'
      ? await ctx.config.vite(viteConfig as ViteConfig, {
        mode: ctx.mode,
        command,
      })
      : ctx.config.vite
    if (overrides) {
      viteConfig = mergeViteConfig(viteConfig, overrides)
    }
  }

  let flatPlugins = []
  if (viteConfig.plugins) {
    for (const pluginOption of viteConfig.plugins) {
      const resolvedPluginOption = await pluginOption
      if (Array.isArray(resolvedPluginOption)) {
        flatPlugins.push(...await Promise.all(resolvedPluginOption))
      }
      else {
        flatPlugins.push(resolvedPluginOption)
      }
    }
    flatPlugins = flatPlugins.filter(Boolean)
  }

  if (ctx.config.viteIgnorePlugins) {
    flatPlugins = flatPlugins.filter(plugin => !ctx.config.viteIgnorePlugins.includes(plugin.name))
  }

  viteConfig.plugins = flatPlugins

  return viteConfig as T
}
