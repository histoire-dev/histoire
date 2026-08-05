import type { Context } from '../context.js'
import type { PreviewRuntimeStoryFile } from './preview-runtime/preamble.js'
import { createRequire } from 'node:module'
import { buildStoryModuleLoaders, getRuntimeStoryFiles } from './preview-runtime/index.js'
import { VITEST_DYNAMIC_IMPORT_SNIPPET } from './vitest-runner-bootstrap.js'

const require = createRequire(import.meta.url)

/** Options of {@link buildTestHarnessSource}. */
export interface TestHarnessOptions {
  /** Resolved id of the variant test session module. */
  variantTestSessionId: string
  /** Story metadata baked into the harness at transform time. */
  files: PreviewRuntimeStoryFile[]
}

/**
 * Emits the browser test harness module: the story metadata plus one dynamic
 * module loader per story file, wrapped in a variant test session.
 *
 * Kept free of module resolution (which needs a real install layout) so the
 * generated source can be exercised on its own.
 */
export function buildTestHarnessSource({ variantTestSessionId, files }: TestHarnessOptions) {
  // The harness runs one Vitest pass per story: no hot update can invalidate a
  // module mid-run, so the plain (bundler-analyzable) loaders are enough.
  const loaders = buildStoryModuleLoaders(files)

  return `
import 'virtual:$histoire-theme'
import { createVariantTestSession } from ${JSON.stringify(variantTestSessionId)}

const files = ${JSON.stringify(files)}
const moduleLoaders = {
  ${loaders.join(',\n  ')}
}

globalThis.vi ??= {}
globalThis.vitest ??= globalThis.vi

${VITEST_DYNAMIC_IMPORT_SNIPPET}

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

/**
 * Virtual module factory for `virtual:$histoire-test-harness`.
 * @param ctx Histoire context holding the collected story files.
 */
export function testHarness(ctx: Context) {
  return buildTestHarnessSource({
    variantTestSessionId: require.resolve('./variant-test-session/index.js'),
    files: getRuntimeStoryFiles(ctx),
  })
}
