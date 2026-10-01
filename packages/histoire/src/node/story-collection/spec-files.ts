import type { Context } from '../context.js'
import type { CollectionSpecFile } from './types.js'
import fs from 'fs-extra'
import { join, relative } from 'pathe'
import { assertNoDuplicateTempPaths, toTempPathSegment } from '../util/temp-paths.js'
import { browserCollector } from '../virtual/browser-collector.js'
import { resolvedSupportPluginsCollect } from '../virtual/resolved-support-plugins-collect.js'
import { BROWSER_COLLECTION_ENDPOINT } from './channel.js'

/**
 * Story file descriptor handed to the generated browser collector module.
 */
interface BrowserStoryModuleFile {
  id: string
  path: string
  relativePath: string
  fileName: string
  supportPluginId: string
  moduleId: string
  virtual: boolean
}

/**
 * Builds the flat temp path segment (without extension) of a story file.
 * @param relativePath Story path relative to the project root.
 */
function getTempStoryPath(relativePath: string) {
  return toTempPathSegment(
    relativePath,
    value => value.replace(/\.[^.]+$/, '').replace(/[\\/:]/g, '__'),
  )
}

/**
 * Writes the Vitest spec files driving the browser story collection.
 *
 * One spec per story file: a failing story then fails its own spec only,
 * instead of aborting the collection of every other story.
 * @param ctx The histoire context.
 * @param runToken Token identifying this run in the collection channel.
 * @param root Directory owned by this run, where the specs are generated.
 * @param storyFiles Story files to collect, defaults to the whole context.
 * @returns The generated specs, each mapped back to the story it collects.
 */
export async function generateCollectionSpecFiles(
  ctx: Context,
  runToken: string,
  root: string,
  storyFiles = ctx.storyFiles,
): Promise<CollectionSpecFile[]> {
  await fs.emptyDir(root)
  const browserStoryFiles = await generateBrowserStoryModuleFiles(ctx, root, storyFiles)
  const collectorModulePath = join(root, 'browser-collector.histoire.mjs')
  await fs.writeFile(collectorModulePath, generateCollectorModuleCode(ctx, browserStoryFiles), 'utf8')
  const files: CollectionSpecFile[] = []

  // Defense in depth: two story files whose temp paths collide would overwrite
  // each other's spec and one story would never be collected.
  assertNoDuplicateTempPaths(
    storyFiles.map(storyFile => ({
      path: getTempStoryPath(storyFile.relativePath),
      label: `"${storyFile.relativePath}"`,
    })),
    'collection spec',
  )

  for (const storyFile of storyFiles) {
    const specPath = join(root, getTempStoryPath(storyFile.relativePath), 'collect.histoire.spec.ts')
    await fs.ensureDir(join(specPath, '..'))
    // Use relative path from spec file to collector module so vitest browser mode can resolve it
    const specDir = join(specPath, '..')
    const relativeCollectorPath = relative(specDir, collectorModulePath)
    const normalizedRelativePath = relativeCollectorPath.startsWith('.') ? relativeCollectorPath : `./${relativeCollectorPath}`
    await fs.writeFile(specPath, generateCollectionSpecCode(storyFile.relativePath, normalizedRelativePath, runToken), 'utf8')
    files.push({ path: specPath, relativePath: storyFile.relativePath })
  }

  return files
}

/**
 * Materializes virtual story modules on disk so the browser can import them.
 *
 * Disk-backed story files are passed through untouched.
 */
async function generateBrowserStoryModuleFiles(
  ctx: Context,
  root: string,
  storyFiles = ctx.storyFiles,
): Promise<BrowserStoryModuleFile[]> {
  return await Promise.all(storyFiles.map(async (storyFile) => {
    if (!storyFile.virtual || !storyFile.moduleCode) {
      return {
        id: storyFile.id,
        path: storyFile.path,
        relativePath: storyFile.relativePath,
        fileName: storyFile.fileName,
        supportPluginId: storyFile.supportPluginId,
        moduleId: storyFile.moduleId,
        virtual: storyFile.virtual,
      }
    }

    const modulePath = join(root, 'story-modules', `${getTempStoryPath(storyFile.relativePath)}.histoire.mjs`)
    await fs.ensureDir(join(modulePath, '..'))
    await fs.writeFile(modulePath, storyFile.moduleCode, 'utf8')

    return {
      id: storyFile.id,
      path: storyFile.path,
      relativePath: storyFile.relativePath,
      fileName: storyFile.fileName,
      supportPluginId: storyFile.supportPluginId,
      moduleId: modulePath,
      virtual: false,
    }
  }))
}

/**
 * Generates the spec that collects one story file and posts the outcome.
 *
 * Every interpolated value goes through `JSON.stringify`: paths and tokens may
 * contain quotes, backticks or `${`, which would otherwise break out of the
 * generated literals and corrupt the module.
 */
function generateCollectionSpecCode(relativePath: string, collectorModulePath: string, runToken: string) {
  return `import { test } from '@vitest/runner'
import { collectStoryFile } from ${JSON.stringify(collectorModulePath)}

async function postResult(payload) {
  const response = await fetch(${JSON.stringify(BROWSER_COLLECTION_ENDPOINT)}, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('Failed to persist histoire browser collection result for ' + ${JSON.stringify(relativePath)} + ': ' + response.status)
  }
}

test('collect histoire story', async () => {
  try {
    const result = await collectStoryFile(${JSON.stringify(relativePath)})
    await postResult({
      token: ${JSON.stringify(runToken)},
      file: ${JSON.stringify(relativePath)},
      result,
    })
  }
  catch (error) {
    await postResult({
      token: ${JSON.stringify(runToken)},
      file: ${JSON.stringify(relativePath)},
      failure: {
        file: ${JSON.stringify(relativePath)},
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      },
    })
    throw error
  }
})
`
}

/**
 * Generates the shared collector module the specs import.
 *
 * Reuses the virtual-module generators of the in-app collection, minus their
 * `virtual:` import (everything is inlined into this single on-disk module).
 */
function generateCollectorModuleCode(ctx: Context, storyFiles: BrowserStoryModuleFile[]) {
  return `${resolvedSupportPluginsCollect(ctx)}

${browserCollector(ctx, storyFiles).replace('import { collectSupportPlugins } from \'virtual:$histoire-support-plugins-collect\'\n\n', '')}
`
}
