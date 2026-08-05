import type { ConfigMode, HistoireConfig } from '@histoire/shared'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import path from 'pathe'
import pc from 'picocolors'
import { resolveConfig as resolveViteConfig } from 'vite'
import { findUp } from '../util/find-up.js'
import { getDefaultConfig } from './defaults.js'
import { mergeConfig } from './merge.js'

const __filename = fileURLToPath(import.meta.url)

/** Config file names looked up from the working directory, in order. */
export const configFileNames = [
  'histoire.config.ts',
  'histoire.config.js',
  '.histoire.ts',
  '.histoire.js',
]

/**
 * Locates the Histoire config file.
 *
 * @param cwd Directory the search starts from.
 * @param configFile Explicit path, always resolved from `cwd` when given.
 * @returns The config file path, or `null` when the project has none (which is
 * supported: Histoire then runs on its defaults).
 */
export function resolveConfigFile(cwd: string = process.cwd(), configFile?: string): string | null {
  if (configFile) {
    // explicit config path is always resolved from cwd
    return path.resolve(configFile)
  }
  else {
    return findUp(cwd, configFileNames)
  }
}

/**
 * Imports a config file through jiti (so TypeScript configs work) and returns
 * its default export.
 */
export async function loadConfigFile(configFile: string): Promise<Partial<HistoireConfig>> {
  try {
    const jiti = createJiti(__filename, {
      moduleCache: false,
    })
    const result = await jiti.import(configFile, { default: true }) as Partial<HistoireConfig>
    if (!result) {
      throw new Error(`Expected default export in ${configFile}`)
    }
    return result
  }
  catch (e) {
    console.error(pc.red(`Error while loading ${configFile}`))
    throw e
  }
}

/**
 * Resolves the final Histoire config: the config file, the `histoire` key of
 * the Vite config and the (plugin-processed) defaults, merged in that order.
 */
export async function resolveConfig(cwd: string = process.cwd(), mode: ConfigMode, configFile: string): Promise<HistoireConfig> {
  let result: Partial<HistoireConfig>
  const resolvedConfigFile = resolveConfigFile(cwd, configFile)
  if (resolvedConfigFile) {
    result = await loadConfigFile(resolvedConfigFile)
  }
  const viteConfig = await resolveViteConfig({}, 'serve')
  const viteHistoireConfig = (viteConfig.histoire ?? {}) as HistoireConfig

  const preUserConfig = mergeConfig(result, viteHistoireConfig)
  const processedDefaultConfig = await processDefaultConfig(getDefaultConfig(), preUserConfig, mode, cwd)

  return resolveConfigPlugins(mergeConfig(preUserConfig, processedDefaultConfig), mode)
}

/** Applies the `config` hook of every resolved plugin. */
async function resolveConfigPlugins(config: HistoireConfig, mode: ConfigMode): Promise<HistoireConfig> {
  for (const plugin of config.plugins) {
    if (plugin.config) {
      const result = await plugin.config(config, mode)
      if (result) {
        config = mergeConfig(result, config)
      }
    }
  }
  return config
}

/** Applies the `defaultConfig` hook of the builtin and user plugins. */
async function processDefaultConfig(defaultConfig: HistoireConfig, preUserConfig: HistoireConfig, mode: ConfigMode, _cwd: string): Promise<HistoireConfig> {
  // Apply plugins
  for (const plugin of [...defaultConfig.plugins, ...preUserConfig.plugins ?? []]) {
    if (plugin.defaultConfig) {
      const result = await plugin.defaultConfig(defaultConfig, mode)
      if (result) {
        defaultConfig = mergeConfig(result, defaultConfig)
      }
    }
  }
  return defaultConfig
}
