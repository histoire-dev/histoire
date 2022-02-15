import path from 'pathe'
import fs from 'fs'
import defu from 'defu'
import { createServer } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import pc from 'picocolors'
import { TreeFile } from './tree.js'

export interface HistoireConfig {
  sourceDir: string
  outDir: string
  storyMatch: string[]
  tree: {
    file?: 'title' | 'path' | ((file: TreeFile) => string[])
    order?: 'asc' | ((a: string, b: string) => number)
  }
}

export function getDefaultConfig (): HistoireConfig {
  return {
    sourceDir: 'src',
    outDir: 'histoire-dist',
    storyMatch: ['**/*.story.vue'],
    tree: {
      file: 'title',
      order: 'asc',
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
  const { root } = path.parse(cwd)
  let dir = cwd

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
  } else {
    result = {}
  }
  return processConfig(defu(result, getDefaultConfig()))
}

export function processConfig (config: HistoireConfig): HistoireConfig {
  config.sourceDir = path.resolve(process.cwd(), config.sourceDir)
  config.outDir = path.resolve(process.cwd(), config.outDir)
  return config
}

export function defineConfig (config: Partial<HistoireConfig>) {
  return config
}
