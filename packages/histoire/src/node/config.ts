import path from 'pathe'
import { createDefu } from 'defu'
import {
  createServer,
  resolveConfig as resolveViteConfig,
  UserConfig as ViteConfig,
  ConfigEnv as ViteConfigEnv,
  mergeConfig as mergeViteConfig,
} from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import pc from 'picocolors'
import type MarkdownIt from 'markdown-it'
import { TreeFile } from './tree.js'
import { defaultColors } from './colors.js'
import { Plugin } from './plugin.js'
import { findUp } from './util/find-up.js'
import { tailwindTokens } from './builtin-plugins/tailwind-tokens.js'

type CustomizableColors = 'primary' | 'gray'
type ColorKeys = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
type GrayColorKeys = ColorKeys | '750' | '850' | '950'

export interface ResponsivePreset {
  label: string
  width: number
  height: number
}

export interface BackgroundPreset {
  label: string
  color: string
}

export interface TreeGroupConfig {
  title: string
  id?: string
  include?: (file: TreeFile) => boolean
}

export interface HistoireConfig {
  plugins: Plugin[]
  /**
   * Output directory.
   */
  outDir: string
  /**
   * Glob patterns for story files to include.
   */
  storyMatch: string[]
  /**
   * Glob patterns to ignore files while searching for story files.
   */
  storyIgnored: string[]
  /**
   * How to generate the story tree.
   */
  tree: {
    /**
     * Use `'title'` to create the path from the title of the story, using `/` as the separator.
     *
     * Use `'path'` use the real folder structure on your computer.
     */
    file?: 'title' | 'path' | ((file: TreeFile) => string[])
    order?: 'asc' | ((a: string, b: string) => number)
    groups?: TreeGroupConfig[]
  }
  /**
   * Customize the look of the histoire book.
   */
  theme: {
    /**
     * Main page title. For example: 'Acme Inc.'
     */
    title?: string
    /**
     * Custom logo files. Should be import paths (processed by Vite).
     *
     * Example: `'/src/assets/my-logo.svg'`
     */
    logo?: {
      /**
       * Square logo without text.
       */
      square?: string
      /**
       * Full logo for light theme.
       */
      light?: string
      /**
       * Full logo for dark theme.
       */
      dark?: string
    }
    /**
     * Href to the favicon file (**not** processed by Vite). Put the file in the `public` directory.
     *
     * Example: `'/favicon.ico'`
     */
    favicon?: string
    /**
     * Customize the colors. Each color should be an object with shades as keys.
     *
     * Example: ```{ primary: { 50: '#eef2ff', 100: '#e0e7ff', ..., 900: '#312e81' } }```
     *
     * You can import `defaultColors` from `'histoire'` to use predefined colors or you can create your own colors from scratch.
     */
    colors?: {
      [key in CustomizableColors]?: key extends 'gray' ? {
        [key in GrayColorKeys]?: string
      } :{
        [key in ColorKeys]?: string
      }
    }
    /**
     * Add a link to the main logo
     */
    logoHref?: string
  }
  /**
   * Setup file exporting a default function executed when setting up each story preview.
   *
   * Import custom CSS files from this file.
   *
   * Example: `'/src/histoire-setup.ts'`
   */
  setupFile?: string
  /**
   * Predefined responsive sizes for story playgrounds.
   */
  responsivePresets?: ResponsivePreset[]
  /**
   * Background color of the story preview.
   */
  backgroundPresets?: BackgroundPreset[]
  /**
   * Class added to the html root of the story preview when dark mode is enabled.
   */
  sandboxDarkClass?: string
  /**
   * Customize the markdown-it renderer
   */
  markdown?: (md: MarkdownIt) => MarkdownIt | Promise<MarkdownIt>
  /**
   * Vite config override
   */
  vite?: ViteConfig | ((config: ViteConfig, env: ViteConfigEnv) => void | ViteConfig | Promise<void | ViteConfig>)
}

export type ConfigMode = 'build' | 'dev'

export function getDefaultConfig (): HistoireConfig {
  return {
    plugins: [
      tailwindTokens(),
    ],
    outDir: '.histoire/dist',
    storyMatch: ['**/*.story.vue'],
    storyIgnored: [
      '**/node_modules/**',
      '**/dist/**',
    ],
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
    obj[key] = mergeViteConfig(obj[key], value)
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
})

export async function resolveConfig (cwd: string = process.cwd(), mode: ConfigMode): Promise<HistoireConfig> {
  let result: Partial<HistoireConfig>
  const configFile = resolveConfigFile(cwd)
  if (configFile) {
    result = await loadConfigFile(configFile)
  }
  const viteConfig = await resolveViteConfig({}, 'serve')
  const viteHistoireConfig = (viteConfig.histoire ?? {}) as HistoireConfig
  return processConfig(mergeConfig(result, viteHistoireConfig, getDefaultConfig()), mode)
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
