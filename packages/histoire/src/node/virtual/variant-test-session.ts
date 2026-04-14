import type {
  HistoireSerializedTestDefinition,
  HistoireTestDefinition,
  HistoireTestRegistration,
  ServerStory,
  StoryFile,
} from '@histoire/shared'
import { collectHistoireTests, createHistoireTestSummary, serializeTestDefinitions, serializeTestError } from '@histoire/shared'
import { mapStoryFile } from './map-story-file.js'
import { bootstrapVariant, mountRenderVariant } from './variant-test-mount.js'

const TEST_REGISTRY_KEY = '__HST_TEST_REGISTRY__'
const TEST_FLAG_KEY = '__HST_TEST__'

interface SerializedStoryFile {
  id: string
  path: string[]
  filePath: string
  docsFilePath?: string
  supportPluginId: string
  story: ServerStory
  moduleId: string
}

interface ImportedStoryModule {
  component: any
  definitions: HistoireTestRegistration[]
  file: SerializedStoryFile
}

interface VariantTestSessionOptions {
  files: SerializedStoryFile[]
  moduleLoaders: Record<string, () => Promise<any>>
  runWithDynamicImport: (loader: () => Promise<any>) => Promise<any>
  ensureEnvironment?: () => Promise<void> | void
}

export function createVariantTestSession(options: VariantTestSessionOptions) {
  const importedStoryCache = new Map<string, ImportedStoryModule>()

  /**
   * Clears the cached imported story module for a specific story so the next
   * collection or run observes the latest HMR-updated module instance.
   */
  function invalidateStory(storyId: string) {
    importedStoryCache.delete(storyId)
  }

  async function loadImportedStory(storyId: string, { useCache = true } = {}) {
    await options.ensureEnvironment?.()

    if (useCache && importedStoryCache.has(storyId)) {
      return importedStoryCache.get(storyId)!
    }

    const file = getSerializedFile(options.files, storyId)
    const loadModule = options.moduleLoaders[storyId]
    if (!loadModule) {
      throw new Error(`Missing histoire story module loader for "${storyId}"`)
    }

    const definitions: HistoireTestRegistration[] = []
    let component: any

    await withRegistry(definitions, true, async () => {
      const module = await options.runWithDynamicImport(loadModule)
      component = module.default
    })

    const result = {
      component,
      definitions: definitions.slice(),
      file,
    }

    if (useCache) {
      importedStoryCache.set(storyId, result)
    }

    return result
  }

  async function createSessionStoryFile(storyId: string) {
    const imported = await loadImportedStory(storyId)

    return {
      file: mapStoryFile({
        ...imported.file,
        component: imported.component,
        source: async () => ({ default: '' }),
      }) as StoryFile,
      importedDefinitions: imported.definitions.slice(),
    }
  }

  async function collectVariantTests(storyId: string, variantId: string): Promise<HistoireSerializedTestDefinition[]> {
    const session = await createVariantSession(storyId, variantId)

    try {
      return serializeTestDefinitions(session.definitions)
    }
    finally {
      session.cleanup()
    }
  }

  async function runCollectedTest(storyId: string, variantId: string, definition: HistoireSerializedTestDefinition) {
    const session = await createVariantSession(storyId, variantId)

    try {
      const currentDefinition = getDefinitionById(session.definitions, definition.id)

      if (!currentDefinition?.handler) {
        throw new Error(`Could not resolve histoire test "${definition.fullName}" for ${storyId}:${variantId}`)
      }

      await currentDefinition.handler()
    }
    finally {
      session.cleanup()
    }
  }

  async function runVariantTests(storyId: string, variantId: string) {
    const session = await createVariantSession(storyId, variantId)
    const results = []

    try {
      const workerState = (globalThis as typeof globalThis & {
        __vitest_worker__?: any
      }).__vitest_worker__

      for (const [index, definition] of session.definitions.entries()) {
        const previousCurrent = workerState?.current

        if (workerState) {
          workerState.filepath = session.file.story.file?.filePath ?? session.file.filePath
          workerState.current = {
            id: `${storyId}:${variantId}:${index}`,
            type: 'test',
            name: definition.fullName,
            file: {
              filepath: session.file.story.file?.filePath ?? session.file.filePath,
              name: session.file.story.title,
            },
            onFinished: [],
          }
        }

        try {
          if (!definition.handler) {
            throw new Error(`Could not resolve histoire test "${definition.fullName}" for ${storyId}:${variantId}`)
          }

          await definition.handler()
          await Promise.all(workerState?.current?.onFinished ?? [])
          results.push({
            id: definition.id,
            name: definition.name,
            fullName: definition.fullName,
            state: 'passed',
            errors: [],
          })
        }
        catch (error) {
          results.push({
            id: definition.id,
            name: definition.name,
            fullName: definition.fullName,
            state: 'failed',
            errors: [serializeTestError(error)],
          })
        }
        finally {
          if (workerState) {
            workerState.current = previousCurrent
          }
        }
      }

      return createHistoireTestSummary(storyId, variantId, results)
    }
    finally {
      session.cleanup()
    }
  }

  async function createVariantSession(storyId: string, variantId: string) {
    const { file, importedDefinitions } = await createSessionStoryFile(storyId)
    const bootstrap = await bootstrapVariant(file, variantId, withRegistry)

    try {
      const rendered = await mountRenderVariant(file, variantId, withRegistry)
      const definitions = dedupeCollectedTestDefinitions(collectHistoireTests(
        mergeRegistrations(importedDefinitions, bootstrap.registrations, rendered.registrations),
        {
          story: rendered.story,
          variant: rendered.variant,
          canvas: rendered.canvas,
        },
      ))

      return {
        file,
        definitions,
        cleanup() {
          rendered.cleanup()
          bootstrap.cleanup()
        },
      }
    }
    catch (error) {
      bootstrap.cleanup()
      throw error
    }
  }

  return {
    collectVariantTests,
    invalidateStory,
    runCollectedTest,
    runVariantTests,
  }
}

function getSerializedFile(files: SerializedStoryFile[], storyId: string) {
  const file = files.find(item => item.id === storyId)
  if (!file) {
    throw new Error(`Unknown histoire story "${storyId}"`)
  }
  return file
}

function withRegistry(registry: HistoireTestRegistration[], testing: boolean, fn: () => Promise<void> | void) {
  const previousRegistry = (globalThis as any)[TEST_REGISTRY_KEY]
  const previousFlag = (globalThis as any)[TEST_FLAG_KEY]
  ;(globalThis as any)[TEST_REGISTRY_KEY] = registry
  ;(globalThis as any)[TEST_FLAG_KEY] = testing
  return Promise.resolve().then(fn).finally(() => {
    ;(globalThis as any)[TEST_REGISTRY_KEY] = previousRegistry
    ;(globalThis as any)[TEST_FLAG_KEY] = previousFlag
  })
}

function mergeRegistrations(...groups: HistoireTestRegistration[][]) {
  const result: HistoireTestRegistration[] = []
  const seen = new Set<HistoireTestRegistration>()

  for (const group of groups) {
    for (const registration of group) {
      if (!seen.has(registration)) {
        seen.add(registration)
        result.push(registration)
      }
    }
  }

  return result
}

/**
 * Removes semantically duplicated tests emitted when the same story setup runs
 * once during bootstrap mounting and again during render mounting.
 */
function dedupeCollectedTestDefinitions(definitions: HistoireTestDefinition[]) {
  const result: HistoireTestDefinition[] = []
  const seen = new Set<string>()

  for (const definition of definitions) {
    const key = `${definition.fullName}\n${definition.handler?.toString() ?? ''}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push({
      ...definition,
      id: String(result.length),
    })
  }

  return result
}

function getDefinitionById(definitions: HistoireTestDefinition[], id: string) {
  return definitions.find(definition => definition.id === id)
}
