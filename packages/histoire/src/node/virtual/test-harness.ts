import type { Context } from '../context.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function testHarness(ctx: Context) {
  const variantTestSessionId = require.resolve('./variant-test-session.js')
  const files = ctx.storyFiles
    .filter(file => !!file.story)
    .map(file => ({
      id: file.id,
      path: file.treePath,
      filePath: file.relativePath,
      docsFilePath: file.markdownFile?.relativePath,
      supportPluginId: file.supportPluginId,
      story: file.story,
      moduleId: file.moduleId,
    }))
  const loaders = files.map(file => `'${file.id}': () => import(${JSON.stringify(file.moduleId)})`)

  return `
import 'virtual:$histoire-theme'
import { createVariantTestSession } from ${JSON.stringify(variantTestSessionId)}

const files = ${JSON.stringify(files)}
const moduleLoaders = {
  ${loaders.join(',\n  ')}
}

globalThis.vi ??= {}
globalThis.vitest ??= globalThis.vi

function runWithVitestDynamicImport(loader) {
  const runner = globalThis.__vitest_browser_runner__
  const wrapDynamicImport = runner?.wrapDynamicImport
  return typeof wrapDynamicImport === 'function' ? wrapDynamicImport(loader) : loader()
}

const variantTestSession = createVariantTestSession({
  files,
  moduleLoaders,
  runWithDynamicImport: runWithVitestDynamicImport,
})

export async function collectVariantTests(storyId, variantId) {
  return await variantTestSession.collectVariantTests(storyId, variantId)
}

export async function runCollectedTest(storyId, variantId, definition) {
  await variantTestSession.runCollectedTest(storyId, variantId, definition)
}
`
}
