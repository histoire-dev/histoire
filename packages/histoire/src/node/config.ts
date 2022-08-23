import path from 'pathe'
import { createDefu } from 'defu'
import {
  createServer,
  resolveConfig as resolveViteConfig,
  mergeConfig as mergeViteConfig,
} from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import pc from 'picocolors'
import type {
  HistoireConfig,
  SupportMatchPattern,
  ConfigMode,
  Plugin,
} from '@histoire/shared'
import { defaultColors } from './colors.js'
import { findUp } from './util/find-up.js'
import { tailwindTokens } from './builtin-plugins/tailwind-tokens.js'
import { vanillaSupport } from './builtin-plugins/vanilla-support/plugin.js'

export function getDefaultConfig (): HistoireConfig {
  return {
    plugins: [
      vanillaSupport(),
      tailwindTokens(),
    ],
    outDir: '.histoire/dist',
    storyMatch: [
      '**/*.story.vue',
      '**/*.story.svelte',
    ],
    storyIgnored: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    supportMatch: [],
    tree: {
      file: 'title',
      order: 'asc',
    },
    theme: {
      title: 'Histoire',
      colors: {
        primary: defaultColors.emerald,
        gray: defaultColors.zinc,
      },
    },
    responsivePresets: [
      {
        label: 'Mobile (Small)',
        width: 320,
        height: 560,
      },
      {
        label: 'Mobile (Medium)',
        width: 360,
        height: 640,
      },
      {
        label: 'Mobile (Large)',
        width: 414,
        height: 896,
      },
      {
        label: 'Tablet',
        width: 768,
        height: 1024,
      },
      {
        label: 'Laptop (Small)',
        width: 1024,
        height: null,
      },
      {
        label: 'Laptop (Large)',
        width: 1366,
        height: null,
      },
      {
        label: 'Desktop',
        width: 1920,
        height: null,
      },
      {
        label: '4K',
        width: 3840,
        height: null,
      },
    ],
    backgroundPresets: [
      {
        label: 'Transparent',
        color: 'transparent',
      },
      {
        label: 'White',
        color: '#fff',
      },
      {
        label: 'Light gray',
        color: '#aaa',
      },
      {
        label: 'Dark gray',
        color: '#333',
      },
      {
        label: 'Black',
        color: '#000',
      },
    ],
    sandboxDarkClass: 'dark',
    routerMode: 'history',
    vite: (config) => {
      // Remove vite:legacy plugins https://github.com/histoire-dev/histoire/issues/156
      const index = config.plugins?.findIndex(plugin => Array.isArray(plugin) &&
        typeof plugin[0] === 'object' &&
        !Array.isArray(plugin[0]) &&
        // @ts-expect-error could have no property 'name'
        plugin[0].name?.startsWith('vite:legacy'))
      if (index !== -1) {
        config.plugins?.splice(index, 1)
      }

      return {
        build: {
          lib: false,
        },
      }
    },
    viteIgnorePlugins: [],
  }
}

export const configFileNames = [
  'histoire.config.ts',
  'histoire.config.js',
  '.histoire.ts',
  '.histoire.js',
]

export function resolveConfigFile (cwd: string = process.cwd()): string {
  return findUp(cwd, configFileNames)
}

export async function loadConfigFile (configFile: string): Promise<Partial<HistoireConfig>> {
  try {
    const server = await createServer()
    await server.pluginContainer.buildStart({})
    const node = new ViteNodeServer(server, {
      deps: {
        inline: [
          /histoire\/dist/,
        ],
      },
    })
    const runner = new ViteNodeRunner({
      root: path.dirname(configFile),
      fetchModule (id) {
        return node.fetchModule(id)
      },
      resolveId (id, importer) {
        return node.resolveId(id, importer)
      },
    })
    const result: { default: Partial<HistoireConfig> } = await runner.executeFile(configFile)
    await server.close()
    if (!result.default) {
      throw new Error(`Expected default export in ${configFile}`)
    }
    return result.default
  } catch (e) {
    console.error(pc.red(`Error while loading ${configFile}`))
    throw e
  }
}

export const mergeConfig = createDefu((obj: any, key, value) => {
  if (obj[key] && key === 'vite') {
    const initialValue = obj[key]
    if (typeof value === 'function') {
      obj[key] = async (...args) => {
        const result = await value(...args)
        return mergeViteConfig(initialValue, result)
      }
    } else {
      obj[key] = mergeViteConfig(initialValue, value)
    }
    return true
  }

  if (obj[key] && key === 'plugins') {
    const initialValue = obj[key] as Plugin[]
    const newValue = obj[key] = [...value]
    const nameMap = newValue.reduce((map, plugin) => {
      map[plugin.name] = true
      return map
    }, {})
    for (const plugin of initialValue) {
      if (!nameMap[plugin.name]) {
        newValue.unshift(plugin)
      }
    }
    return true
  }

  if (obj[key] && key === 'setupCode') {
    obj[key] = [...obj[key], ...value]
    return true
  }

  if (obj[key] && key === 'supportMatch') {
    for (const item of value as SupportMatchPattern[]) {
      const existing: SupportMatchPattern = obj[key].find(p => p.id === item.id)
      if (existing) {
        existing.patterns = [...existing.patterns, ...item.patterns]
        existing.pluginIds = [...existing.pluginIds, ...item.pluginIds]
      } else {
        obj[key].push(item)
      }
    }
    return true
  }

  // By default, arrays should be replaced
  if (obj[key] && Array.isArray(obj[key])) {
    obj[key] = value
    return true
  }
})

export async function resolveConfig (cwd: string = process.cwd(), mode: ConfigMode): Promise<HistoireConfig> {
  let result: Partial<HistoireConfig>
  const configFile = resolveConfigFile(cwd)
  if (configFile) {
    result = await loadConfigFile(configFile)
  }
  const viteConfig = await resolveViteConfig({}, 'serve')
  const viteHistoireConfig = (viteConfig.histoire ?? {}) as HistoireConfig

  const preUserConfig = mergeConfig(result, viteHistoireConfig)
  const processedDefaultConfig = await processDefaultConfig(getDefaultConfig(), preUserConfig, mode)

  return processConfig(mergeConfig(preUserConfig, processedDefaultConfig), mode)
}

export async function processConfig (config: HistoireConfig, mode: ConfigMode): Promise<HistoireConfig> {
  for (const plugin of config.plugins) {
    if (plugin.config) {
      const result = await plugin.config(config, mode)
      if (result) {
        config = mergeConfig(result, config)
      }
    }
  }
  config.outDir = path.resolve(process.cwd(), config.outDir)
  return config
}

export async function processDefaultConfig (defaultConfig: HistoireConfig, preUserConfig: HistoireConfig, mode: ConfigMode): Promise<HistoireConfig> {
  for (const plugin of [...defaultConfig.plugins, ...preUserConfig.plugins]) {
    if (plugin.defaultConfig) {
      const result = await plugin.defaultConfig(defaultConfig, mode)
      if (result) {
        defaultConfig = mergeConfig(result, defaultConfig)
      }
    }
  }
  return defaultConfig
}

export function defineConfig (config: Partial<HistoireConfig>) {
  return config
}

declare module 'vite' {
  interface UserConfig {
    /**
     * Histoire configuration
     */
    histoire?: Partial<HistoireConfig>
  }
}
