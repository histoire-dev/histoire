import path from 'pathe'
import fs from 'fs'
import defu from 'defu'
import { createServer, resolveConfig as resolveViteConfig } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import pc from 'picocolors'
import { TreeFile } from './tree.js'

type AvailableColors =
  | 'primary-50'
  | 'primary-100'
  | 'primary-200'
  | 'primary-300'
  | 'primary-400'
  | 'primary-500'
  | 'primary-600'
  | 'primary-700'
  | 'primary-800'
  | 'primary-900'
  | 'gray-50'
  | 'gray-100'
  | 'gray-200'
  | 'gray-300'
  | 'gray-400'
  | 'gray-500'
  | 'gray-600'
  | 'gray-700'
  | 'gray-800'
  | 'gray-900';

export interface HistoireConfig {
  outDir: string
  storyMatch: string[]
  tree: {
    file?: 'title' | 'path' | ((file: TreeFile) => string[])
    order?: 'asc' | ((a: string, b: string) => number)
  }
  theme: {
    title: string
    logo?: {
      square?: string
      light?: string
      dark?: string
    }
    colors?: {
      [key in AvailableColors]?: string
    }
    setupFile?: string
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
