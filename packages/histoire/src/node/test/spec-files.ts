import type { ServerStoryFile } from '@histoire/shared'
import type { GeneratedSpecFile } from './types.js'
import fs from 'fs-extra'
import { join } from 'pathe'
import { assertNoDuplicateTempPaths, toTempPathSegment } from '../util/temp-paths.js'
import { TEST_HARNESS_ID } from '../virtual/index.js'

/**
 * Writes one Vitest spec file per collected variant.
 * @param storyFiles Collected story files that registered tests.
 * @param root Directory owned by the current run.
 * @param mode Collection stores definitions in inert task metadata; run executes assertions.
 */
export async function generateSpecFiles(storyFiles: ServerStoryFile[], root: string, mode: 'run' | 'collect' = 'run'): Promise<GeneratedSpecFile[]> {
  await fs.emptyDir(root)
  const results: GeneratedSpecFile[] = []

  for (const storyFile of storyFiles) {
    if (!storyFile.story) continue

    for (const variant of storyFile.story.variants) {
      // The segment carries a hash of the RAW variant id: two ids that sanitize
      // to the same name would otherwise overwrite each other on disk and one
      // variant's results would be silently dropped while the run reports `ok`.
      const specPath = join(
        root,
        storyFile.relativePath.replace(/\.[^.]+$/, ''),
        `${toTempPathSegment(variant.id)}.histoire.spec.ts`,
      )
      await fs.ensureDir(join(specPath, '..'))
      await fs.writeFile(specPath, mode === 'collect' ? generateCollectionSpecCode(storyFile.story.id, variant.id) : generateSpecCode(storyFile.story.id, variant.id, storyFile.story.title, variant.title), 'utf8')
      results.push({
        path: specPath,
        storyId: storyFile.story.id,
        variantId: variant.id,
      })
    }
  }

  // Defense in depth: a duplicate generated path means two variants collided and
  // one would clobber the other (both on disk and in the path-keyed summary map).
  assertNoDuplicateTempPaths(
    results.map(spec => ({ path: spec.path, label: `variant "${spec.storyId}:${spec.variantId}"` })),
    'spec',
  )

  return results
}

/** Inert task metadata carries exact definitions through Vitest's collection reporting. */
function generateCollectionSpecCode(storyId: string, variantId: string): string {
  return `import { test } from '@vitest/runner'
import { serializeTestErrors } from '@histoire/shared'
import { collectVariantTests } from ${JSON.stringify(TEST_HARNESS_ID)}

let collection
try {
  collection = { definitions: await collectVariantTests(${JSON.stringify(storyId)}, ${JSON.stringify(variantId)}) }
}
catch (error) {
  collection = { definitions: [], error: serializeTestErrors([error])[0] }
}
// Runtime collection reads metadata; this callback never executes.
test('Histoire test collection', { meta: { histoireCollection: collection } }, () => {})
`
}

/**
 * Generates the spec running every test a variant collected.
 *
 * Imports `@vitest/runner` rather than `vitest`: the story runs inside
 * Histoire's own harness, and the definitions (including their
 * `.only`/`.skip`/`.todo` mode) come from the collection.
 */
function generateSpecCode(storyId: string, variantId: string, storyTitle: string, variantTitle: string) {
  return `import { describe, test } from '@vitest/runner'
import { collectVariantTests, runCollectedTest } from ${JSON.stringify(TEST_HARNESS_ID)}

const definitions = await collectVariantTests(${JSON.stringify(storyId)}, ${JSON.stringify(variantId)})

describe(${JSON.stringify(`${storyTitle} > ${variantTitle}`)}, () => {
  for (const definition of definitions) {
    if (definition.mode === 'todo') {
      test.todo(definition.fullName)
      continue
    }

    const testFn = definition.mode === 'only' ? test.only : definition.mode === 'skip' ? test.skip : test
    testFn(definition.fullName, async () => {
      await runCollectedTest(${JSON.stringify(storyId)}, ${JSON.stringify(variantId)}, definition)
    // Embedded runtime owns body and hook deadlines. A second outer deadline
    // races it, duplicates failures, and can preempt a valid longer test.
    }, 0)
  }
})
`
}
