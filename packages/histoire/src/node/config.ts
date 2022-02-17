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
  outDir: string
  storyMatch: string[]
  tree: {
    file?: 'title' | 'path' | ((file: TreeFile) => string[])
    order?: 'asc' | ((a: string, b: string) => number)
  }
  theme: {
    title?: string
    logo?: {
      square?: string
      light?: string
      dark?: string
    }
    favicon?: string
    colors?: {
      [key in CustomizableColors]?: key extends 'gray' ? {
        [key in GrayColorKeys]?: string
      } :{
        [key in ColorKeys]?: string
      }
    }
  }
  setupFile?: string
}

export function getDefaultConfig (): HistoireConfig {
  return {
    outDir: 'histoire-dist',
    storyMatch: ['**/*.story.vue'],
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
