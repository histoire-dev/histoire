import path from 'pathe'
import fs from 'fs'
import defu from 'defu'
import { createServer, resolveConfig as resolveViteConfig } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import pc from 'picocolors'
import { TreeFile } from './tree.js'
import { defaultColors } from './colors.js'

type CustomizableColors = 'primary' | 'gray'
type ColorKeys = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
type GrayColorKeys = ColorKeys | '750' | '850' | '950'

export interface HistoireConfig {
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
     * Href to the favicon file (**not** processed by Vite). Put the file in the public directory.
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
  }
  /**
   * Setup file exposting a default function executed when setting up each story preview.
   *
   * Import custom CSS files from this file.
   *
   * Example: `'/src/histoire-setup.ts'`
   */
  setupFile?: string
}

export function getDefaultConfig (): HistoireConfig {
  return {
    outDir: 'histoire-dist',
    storyMatch: ['**/*.story.vue'],
    storyIgnored: ['**/node_modules/**'],
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
  }
}

export const configFileNames = [
  'histoire.config.ts',
  'histoire.config.js',
  '.histoire.ts',
  '.histoire.js',
]

export function resolveConfigFile (cwd: string = process.cwd()): string {
  let { root } = path.parse(cwd)
  let dir = cwd

  // Fix for windows, waiting for pathe to fix this: https://github.com/unjs/pathe/issues/5
  if (root === '' && dir[1] === ':') {
    root = dir.substring(0, 2)
  }

  while (dir !== root) {
    for (const fileName of configFileNames) {
      const searchPath = path.join(dir, fileName)
      if (fs.existsSync(searchPath)) {
        return searchPath
      }
    }
    dir = path.dirname(dir)
  }

  return null
}

export async function loadConfigFile (configFile: string): Promise<Partial<HistoireConfig>> {
  try {
    const server = await createServer()
    await server.pluginContainer.buildStart({})
    const node = new ViteNodeServer(server)
    const runner = new ViteNodeRunner({
      root: path.dirname(configFile),
      fetchModule (id) {
        return node.fetchModule(id)
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

export async function resolveConfig (cwd: string = process.cwd()): Promise<HistoireConfig> {
  let result: Partial<HistoireConfig>
  const configFile = resolveConfigFile(cwd)
  if (configFile) {
    result = await loadConfigFile(configFile)
  }
  const viteConfig = await resolveViteConfig({}, 'serve')
  const viteHistoireConfig = (viteConfig.histoire ?? {}) as HistoireConfig
  return processConfig(defu(result, viteHistoireConfig, getDefaultConfig()))
}

export function processConfig (config: HistoireConfig): HistoireConfig {
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
